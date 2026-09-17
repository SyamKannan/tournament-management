<?php

namespace App\Services;

use App\Models\GameMatch;
use App\Models\MatchLineup;
use App\Models\Player;
use App\Models\Tournament;
use App\Support\Ids;
use Illuminate\Support\Facades\DB;

/**
 * Per-match team sheets: who is actually playing, in what order.
 *
 * The squad in `players` is the whole tournament roster; this narrows it to
 * one fixture and orders it. That order does double duty — it's the batting
 * card the scorer works down, and the sequence the big screen reveals players
 * in after the toss.
 *
 * Reading never writes. A match with no saved lineup returns a sensible
 * default built from the roster (rows with a null `id`), so the scoreboard and
 * the reveal work out of the box and saving is only needed to depart from it.
 */
class LineupService
{
    /**
     * Default team-sheet size when the tournament doesn't say otherwise.
     */
    private const DEFAULT_PLAYING_COUNT = 11;

    /**
     * Every lineup row for the match, in big-screen reveal order: the side
     * batting first leads, then their opponents, each by batting order.
     *
     * @return array<int, array<string, mixed>>
     */
    public function forMatch(GameMatch $match): array
    {
        $saved = MatchLineup::query()
            ->where('match_id', $match->id)
            ->get()
            ->groupBy('team_id');

        // A team sheet is read by stadium screens and the public hub, and a
        // phone number is no part of one — drop them before they can travel.
        $players = Player::query()
            ->whereIn('team_id', [$match->team_a_id, $match->team_b_id])
            ->get()
            ->each(fn (Player $player) => $player->makeHidden(['mobile', 'dob']))
            ->groupBy('team_id');

        $rows = [];
        $playingCount = $this->defaultPlayingCount($match);

        foreach ($this->revealTeamOrder($match) as $teamId) {
            $teamPlayers = $players->get($teamId) ?? collect();
            $teamSaved = $saved->get($teamId);

            $rows = array_merge(
                $rows,
                $teamSaved && $teamSaved->isNotEmpty()
                    ? $this->savedRows($teamSaved, $teamPlayers)
                    : $this->defaultRows($match->id, $teamId, $teamPlayers, $playingCount),
            );
        }

        return $rows;
    }

    /**
     * How many start by default: the number in a football tournament's format
     * ("7-a-side" → 7), eleven otherwise. A sevens side defaulted to eleven
     * starters had four bench players marked as on the pitch.
     */
    private function defaultPlayingCount(GameMatch $match): int
    {
        if ($match->sport_code !== 'football') {
            return self::DEFAULT_PLAYING_COUNT;
        }

        $format = (string) (Tournament::find($match->tournament_id)?->settings['football_format'] ?? '');

        return preg_match('/^(\d+)\s*-?\s*a\s*-?\s*side/i', $format, $found) && (int) $found[1] > 0
            ? (int) $found[1]
            : self::DEFAULT_PLAYING_COUNT;
    }

    /**
     * Replace one team's sheet. Sent whole rather than patched per player, so
     * dropping someone from the XI is just leaving them out of the payload.
     *
     * @param  array<int, array{player_id: string, batting_order?: int, is_playing?: bool, is_captain?: bool, is_wicketkeeper?: bool}>  $entries
     * @return array<int, array<string, mixed>>
     *
     * @throws \RuntimeException when the team isn't in this match, or an entry
     *                            names a player who isn't on that team
     */
    public function save(GameMatch $match, string $teamId, array $entries): array
    {
        if (! in_array($teamId, [$match->team_a_id, $match->team_b_id], true)) {
            throw new \RuntimeException('That team is not playing in this match');
        }

        $squad = Player::query()->where('team_id', $teamId)->pluck('id')->all();

        foreach ($entries as $entry) {
            if (! in_array($entry['player_id'], $squad, true)) {
                throw new \RuntimeException('One of those players is not in this team’s squad');
            }
        }

        DB::transaction(function () use ($match, $teamId, $entries) {
            MatchLineup::query()->where('match_id', $match->id)->where('team_id', $teamId)->delete();

            foreach (array_values($entries) as $index => $entry) {
                MatchLineup::create([
                    'id' => Ids::unique('lineup'),
                    'match_id' => $match->id,
                    'team_id' => $teamId,
                    'player_id' => $entry['player_id'],
                    'batting_order' => (int) ($entry['batting_order'] ?? $index + 1),
                    'is_playing' => (bool) ($entry['is_playing'] ?? true),
                    'is_captain' => (bool) ($entry['is_captain'] ?? false),
                    'is_wicketkeeper' => (bool) ($entry['is_wicketkeeper'] ?? false),
                ]);
            }
        });

        return $this->forMatch($match->fresh());
    }

    /**
     * The players available to bat or bowl for one side, in order — what the
     * scorer's striker / bowler pickers offer.
     *
     * @return array<int, array<string, mixed>>
     */
    public function playingFor(GameMatch $match, ?string $teamId): array
    {
        if (! $teamId) {
            return [];
        }

        return array_values(array_filter(
            $this->forMatch($match),
            fn (array $row) => $row['team_id'] === $teamId && $row['is_playing'],
        ));
    }

    /**
     * Team A and B ordered for the reveal — whoever bats first (cricket) or
     * kicks off (football) leads it, so the squad walk-out follows the toss.
     * Falls back to team A pre-toss.
     *
     * @return array<int, string>
     */
    private function revealTeamOrder(GameMatch $match): array
    {
        $first = $match->batting_first_team_id ?: ($match->kick_off_team_id ?: $match->team_a_id);

        return $first === $match->team_b_id
            ? [$match->team_b_id, $match->team_a_id]
            : [$match->team_a_id, $match->team_b_id];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, MatchLineup>  $saved
     * @param  \Illuminate\Support\Collection<int, Player>  $players
     * @return array<int, array<string, mixed>>
     */
    private function savedRows($saved, $players): array
    {
        $byId = $players->keyBy('id');

        return $saved
            ->sortBy('batting_order')
            ->values()
            // A player deleted from the squad after the sheet was saved leaves
            // a dangling row; drop it rather than render a nameless slot.
            ->filter(fn (MatchLineup $row) => $byId->has($row->player_id))
            ->map(fn (MatchLineup $row) => [
                ...$row->toArray(),
                'player' => $byId->get($row->player_id)->toArray(),
            ])
            ->values()
            ->all();
    }

    /**
     * The sheet an organizer gets without picking one: squad order by jersey
     * number, the first `$playingCount` playing, captain and keeper carried
     * over from the player records.
     *
     * @param  \Illuminate\Support\Collection<int, Player>  $players
     * @return array<int, array<string, mixed>>
     */
    private function defaultRows(string $matchId, string $teamId, $players, int $playingCount): array
    {
        return $players
            ->sortBy([['jersey_number', 'asc'], ['full_name', 'asc']])
            ->values()
            ->map(fn (Player $player, int $index) => [
                'id' => null,
                'match_id' => $matchId,
                'team_id' => $teamId,
                'player_id' => $player->id,
                'batting_order' => $index + 1,
                'is_playing' => $index < $playingCount,
                'is_captain' => (bool) $player->is_captain,
                'is_wicketkeeper' => (bool) $player->is_wicketkeeper,
                'player' => $player->toArray(),
            ])
            ->all();
    }
}
