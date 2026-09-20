<?php

namespace App\Services\Notifications;

use App\Jobs\SendNotification;
use App\Models\Notification;
use App\Models\NotificationOptOut;
use App\Models\Organization;
use App\Services\Notifications\Channels\ChannelManager;
use App\Services\Notifications\Channels\DeliveryResult;
use App\Support\Ids;
use App\Support\Phone;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;

/**
 * Queues and sends the platform's WhatsApp and SMS messages.
 *
 * Two halves. `dispatch()` decides whether a message should exist and writes the
 * row; `deliver()` hands one row to a driver and records what happened. They are
 * separate because the first runs inside a web request — approving a team,
 * recording a payment — and must never be slowed or broken by a gateway, while
 * the second runs on the queue where waiting is fine.
 *
 * Nothing here throws into its caller. A notification is a side effect of the
 * thing the organizer actually asked for, and a gateway outage must not fail an
 * approval or lose a payment. Same rule as RealtimeBroadcaster.
 */
class NotificationService
{
    public function __construct(private readonly ChannelManager $channels) {}

    /**
     * Write and queue one message per recipient, returning the rows created.
     *
     * Recipients are `['name' => ..., 'phone' => ..., 'role' => ...]`. A
     * recipient with no dialable number, or one that has opted out, is recorded
     * as skipped rather than silently dropped.
     *
     * @param  array<int, array{name?: string, phone?: ?string, whatsapp?: ?string, role?: string}>  $recipients
     * @param  array<string, mixed>  $data
     * @return array<int, Notification>
     */
    public function dispatch(
        string $event,
        array $recipients,
        array $data = [],
        ?string $organizationId = null,
        string $relatedType = '',
        string $relatedId = '',
        ?string $dedupeKey = null,
    ): array {
        if (! NotificationCatalog::exists($event)) {
            Log::warning('notification.unknown_event', ['event' => $event]);

            return [];
        }

        if (! config('notifications.enabled')) {
            return [];
        }

        if (! $this->enabledFor($organizationId, $event)) {
            return [];
        }

        $body = NotificationCatalog::render($event, $data);

        if (trim($body) === '') {
            return [];
        }

        $channel = NotificationCatalog::channel($event);
        $created = [];

        foreach ($recipients as $index => $recipient) {
            // WhatsApp goes to the WhatsApp number when one is on file, and
            // falls back to the plain phone — they are the same number far more
            // often than not, and a blank WhatsApp field should not mean silence.
            $to = $channel === 'whatsapp'
                ? Phone::first($recipient['whatsapp'] ?? null, $recipient['phone'] ?? null)
                : Phone::first($recipient['phone'] ?? null, $recipient['whatsapp'] ?? null);

            // One dedupe key covers the whole dispatch, so each recipient needs
            // its own suffix or only the first of them would be written.
            $key = $dedupeKey ? $dedupeKey.':'.($to ?? 'r'.$index) : null;

            $notification = $this->write([
                'organization_id' => $organizationId,
                'event' => $event,
                'channel' => $channel,
                'recipient_name' => (string) ($recipient['name'] ?? ''),
                'recipient_role' => (string) ($recipient['role'] ?? NotificationCatalog::audience($event)),
                'to' => $to ?? '',
                'body' => $body,
                'status' => $this->initialStatus($to),
                'error' => $this->initialError($to),
                'related_type' => $relatedType,
                'related_id' => $relatedId,
                'dedupe_key' => $key,
            ]);

            if (! $notification) {
                continue;
            }

            $created[] = $notification;

            if ($notification->status === 'queued') {
                SendNotification::dispatch($notification->id);
            }
        }

        return $created;
    }

    /**
     * Try to send one stored message and record the outcome.
     *
     * Called from the queue. A failure leaves the row `failed` with the reason
     * on it, ready for `notifications:retry` if the driver thought it was worth
     * another go.
     */
    public function deliver(Notification $notification): Notification
    {
        if (! $notification->isSendable()) {
            return $notification;
        }

        // Opting out between queueing and sending has to be honoured — a
        // reminder queued last night must not go out this morning to someone
        // who asked to be left alone since.
        if ($this->hasOptedOut($notification->to)) {
            return $this->finish($notification, 'skipped', error: 'Recipient has opted out');
        }

        $notification->attempts = $notification->attempts + 1;

        try {
            $driver = $this->channels->for($notification->channel);
            $notification->driver = $driver->key();
            $result = $driver->send($notification);
        } catch (\Throwable $e) {
            // A driver that throws is a broken driver, not a refused message.
            // Treat it as retryable and keep the reason.
            $result = DeliveryResult::failed('Driver error: '.$e->getMessage());
        }

        if ($result->delivered) {
            return $this->finish($notification, 'sent', reference: $result->reference);
        }

        // A rejection will never succeed, so it is not left looking retryable.
        return $this->finish(
            $notification,
            $result->retryable ? 'failed' : 'skipped',
            error: $result->error,
        );
    }

