<?php

namespace App\Support;

use App\Models\GameMatch;
use App\Models\RegistrationLink;
use App\Models\Team;
use App\Models\Tournament;
use Illuminate\Support\Collection;

/**
 * Where a tournament actually is right now, for any card that shows one.
 *
 * The stored status is set to registration_open at creation and nothing moves
 * it on, so cards kept saying "Registration open" through the deadline and the
 * matches. This reads the real signals instead: matches being scored or
 * played, the registration deadline (the same rule the registration page
 * enforces) and whether the entry list is full.
 */
class TournamentStage
{
    /** A match someone is scoring right now (same set as MatchController's live ticker). */
    public const LIVE_MATCH_STATUSES = ['in_progress', 'half_time', 'innings_break', 'drinks_break'];

    /**
     * Stage per tournament id, in three queries whatever the list size.
     *
     * @param  Collection<int, Tournament>  $tournaments
     * @return array<string, string>
     */
    public static function forMany(Collection $tournaments): array
    {
        $ids = $tournaments->pluck('id');

        $entered = Team::query()->whereIn('tournament_id', $ids)->where('status', '!=', 'withdrawn')
            ->selectRaw('tournament_id, count(*) as n')->groupBy('tournament_id')->pluck('n', 'tournament_id');
        $links = RegistrationLink::query()->whereIn('tournament_id', $ids)->get()->keyBy('tournament_id');
        $matches = GameMatch::query()->whereIn('tournament_id', $ids)->get(['tournament_id', 'status'])->groupBy('tournament_id');

        $stages = [];
        foreach ($tournaments as $tournament) {
            $stages[$tournament->id] = self::of(
                $tournament,
                (int) ($entered[$tournament->id] ?? 0),
                $links->get($tournament->id),
                $matches->get($tournament->id)?->pluck('status') ?? collect(),
            );
        }

        return $stages;
    }

    /** @param  Collection<int, string>  $matchStatuses */
    private static function of(Tournament $tournament, int $entered, ?RegistrationLink $link, Collection $matchStatuses): string
    {
        if (in_array($tournament->status, ['draft', 'cancelled', 'completed'], true)) {
            return $tournament->status;
        }
        if ($matchStatuses->intersect(self::LIVE_MATCH_STATUSES)->isNotEmpty()) {
            return 'live';
        }
        if ($matchStatuses->intersect(['completed', 'abandoned'])->isNotEmpty()) {
            return $matchStatuses->diff(['completed', 'abandoned', 'cancelled'])->isEmpty() ? 'matches_finished' : 'ongoing';
        }
        if ($link?->status === 'disabled' || RegistrationWindow::closedReason($tournament, $link) !== null) {
            return $matchStatuses->isNotEmpty() ? 'fixtures_ready' : 'registration_closed';
        }
        if ($tournament->max_teams && $entered >= $tournament->max_teams) {
            return 'teams_full';
        }

        return 'registration_open';
    }
}
