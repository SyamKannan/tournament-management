<?php

namespace App\Services\Fixtures;

use App\Models\GameMatch;
use App\Models\Standing;
use App\Models\Team;
use App\Models\Tournament;
use Illuminate\Support\Collection;

/**
 * Moves teams through a bracket, and reads one back for display.
 *
 * Progression is *recomputed*, never tracked. Every bracket fixture records
 * where each of its sides comes from, so filling it in is a matter of asking
 * that source what it says now — which is the only approach that survives the
 * rest of this application: scoring can be undone, a result can be corrected,
 * and a semi-final can be reopened. A goal removed from a decided semi has to
 * pull the wrong finalist back out again, and bookkeeping would not.
 *
 * The one thing it will not do is overwrite a match that has already started.
 * If the wrong team was sent through and played, that is a result to correct by
 * hand, not something to silently rewrite under a live scoreboard.
 */
class BracketService
{
    /**
     * Refill every bracket fixture in a tournament from its sources.
     *
     * Called wherever a result can change — which is wherever the tournament
     * table is recalculated, so no scoring path can miss it.
     *
     * @return int how many fixtures changed
     */
    public function sync(string $tournamentId): int
    {
        $matches = GameMatch::query()
            ->where('tournament_id', $tournamentId)
            ->get();

        $waiting = $matches->filter(fn (GameMatch $match) => ! empty($match->advance_from));

        if ($waiting->isEmpty()) {
            return 0;
        }

        $byId = $matches->keyBy('id');
        $standings = null;
        $changed = 0;

        // Earliest rounds first: a quarter-final has to be resolved before the
        // semi that reads its winner, or the semi sees a stale empty slot and
        // the whole bracket takes several passes to settle.
        foreach ($waiting->sortBy([['bracket_round', 'asc'], ['bracket_position', 'asc']]) as $match) {
            if ($this->isUnderWay($match)) {
                continue;
            }

            $updates = [];

            foreach (['a' => 'team_a_id', 'b' => 'team_b_id'] as $slot => $column) {
                $source = $match->advance_from[$slot] ?? null;

                // A direct entry is not a slot that fills in — it is the team.
                if (! $source || ($source['type'] ?? '') === 'team') {
                    continue;
                }

                $standings ??= $this->groupTables($tournamentId);
                $resolved = $this->resolve($source, $byId, $standings);

                if ($resolved !== $match->{$column}) {
                    $updates[$column] = $resolved;
                }
            }

            if (! $updates) {
                continue;
            }

            $match->fill($updates);

            // A fixture that lost a team is no longer a result: clear whatever
            // was recorded against it so an undone semi-final does not leave a
            // final with a winner and nobody in it.
            if ($match->awaitsTeams() && $match->winner_team_id) {
                $match->winner_team_id = null;
                $match->result_summary = null;
            }

            $match->save();
            $byId->put($match->id, $match);
            $changed++;
        }

        return $changed;
    }

    /**
     * The bracket as a display reads it: rounds of fixtures, each side either a
     * named team or a description of what will fill it.
     *
     * @return array<string, mixed>
     */
    public function forTournament(Tournament $tournament): array
    {
        $matches = GameMatch::query()
            ->where('tournament_id', $tournament->id)
            ->whereNotNull('bracket_round')
            ->orderBy('bracket_round')
            ->orderBy('bracket_position')
            ->get();

        if ($matches->isEmpty()) {
            return ['rounds' => [], 'has_bracket' => false];
        }

        $teams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->get()
            ->keyBy('id');

        $rounds = [];

        foreach ($matches->groupBy('bracket_round') as $roundNumber => $roundMatches) {
            $rounds[] = [
                'round' => (int) $roundNumber,
                'name' => $roundMatches->first()->round_name,
                'matches' => $roundMatches->map(fn (GameMatch $match) => [
                    'id' => $match->id,
                    'match_number' => $match->match_number,
                    'bracket_position' => $match->bracket_position,
                    'status' => $match->status,
                    'scheduled_at' => $match->scheduled_at,
                    'winner_team_id' => $match->winner_team_id,
                    'result_summary' => $match->result_summary,
                    'feeds_match_id' => $match->feeds_match_id,
                    'side_a' => $this->side($match, 'a', $teams, $matches),
                    'side_b' => $this->side($match, 'b', $teams, $matches),
                ])->values()->all(),
            ];
        }

        return [
            'has_bracket' => true,
            'rounds' => $rounds,
            'champion' => $this->champion($matches, $teams),
        ];
    }

    /* ------------------------------------------------------------ Internals */

