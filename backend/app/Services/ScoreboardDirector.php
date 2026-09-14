<?php

namespace App\Services;

use App\Models\Advertisement;
use App\Models\Announcement;
use App\Models\GameMatch;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * What the stadium display is currently showing, and who decides it.
 *
 * Before this the big screen inferred its segment from `match.status` alone,
 * which left the organizer no way to hold on the squad reveal or replay the
 * toss. The choice is stored on the match rather than only broadcast, because
 * a display that reloads mid-segment (or a second screen switched on late) has
 * to land back where the organizer put it.
 *
 * `auto` is the default and reproduces the old behaviour exactly — pre-match
 * shows the toss, everything else shows the live scoreline — so a match nobody
 * directs still works.
 */
class ScoreboardDirector
{
    public const STAGES = ['auto', 'toss', 'lineups', 'live', 'scorecard', 'ad', 'announcement'];

    /**
     * Stages that put one of the match's own ads or announcements on the whole
     * screen. They carry an item and, unless its duration is 0, run out.
     */
    public const ITEM_STAGES = ['ad', 'announcement'];

    /**
     * Seconds each player holds the screen during the squad reveal. The
     * display derives its own position from this, so it must match
     * `LINEUP_REVEAL_MS` in the client.
     */
    public const REVEAL_INTERVAL_SECONDS = 3;

    /**
     * Point the display at a segment.
     *
     * `$cursor` only means anything for `lineups`: -1 plays the reveal from
     * now, and any other value freezes it on that many players.
     *
     * `$itemId` is required for `ad` and `announcement`, and must be one of
     * this match's own — another match's creative never reaches this screen.
     *
     * @throws \RuntimeException when the stage isn't one this display knows
     */
    public function setStage(string $matchId, string $stage, ?int $cursor = null, ?string $itemId = null): GameMatch
    {
        if (! in_array($stage, self::STAGES, true)) {
            throw new \RuntimeException('Unknown scoreboard stage');
        }

        return DB::transaction(function () use ($matchId, $stage, $cursor, $itemId) {
            $match = GameMatch::query()->whereKey($matchId)->lockForUpdate()->first();

            if (! $match) {
                throw new \RuntimeException('Match not found');
            }

            $isItemStage = in_array($stage, self::ITEM_STAGES, true);

            if ($isItemStage && (! $itemId || ! $this->findItem($stage, $itemId, $match->id))) {
                throw new \RuntimeException(
                    $stage === 'ad' ? 'That ad does not belong to this match' : 'That announcement does not belong to this match'
                );
            }

            $match->scoreboard_stage = $stage;
            $match->scoreboard_cursor = $cursor ?? -1;
            $match->scoreboard_item_id = $isItemStage ? $itemId : null;
            $match->scoreboard_stage_at = now();
            $match->save();

            return $match;
        });
    }

    /**
     * Hand the display back to the live scoreline when play starts.
     *
     * Called on every scoring action: a pre-match segment, an ad or an
     * announcement left on screen would otherwise hide the play behind it. An
     * organizer who has already sent the screen to the live score is left alone.
     *
     * Returns the match only when something actually changed, so the caller
     * knows whether a broadcast is worth sending.
     */
    public function returnToLive(GameMatch $match): ?GameMatch
    {
        if (! in_array($match->scoreboard_stage, ['toss', 'lineups', 'scorecard', ...self::ITEM_STAGES], true)) {
            return null;
        }

        return $this->setStage($match->id, 'auto');
    }

    /**
     * The segment the display should actually render, resolving `auto` against
     * the match's own status. An ad or announcement that has run its time, or
     * been deleted while on screen, resolves as `auto` too.
     */
    public function resolve(GameMatch $match): string
    {
        $stage = $this->effectiveStage($match);

        if ($stage !== 'auto') {
            return $stage;
        }

        if ($match->status === 'scheduled') {
            return 'toss';
        }

        // Between innings and at full time the crowd wants the whole card, not
        // the two batters who are no longer out there. Cricket only: a football
        // match's final score already says everything a card would.
        if ($match->sport_code === 'cricket' && in_array($match->status, ['innings_break', 'completed'], true)) {
            return 'scorecard';
        }

        return 'live';
    }

    /**
     * The stage block sent to both the scorer console and the display, on the
     * match payload and on every stage broadcast.
     *
     * @return array<string, mixed>
     */
    public function payload(GameMatch $match): array
    {
        $stage = $this->effectiveStage($match);
        $item = in_array($stage, self::ITEM_STAGES, true) ? $this->currentItem($match) : null;

        return [
            'match_id' => $match->id,
            'stage' => $stage,
            'resolved_stage' => $this->resolve($match),
            'cursor' => $match->scoreboard_cursor ?? -1,
            'stage_at' => $match->scoreboard_stage_at,
            'reveal_interval_seconds' => self::REVEAL_INTERVAL_SECONDS,
            // The ad or announcement on screen, sent whole so the display
            // needs no second request, and when it comes off (null = held).
            'item_id' => $item?->id,
            'item' => $item,
            'ends_at' => $item ? $this->endsAt($match, $item)?->toIso8601String() : null,
        ];
    }

    /**
     * The stored stage, except that an ad or announcement which has run its
     * time or no longer exists counts as `auto`. Worked out on read rather than
     * by a timer, so every screen agrees without anything having to fire.
     */
    private function effectiveStage(GameMatch $match): string
    {
        $stage = $match->scoreboard_stage ?: 'auto';

        if (! in_array($stage, self::ITEM_STAGES, true)) {
            return $stage;
        }

        $item = $this->currentItem($match);

        if (! $item) {
            return 'auto';
        }

        $endsAt = $this->endsAt($match, $item);

        return $endsAt && $endsAt->isPast() ? 'auto' : $stage;
    }

    private function currentItem(GameMatch $match): Advertisement|Announcement|null
    {
        if (! $match->scoreboard_item_id) {
            return null;
        }

        return $this->findItem($match->scoreboard_stage, $match->scoreboard_item_id, $match->id);
    }

    private function findItem(string $stage, string $itemId, string $matchId): Advertisement|Announcement|null
    {
        $model = $stage === 'ad' ? Advertisement::class : Announcement::class;

        return $model::query()->whereKey($itemId)->where('match_id', $matchId)->first();
    }

    /**
     * Read from the item rather than copied when it went up, so changing its
     * time from the scorer console takes effect on the screen showing it.
     */
    private function endsAt(GameMatch $match, Advertisement|Announcement $item): ?Carbon
    {
        $seconds = (int) $item->duration_seconds;

        if ($seconds <= 0 || ! $match->scoreboard_stage_at) {
            return null;
        }

        return $match->scoreboard_stage_at->copy()->addSeconds($seconds);
    }
}
