<?php

namespace App\Services\Notifications;

use App\Models\User;
use App\Models\UserNotification;
use App\Support\Ids;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * The bell: one feed item per recipient who has an account.
 *
 * Called from `NotificationService::dispatch()`, so every event that texts
 * someone also reaches them in the app — and, unlike WhatsApp and SMS, this
 * needs no gateway, which is exactly when it matters most. It obeys the same
 * master switch and per-club event switches; phone opt-outs are about a
 * phone and do not apply to an account's own feed.
 *
 * Like the rest of the engine, nothing here throws into the caller.
 */
class InAppNotifier
{
    /**
     * @param  array<int, array<string, mixed>>  $recipients  as passed to dispatch(); `user_id` is what is read
     * @param  array<string, mixed>  $data
     * @return int  items written
     */
    public function record(
        string $event,
        array $recipients,
        array $data,
        string $body,
        ?string $organizationId,
        string $relatedType,
        string $relatedId,
        ?string $dedupeKey,
    ): int {
        $entry = NotificationCatalog::inApp($event, $data);

        if (! $entry) {
            return 0;
        }

        $userIds = collect($recipients)
            ->pluck('user_id')
            ->filter(fn ($id) => is_string($id) && $id !== '')
            ->unique()
            ->values();

        if ($userIds->isEmpty()) {
            return 0;
        }

        // Only accounts that still exist: a team's linked manager can be
        // deleted, and the foreign key would refuse the row anyway.
        $existing = User::query()->whereIn('id', $userIds)->pluck('id');
        $written = 0;

        foreach ($existing as $userId) {
            try {
                UserNotification::create([
                    'id' => Ids::unique('unote'),
                    'user_id' => $userId,
                    'organization_id' => $organizationId,
                    'event' => $event,
                    'title' => Str::limit($entry['title'], 180),
                    'body' => $body,
                    'link' => $entry['link'],
                    'related_type' => $relatedType,
                    'related_id' => $relatedId,
                    'dedupe_key' => $dedupeKey ? $dedupeKey.':u:'.$userId : null,
                ]);
                $written++;
            } catch (QueryException $e) {
                // A refused dedupe key is the sweep repeating itself — fine.
                if (! $dedupeKey) {
                    Log::warning('notification.in_app_write_failed', ['error' => $e->getMessage()]);
                }
            }
        }

        return $written;
    }
}