    /**
     * One side of a bracket fixture: the team if it is known, and always a label
     * saying where it came from, so a display can show "Winner of QF2" and then
     * the team's name without asking twice.
     *
     * @param  Collection<string, Team>  $teams
     * @param  Collection<int, GameMatch>  $matches
     * @return array<string, mixed>
     */
    private function side(GameMatch $match, string $slot, Collection $teams, Collection $matches): array
    {
        $teamId = $slot === 'a' ? $match->team_a_id : $match->team_b_id;
        $team = $teamId ? $teams->get($teamId) : null;
        $source = $match->advance_from[$slot] ?? null;

        return [
            'team_id' => $teamId ?: null,
            'team_name' => $team->name ?? null,
            'team_logo' => $team->logo ?? null,
            'short_name' => $team->short_name ?? null,
            'is_winner' => $teamId !== '' && $match->winner_team_id === $teamId,
            'source_label' => $this->sourceLabel($source, $matches),
        ];
    }

    /**
     * @param  array<string, mixed>|null  $source
     * @param  Collection<int, GameMatch>  $matches
     */
    private function sourceLabel(?array $source, Collection $matches): string
    {
        return match ($source['type'] ?? '') {
            'winner' => 'Winner of '.$this->matchLabel($source['match_id'] ?? '', $matches),
            'group' => sprintf(
                '%s %s',
                $source['group'] ?? 'Group',
                ($source['position'] ?? 1) === 1 ? 'winner' : 'runner-up'
            ),
            'team' => '',
            default => 'To be decided',
        };
    }

    /** @param  Collection<int, GameMatch>  $matches */
    private function matchLabel(string $matchId, Collection $matches): string
    {
        $match = $matches->firstWhere('id', $matchId);

        if (! $match) {
            return 'an earlier match';
        }

        // "QF2", "SF1" — short enough for a bracket cell.
        $initials = collect(explode('-', str_replace(' ', '-', (string) $match->round_name)))
            ->map(fn (string $word) => strtoupper(substr($word, 0, 1)))
            ->implode('');

        return $initials.$match->bracket_position;
    }

    /**
     * Which team a source currently names, or '' while it is still unknown.
     *
     * @param  array<string, mixed>  $source
     * @param  Collection<string, GameMatch>  $byId
     * @param  array<string, array<int, string>>  $standings
     */
    private function resolve(array $source, Collection $byId, array $standings): string
    {
        return match ($source['type'] ?? '') {
            'winner' => $this->winnerOf($byId->get($source['match_id'] ?? '')),
            'group' => $this->groupPosition($standings, (string) ($source['group'] ?? ''), (int) ($source['position'] ?? 1)),
            'team' => (string) ($source['team_id'] ?? ''),
            default => '',
        };
    }

    private function winnerOf(?GameMatch $match): string
    {
        if (! $match || $match->status !== 'completed') {
            return '';
        }

        return (string) ($match->winner_team_id ?? '');
    }

    /**
     * A group's table, but only once that group has finished playing.
     *
     * Seeding a knockout from a half-played group would put whoever is top today
     * into the semi-final and swap them out tomorrow. The qualifiers are not
     * known until the last group match is done.
     *
     * @param  array<string, array<int, string>>  $standings
     */
    private function groupPosition(array $standings, string $group, int $position): string
    {
        return $standings[$group][$position - 1] ?? '';
    }

    /**
     * Team ids in table order per group, for groups whose fixtures are all
     * finished. `rank` is maintained by ScoringEngine, tie-breakers included.
     *
     * @return array<string, array<int, string>>
     */
    private function groupTables(string $tournamentId): array
    {
        $groupMatches = GameMatch::query()
            ->where('tournament_id', $tournamentId)
            ->whereNotNull('group_name')
            ->get();

        if ($groupMatches->isEmpty()) {
            return [];
        }

        $standings = Standing::query()
            ->where('tournament_id', $tournamentId)
            ->orderBy('rank')
            ->get();

        $tables = [];

        foreach ($groupMatches->groupBy('group_name') as $groupName => $fixtures) {
            $unfinished = $fixtures->reject(
                fn (GameMatch $match) => in_array($match->status, ['completed', 'cancelled'], true)
            );

            if ($unfinished->isNotEmpty()) {
                continue;
            }

            $tables[(string) $groupName] = $standings
                ->where('group_name', $groupName)
                ->pluck('team_id')
                ->values()
                ->all();
        }

        return $tables;
    }

    /** A match nobody should be moved out from under. */
    private function isUnderWay(GameMatch $match): bool
    {
        return ! in_array($match->status, ['scheduled', 'cancelled'], true);
    }

    /**
     * @param  Collection<int, GameMatch>  $matches
     * @param  Collection<string, Team>  $teams
     * @return array<string, mixed>|null
     */
    private function champion(Collection $matches, Collection $teams): ?array
    {
        $final = $matches->sortByDesc('bracket_round')->first();

        if (! $final || $final->status !== 'completed' || ! $final->winner_team_id) {
            return null;
        }

        $team = $teams->get($final->winner_team_id);

        return $team ? ['id' => $team->id, 'name' => $team->name, 'logo' => $team->logo] : null;
    }
}
