<?php

namespace App\Services\Fixtures;

use App\Models\GameMatch;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\Ids;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Builds a tournament's whole schedule.
 *
 * Four formats, and the difference between them is real rather than cosmetic:
 *
 *   - `league`      every side plays every other, once or twice.
 *   - `knockout`    a seeded single-elimination bracket, byes and all, with
 *                   every round created up front so there is a final to show.
 *   - `group_stage` teams split into groups, a round robin inside each.
 *   - `league_knockout` the groups above, then a bracket the qualifiers feed
 *                   into. The default, and what a village tournament actually
 *                   runs.
 *
 * Rounds come out of here as *rounds* — sets of fixtures in which no team
 * appears twice — which is what lets Slotter put them on grounds and days
 * without clashing a team or a pitch.
 */
class FixtureBuilder
{
    public const FORMATS = ['league', 'knockout', 'group_stage', 'league_knockout'];

    /**
     * @param  Collection<int, Team>  $teams  approved teams, in seeding order
     * @return array<int, GameMatch>
     */
    public function build(Tournament $tournament, Collection $teams, array $options = []): array
    {
        $format = $this->resolveFormat($tournament, $options);
        $slotter = new Slotter(
            $this->startDate($tournament, $options),
            Slotter::venuesFor($tournament->organization_id),
            (int) ($tournament->settings['match_duration_minutes'] ?? 60),
        );

        return match ($format) {
            'knockout' => $this->knockout($tournament, $teams, $slotter),
            'group_stage' => $this->groupStage($tournament, $teams, $slotter, withKnockout: false, options: $options),
            'league_knockout' => $this->groupStage($tournament, $teams, $slotter, withKnockout: true, options: $options),
            default => $this->league($tournament, $teams, $slotter, $options),
        };
    }

    /* ------------------------------------------------------------- League */

    /**
     * A full round robin, laid out by the circle method.
     *
     * The old nested loop produced every pairing in team order, which meant the
     * first side played its first three matches back to back. The circle method
     * produces rounds instead: each team plays exactly once per round, so a
     * round is a matchday and everyone gets the same rest.
     *
     * @return array<int, GameMatch>
     */
    private function league(Tournament $tournament, Collection $teams, Slotter $slotter, array $options): array
    {
        $doubleRound = (bool) ($options['double_round'] ?? false);
        $rounds = $this->circleMethod($teams->all());

        if ($doubleRound) {
            // The return leg, with home and away swapped.
            foreach ($this->circleMethod($teams->all()) as $round) {
                $rounds[] = array_map(fn (array $pair) => [$pair[1], $pair[0]], $round);
            }
        }

        $created = [];
        $number = 1;

        foreach ($rounds as $roundIndex => $round) {
            foreach (array_values($round) as $indexInRound => [$home, $away]) {
                $created[] = $this->makeMatch($tournament, $slotter->slot($roundIndex, $indexInRound), [
                    'match_number' => $number++,
                    'round_name' => $doubleRound
                        ? sprintf('Matchday %d', $roundIndex + 1)
                        : sprintf('League Round %d', $roundIndex + 1),
                    'team_a_id' => $home->id,
                    'team_b_id' => $away->id,
                    'advance_from' => [
                        'a' => ['type' => 'team', 'team_id' => $home->id],
                        'b' => ['type' => 'team', 'team_id' => $away->id],
                    ],
                ]);
            }
        }

        return $created;
    }

    /* -------------------------------------------------------------- Groups */

