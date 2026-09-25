<?php

namespace App\Providers;

use App\Models\AuditLog;
use App\Models\GameMatch;
use App\Models\Notification;
use App\Models\NotificationOptOut;
use App\Models\Organization;
use App\Models\PasswordReset;
use App\Models\Plan;
use App\Models\PlatformSetting;
use App\Models\Review;
use App\Models\RevokedToken;
use App\Models\Sport;
use App\Models\Tournament;
use App\Support\Cached;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

/**
 * Invalidates `Cached` scopes off Eloquent's own save/delete events, so no
 * write path can forget to — a new controller or service is covered the day
 * it is written. The scope is read off the record itself: its
 * `tournament_id` (or its match's), its `organization_id`, or, for the
 * platform catalogue, its class.
 */
class CacheServiceProvider extends ServiceProvider
{
    /** Written constantly and never shown by a cached endpoint. */
    private const IGNORED = [
        AuditLog::class,
        Notification::class,
        NotificationOptOut::class,
        PasswordReset::class,
        RevokedToken::class,
    ];

    private const PLATFORM = [Plan::class, Sport::class, PlatformSetting::class, Review::class];

    /** match id => tournament id; a match never changes tournament. */
    private array $matchTournaments = [];

    public function boot(): void
    {
        foreach (['saved', 'deleted'] as $event) {
            Event::listen("eloquent.$event: *", function (string $name, array $payload) {
                if (! Cached::enabled() || ! $payload[0] instanceof Model || ! $scopes = $this->scopesOf($payload[0])) {
                    return;
                }

                // After commit: flushed mid-transaction, a concurrent read could
                // cache the pre-commit rows under the new version.
                DB::afterCommit(fn () => Cached::flush(...$scopes));
            });
        }
    }

    /** @return array<int, string> */
    private function scopesOf(Model $model): array
    {
        if (in_array($model::class, self::IGNORED, true)) {
            return [];
        }

        if (in_array($model::class, self::PLATFORM, true)) {
            return ['platform'];
        }

        $scopes = [];

        if ($model instanceof Tournament) {
            $scopes[] = Cached::tournament($model->getKey());
        }

        if ($model instanceof Organization) {
            $scopes[] = Cached::org($model->getKey());

            // A suspended club's review leaves the landing page with it.
            if (! $model->exists || $model->wasChanged('status')) {
                $scopes[] = 'platform';
            }
        }

        foreach (array_filter([$model->getAttribute('tournament_id'), $model->getOriginal('tournament_id')]) as $id) {
            $scopes[] = Cached::tournament($id);
        }

        if ($matchId = $model->getAttribute('match_id')) {
            $this->matchTournaments[$matchId] ??= GameMatch::query()->whereKey($matchId)->value('tournament_id');

            if ($this->matchTournaments[$matchId]) {
                $scopes[] = Cached::tournament($this->matchTournaments[$matchId]);
            }
        }

        if ($orgId = $model->getAttribute('organization_id')) {
            $scopes[] = Cached::org($orgId);
        }

        return $scopes;
    }
}