    /** Messages worth another attempt, oldest first. */
    public function retryable(int $limit = 100): \Illuminate\Support\Collection
    {
        return Notification::query()
            ->where('status', 'failed')
            ->where('attempts', '<', (int) config('notifications.max_attempts'))
            ->where('to', '!=', '')
            ->orderBy('created_at')
            ->limit($limit)
            ->get();
    }

    public function optOut(string $phone, ?string $organizationId = null, string $reason = ''): ?NotificationOptOut
    {
        $normalized = Phone::normalize($phone);

        if (! $normalized) {
            return null;
        }

        return NotificationOptOut::query()->updateOrCreate(
            ['phone' => $normalized],
            ['organization_id' => $organizationId, 'reason' => $reason, 'created_at' => now()],
        );
    }

    public function optIn(string $phone): void
    {
        if ($normalized = Phone::normalize($phone)) {
            NotificationOptOut::query()->whereKey($normalized)->delete();
        }
    }

    public function hasOptedOut(?string $phone): bool
    {
        $normalized = Phone::normalize($phone);

        return $normalized !== null && NotificationOptOut::query()->whereKey($normalized)->exists();
    }

    /**
     * Whether this organizer sends this event, falling back to the defaults in
     * config. A missing organization means a platform-level message, which is
     * not an organizer's to switch off.
     */
    public function enabledFor(?string $organizationId, string $event): bool
    {
        $default = (bool) (config('notifications.defaults')[$event] ?? false);

        if (! $organizationId) {
            return $default;
        }

        $settings = Organization::query()->whereKey($organizationId)->value('notification_settings');
        $settings = is_array($settings) ? $settings : [];

        if (($settings['enabled'] ?? true) === false) {
            return false;
        }

        $events = is_array($settings['events'] ?? null) ? $settings['events'] : [];

        return (bool) ($events[$event] ?? $default);
    }

    /**
     * The settings an organizer sees: every event, whether it is on for them,
     * and what it is for.
     *
     * @return array<string, mixed>
     */
    public function settingsFor(string $organizationId): array
    {
        $stored = Organization::query()->whereKey($organizationId)->value('notification_settings');
        $stored = is_array($stored) ? $stored : [];

        $events = [];

        foreach (NotificationCatalog::describe() as $definition) {
            $events[] = [
                ...$definition,
                'enabled' => $this->enabledFor($organizationId, $definition['event']),
            ];
        }

        return [
            'enabled' => ($stored['enabled'] ?? true) !== false,
            'sender_name' => (string) ($stored['sender_name'] ?? ''),
            'events' => $events,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function updateSettingsFor(string $organizationId, array $input): array
    {
        $organization = Organization::query()->findOrFail($organizationId);
        $stored = is_array($organization->notification_settings) ? $organization->notification_settings : [];

        $events = is_array($stored['events'] ?? null) ? $stored['events'] : [];

        foreach ((array) ($input['events'] ?? []) as $event => $on) {
            // Only events that exist, so a stale client cannot fill the column
            // with keys nothing will ever read.
            if (NotificationCatalog::exists((string) $event)) {
                $events[(string) $event] = (bool) $on;
            }
        }

        $organization->notification_settings = [
            'enabled' => array_key_exists('enabled', $input)
                ? (bool) $input['enabled']
                : ($stored['enabled'] ?? true) !== false,
            'sender_name' => array_key_exists('sender_name', $input)
                ? trim((string) $input['sender_name'])
                : (string) ($stored['sender_name'] ?? ''),
            'events' => $events,
        ];
        $organization->save();

        return $this->settingsFor($organizationId);
    }

    /* ------------------------------------------------------------- Internals */

    private function initialStatus(?string $to): string
    {
        if (! $to) {
            return 'skipped';
        }

        return $this->hasOptedOut($to) ? 'skipped' : 'queued';
    }

    private function initialError(?string $to): ?string
    {
        if (! $to) {
            return 'No usable phone number on file';
        }

        return $this->hasOptedOut($to) ? 'Recipient has opted out' : null;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function write(array $attributes): ?Notification
    {
        try {
            return Notification::create(['id' => Ids::unique('notif'), ...$attributes]);
        } catch (QueryException $e) {
            // The unique `dedupe_key` refusing a duplicate is the mechanism
            // working: the sweep has already sent this one. Anything else is a
            // real database problem and is worth knowing about, but still not
            // worth failing the organizer's request over.
            if (! $attributes['dedupe_key']) {
                Log::warning('notification.write_failed', ['error' => $e->getMessage()]);
            }

            return null;
        }
    }

    private function finish(Notification $notification, string $status, ?string $reference = null, ?string $error = null): Notification
    {
        $notification->status = $status;
        $notification->provider_reference = $reference;
        $notification->error = $error;
        $notification->sent_at = $status === 'sent' ? now() : null;
        $notification->save();

        return $notification;
    }
}