    /**
     * A round robin inside each group, optionally feeding a knockout.
     *
     * @return array<int, GameMatch>
     */
    private function groupStage(
        Tournament $tournament,
        Collection $teams,
        Slotter $slotter,
        bool $withKnockout,
        array $options,
    ): array {
        $groups = $this->assignGroups($teams, (int) ($options['groups'] ?? $this->suggestGroupCount($teams->count())));

        // The tournament table is grouped by `teams.group_name`, so the draw has
        // to be written onto the teams as well as onto the fixtures. Here rather
        // than in the caller: a group stage whose teams all still say "Group A"
        // shows one table for four groups, and every caller would have to
        // remember to do it.
        foreach ($groups as $groupName => $members) {
            Team::query()
                ->whereIn('id', array_map(fn (Team $team) => $team->id, $members))
                ->update(['group_name' => $groupName]);
        }

        $created = [];
        $number = 1;
        $roundIndex = 0;

        // Groups play in parallel: round 1 of every group is one matchday, so a
        // four-group tournament finishes its group stage in as many days as the
        // biggest group has rounds, not the sum of them.
        $roundsByGroup = [];
        $mostRounds = 0;

        foreach ($groups as $groupName => $groupTeams) {
            $roundsByGroup[$groupName] = $this->circleMethod($groupTeams);
            $mostRounds = max($mostRounds, count($roundsByGroup[$groupName]));
        }

        for ($round = 0; $round < $mostRounds; $round++) {
            $indexInRound = 0;

            foreach ($roundsByGroup as $groupName => $groupRounds) {
                foreach ($groupRounds[$round] ?? [] as [$home, $away]) {
                    $created[] = $this->makeMatch($tournament, $slotter->slot($roundIndex, $indexInRound++), [
                        'match_number' => $number++,
                        'round_name' => sprintf('%s — Round %d', $groupName, $round + 1),
                        'group_name' => $groupName,
                        'team_a_id' => $home->id,
                        'team_b_id' => $away->id,
                        'advance_from' => [
                            'a' => ['type' => 'team', 'team_id' => $home->id],
                            'b' => ['type' => 'team', 'team_id' => $away->id],
                        ],
                    ]);
                }
            }

            $roundIndex++;
        }

        if (! $withKnockout) {
            return $created;
        }

        // Two from each group, which is what makes a bracket that works for the
        // two-, four- and eight-group shapes a village tournament actually uses.
        //
        // Handed over in *seeding* order — every group winner, then every
        // runner-up — and the bracket's own seeding does the pairing. Trying to
        // pair them here instead puts a group winner against its own runner-up:
        // standard seeding permutes the list it is given, so an
        // already-alternated list comes back out re-sorted into same-group ties.
        $seeds = [];

        foreach ([1, 2] as $position) {
            foreach (array_keys($groups) as $groupName) {
                $seeds[] = ['type' => 'group', 'group' => $groupName, 'position' => $position];
            }
        }

        if (count($seeds) < 2) {
            return $created;
        }

        return [
            ...$created,
            ...$this->bracket($tournament, $seeds, $slotter, $roundIndex, $number),
        ];
    }

    /* ------------------------------------------------------------ Knockout */

    /**
     * @return array<int, GameMatch>
     */
    private function knockout(Tournament $tournament, Collection $teams, Slotter $slotter): array
    {
        $seeds = $teams->map(fn (Team $team) => ['type' => 'team', 'team_id' => $team->id])->all();

        return $this->bracket($tournament, $seeds, $slotter, 0, 1);
    }

    /**
     * A seeded single-elimination bracket, every round created at once.
     *
     * Seeds are placed in standard bracket order (1 plays the lowest seed, and
     * the top two can only meet in the final) and a field that is not a power of
     * two gives the top seeds byes rather than inventing opponents. Later rounds
     * are real rows with empty team ids and an `advance_from` saying what will
     * fill them.
     *
     * @param  array<int, array<string, mixed>>  $seeds  entrants in seeding order
     * @return array<int, GameMatch>
     */
    private function bracket(
        Tournament $tournament,
        array $seeds,
        Slotter $slotter,
        int $firstRoundIndex,
        int $firstMatchNumber,
    ): array {
        $entrants = count($seeds);

        if ($entrants < 2) {
            return [];
        }

        $size = $this->bracketSize($entrants);
        $order = $this->seedOrder($size);

        // Lay the entrants into the bracket's slots; slots beyond the field are
        // empty, and an empty slot is a bye for whoever it is drawn against.
        $slots = [];

        foreach ($order as $position => $seedNumber) {
            $slots[$position] = $seeds[$seedNumber - 1] ?? null;
        }

        $created = [];
        $number = $firstMatchNumber;
        $roundCount = (int) log($size, 2);

        // Built from the final backwards, so each match already knows the id of
        // the one it feeds before it is written.
        $roundsOfMatches = [];

        for ($round = $roundCount; $round >= 1; $round--) {
            $matchesInRound = (int) ($size / (2 ** $round));
            $roundsOfMatches[$round] = [];

            for ($position = 1; $position <= $matchesInRound; $position++) {
                $next = $roundsOfMatches[$round + 1][(int) ceil($position / 2)] ?? null;

                $roundsOfMatches[$round][$position] = [
                    'id' => Ids::unique('match'),
                    'feeds_match_id' => $next['id'] ?? null,
                    // Odd positions feed the left-hand side of the next match.
                    'feeds_slot' => $next ? ($position % 2 === 1 ? 'a' : 'b') : null,
                ];
            }
        }

        for ($round = 1; $round <= $roundCount; $round++) {
            $matchesInRound = count($roundsOfMatches[$round]);
            $indexInRound = 0;

            foreach ($roundsOfMatches[$round] as $position => $skeleton) {
                [$sideA, $sideB] = $round === 1
                    ? [$slots[($position - 1) * 2] ?? null, $slots[($position - 1) * 2 + 1] ?? null]
                    : [
                        ['type' => 'winner', 'match_id' => $roundsOfMatches[$round - 1][$position * 2 - 1]['id']],
                        ['type' => 'winner', 'match_id' => $roundsOfMatches[$round - 1][$position * 2]['id']],
                    ];

                // A first-round pairing with one side empty is a bye: the named
                // side is through, and no match is played. The row is still
                // created so the bracket reads as a bracket, and it is marked
                // completed with that team as the winner, which the progression
                // then carries forward like any other result.
                $isBye = $round === 1 && (($sideA === null) !== ($sideB === null));
                $walkover = $isBye ? ($sideA ?? $sideB) : null;

                // Both sides empty in round one happens when the field is small
                // enough that a whole quarter of the bracket is unused.
                if ($round === 1 && $sideA === null && $sideB === null) {
                    continue;
                }

                $created[] = $this->makeMatch($tournament, $slotter->slot($firstRoundIndex + $round - 1, $indexInRound++), [
                    'id' => $skeleton['id'],
                    'match_number' => $number++,
                    'round_name' => $this->roundName($matchesInRound),
                    'bracket_round' => $round,
                    'bracket_position' => $position,
                    'feeds_match_id' => $skeleton['feeds_match_id'],
                    'feeds_slot' => $skeleton['feeds_slot'],
                    'team_a_id' => $this->directTeam($sideA),
                    'team_b_id' => $this->directTeam($sideB),
                    'advance_from' => ['a' => $sideA, 'b' => $sideB],
                    'status' => $isBye ? 'completed' : 'scheduled',
                    'winner_team_id' => $isBye ? ($walkover['team_id'] ?? null) : null,
                    'result_summary' => $isBye ? 'Bye — through to the next round' : null,
                ]);
            }
        }

        return $created;
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * Split teams into groups, strongest spread out.
     *
     * Serpentine order: with four groups, seeds 1-4 go A,B,C,D and seeds 5-8
     * come back D,C,B,A. Dealing them round and round instead would stack the
     * top of the seeding list into the same group.
     *
     * @param  Collection<int, Team>  $teams
     * @return array<string, array<int, Team>>
     */
    public function assignGroups(Collection $teams, int $groupCount): array
    {
        $groupCount = max(1, min($groupCount, max(1, intdiv($teams->count(), 2))));
        $groups = [];

        for ($i = 0; $i < $groupCount; $i++) {
            $groups[$this->groupName($i)] = [];
        }

        $names = array_keys($groups);

        foreach ($teams->values() as $index => $team) {
            $row = intdiv($index, $groupCount);
            $withinRow = $index % $groupCount;
            $position = $row % 2 === 0 ? $withinRow : $groupCount - 1 - $withinRow;

            $groups[$names[$position]][] = $team;
        }

        // A group of one has nobody to play; fold it back into the group before.
        foreach ($names as $name) {
            if (count($groups[$name]) === 1 && count($names) > 1) {
                $stray = array_pop($groups[$name]);
                unset($groups[$name]);
                $groups[array_key_first($groups)][] = $stray;
            }
        }

        return array_filter($groups, fn (array $members) => count($members) >= 2);
    }

    public function groupName(int $index): string
    {
        return 'Group '.chr(ord('A') + $index);
    }

    /** Four to seven teams is one group; beyond that, groups of about four. */
    public function suggestGroupCount(int $teamCount): int
    {
        if ($teamCount < 6) {
            return 1;
        }

        return max(2, (int) round($teamCount / 4));
    }

    /**
     * Round-robin rounds by the circle method: one team held still while the
     * rest rotate around it. An odd field gets a phantom entrant, and whoever
     * draws it sits that round out.
     *
     * @param  array<int, Team>  $teams
     * @return array<int, array<int, array{0: Team, 1: Team}>>
     */
    private function circleMethod(array $teams): array
    {
        $teams = array_values($teams);

        if (count($teams) < 2) {
            return [];
        }

        $phantom = count($teams) % 2 === 1;

        if ($phantom) {
            $teams[] = null;
        }

        $count = count($teams);
        $rounds = [];

        for ($round = 0; $round < $count - 1; $round++) {
            $pairs = [];

            for ($i = 0; $i < intdiv($count, 2); $i++) {
                $home = $teams[$i];
                $away = $teams[$count - 1 - $i];

                if ($home === null || $away === null) {
                    continue;
                }

                // Alternate who is listed first each round, so no side is always
                // the home team in a competition where that decides the strip.
                $pairs[] = $round % 2 === 0 ? [$home, $away] : [$away, $home];
            }

            $rounds[] = $pairs;

            // Rotate everything but the first entrant.
            $fixed = array_shift($teams);
            $last = array_pop($teams);
            array_unshift($teams, $last);
            array_unshift($teams, $fixed);
        }

        return $rounds;
    }

    /**
     * Standard bracket seeding order for a field of `$size`.
     *
     * Built by reflection: a bracket of 4 is [1,4,2,3], and each doubling pairs
     * every existing seed with its complement — which is what guarantees the top
     * two seeds cannot meet before the final.
     *
     * @return array<int, int>
     */
    private function seedOrder(int $size): array
    {
        $order = [1, 2];

        while (count($order) < $size) {
            $next = [];
            $complement = count($order) * 2 + 1;

            foreach ($order as $seed) {
                $next[] = $seed;
                $next[] = $complement - $seed;
            }

            $order = $next;
        }

        return $order;
    }

    private function bracketSize(int $entrants): int
    {
        $size = 2;

        while ($size < $entrants) {
            $size *= 2;
        }

        return $size;
    }

    /** What a round with this many matches in it is called. */
    private function roundName(int $matchesInRound): string
    {
        return match ($matchesInRound) {
            1 => 'Final',
            2 => 'Semi-Final',
            4 => 'Quarter-Final',
            default => 'Round of '.($matchesInRound * 2),
        };
    }

    /** @param  array<string, mixed>|null  $side */
    private function directTeam(?array $side): string
    {
        return ($side['type'] ?? null) === 'team' ? (string) $side['team_id'] : '';
    }

    private function resolveFormat(Tournament $tournament, array $options): string
    {
        $format = (string) ($options['format'] ?? $tournament->format ?? 'league');

        // `round_robin` is what the old endpoint called a league, and the client
        // may still send it.
        if ($format === 'round_robin') {
            return 'league';
        }

        return in_array($format, self::FORMATS, true) ? $format : 'league';
    }

    private function startDate(Tournament $tournament, array $options): Carbon
    {
        foreach ([$options['start_date'] ?? null, $tournament->start_date] as $candidate) {
            if (! $candidate) {
                continue;
            }

            try {
                $date = Carbon::parse($candidate);

                // A bare date has no kick-off time: use the one the organizer set on
                // the tournament, else the afternoon once the heat is off — not midnight.
                if ($date->format('H:i') === '00:00') {
                    [$hour, $minute] = $this->firstKickOff($tournament);

                    return $date->setTime($hour, $minute);
                }

                return $date;
            } catch (\Throwable) {
                continue;
            }
        }

        return Carbon::now()->addDay()->setTime(...$this->firstKickOff($tournament));
    }

    /** @return array{int, int} */
    private function firstKickOff(Tournament $tournament): array
    {
        $time = (string) ($tournament->settings['start_time'] ?? '');

        return preg_match('/^(\d{2}):(\d{2})$/', $time, $m) ? [(int) $m[1], (int) $m[2]] : [15, 0];
    }

    /**
     * @param  array{venue_id: string|null, scheduled_at: string}  $slot
     * @param  array<string, mixed>  $attributes
     */
    private function makeMatch(Tournament $tournament, array $slot, array $attributes): GameMatch
    {
        return GameMatch::create([
            'id' => $attributes['id'] ?? Ids::unique('match'),
            'tournament_id' => $tournament->id,
            'organization_id' => $tournament->organization_id,
            'sport_code' => $tournament->sport_code,
            'venue_id' => $slot['venue_id'],
            'scheduled_at' => $slot['scheduled_at'],
            'status' => 'scheduled',
            ...$attributes,
        ]);
    }
}
