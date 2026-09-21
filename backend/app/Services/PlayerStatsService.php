<?php

namespace App\Services;

use App\Models\CricketDelivery;
use App\Models\FootballEvent;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\MatchLineup;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\User;
use App\Support\Cached;
use Illuminate\Support\Collection;

/**
 * Player statistics, derived from the scoring logs.
 *
 * Nothing here is stored. Every number is read back out of the rows the scorer
 * already writes — `cricket_deliveries`, `football_events`, `match_lineups` and
 * the match itself — so stats can never drift from the scorecard, undoing a
 * ball or an event corrects them for free, and a cancelled match drops out the
 * moment it is cancelled.
 *
 * The work is done a tournament at a time, in a fixed handful of queries
 * however many players and matches it holds. Each match is reduced to one
 * "line" per player who took part in it (runs, balls, wickets, goals…);
 * totals are folded from those lines. The same lines are a player's match log,
 * and the same fold adds a career up across tournaments.
 *
 * Who took part in a match: anyone on a saved team sheet as playing, plus
 * anyone the log names — batter, bowler, fielder, scorer, assister, booked or
 * substituted player — plus the player of the match. The default sheet the
 * scoreboard falls back on is deliberately not used: it is a guess from the
 * roster order, and would credit bench players with appearances.
 */
class PlayerStatsService
{
    public function __construct(private readonly PlayerIdentity $identity) {}

    /** Dismissals credited to no bowler. */
    private const UNBOWLED_DISMISSALS = ['run_out', 'retired_hurt', 'obstructing_field'];

    /** Statuses a match only reaches once play has started. */
    private const STARTED_STATUSES = ['in_progress', 'half_time', 'innings_break', 'drinks_break', 'completed'];

    /** Most recent matches carried inside a stats block. */
    private const RECENT_MATCHES = 5;

    /* ---------------------------------------------------------------------
     | Public API
     * -------------------------------------------------------------------*/

    /**
     * The stats block for one player in their tournament: sport totals, the
     * last few matches and their player-of-the-match awards.
     *
     * @return array<string, mixed>
     */
    public function forPlayer(Player $player): array
    {
        $tournament = Tournament::find($player->tournament_id);

        if (! $tournament) {
            return $this->block($player, null, null);
        }

        return Cached::remember(Cached::tournament($tournament->id), 'block:'.$player->id, 'stats',
            fn () => $this->block($player, $tournament, $this->tournamentLines($tournament)));
    }

    /**
     * Every rostered player of a tournament with their stats block, computed
     * in one pass. Only players of approved teams — the same sides the public
     * hub lists.
     *
     * @return Collection<int, array{player: Player, stats: array<string, mixed>}>
     */
    public function forTournament(Tournament $tournament): Collection
    {
        return Cached::remember(Cached::tournament($tournament->id), 'roster-stats', 'stats',
            fn () => $this->computeForTournament($tournament));
    }

    private function computeForTournament(Tournament $tournament): Collection
    {
        $data = $this->tournamentLines($tournament);

        $approved = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', 'approved')
            ->pluck('id')
            ->flip();

        return $data['players']
            ->filter(fn (Player $player) => $approved->has($player->team_id))
            ->map(fn (Player $player) => [
                'player' => $player,
                'stats' => $this->block($player, $tournament, $data),
            ])
            ->values();
    }

    /**
     * Stats blocks for any set of players, keyed by player id — each of their
     * tournaments is read once, however many of the players it holds.
     *
     * @param  Collection<int, Player>  $players
     * @return array<string, array<string, mixed>>
     */
    public function forPlayers(Collection $players): array
    {
        $tournaments = Tournament::query()
            ->whereIn('id', $players->pluck('tournament_id')->unique()->all())
            ->get()
            ->keyBy('id');

        $blocks = [];

        foreach ($players->groupBy('tournament_id') as $tournamentId => $group) {
            $tournament = $tournaments->get($tournamentId);
            $data = $tournament ? $this->tournamentLines($tournament) : null;

            foreach ($group as $player) {
                $blocks[$player->id] = $this->block($player, $tournament, $data);
            }
        }

        return $blocks;
    }

    /**
     * Every match the player took part in, newest first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function matchLog(Player $player): array
    {
        $tournament = Tournament::find($player->tournament_id);

        if (! $tournament) {
            return [];
        }

        return Cached::remember(Cached::tournament($tournament->id), 'log:'.$player->id, 'stats',
            fn () => $this->logEntries($player, $tournament, $this->tournamentLines($tournament)));
    }

    /**
     * A player's record across every tournament they have played in.
     *
     * A squad entry belongs to one team in one tournament, so the same person
     * in two tournaments is two `players` rows; PlayerIdentity joins them up
     * through the person's player account. A player with no account has a
     * career of exactly one tournament.
     *
     * Draft tournaments are left out, as they are everywhere public.
     *
     * @return array<string, mixed>
     */
    public function career(Player $player): array
    {
        ['account' => $account, 'entries' => $entries] = $this->identity->linkedEntries($player);

        // Built from every tournament the person played in, so a change to any
        // of them — or a new squad entry, which adds a scope — misses.
        $scopes = $entries->pluck('tournament_id')->filter()->unique()->sort()
            ->map(Cached::tournament(...))->values()->all();

        if ($scopes === []) {
            return $this->computeCareer($account, $entries);
        }

        return Cached::remember($scopes, 'career:'.$player->id.':'.$entries->pluck('id')->sort()->implode(','), 'stats',
            fn () => $this->computeCareer($account, $entries));
    }

    /** @param  Collection<int, Player>  $entries */
    private function computeCareer(?User $account, Collection $entries): array
    {
        $tournaments = Tournament::query()
            ->whereIn('id', $entries->pluck('tournament_id')->unique()->all())
            ->where('status', '!=', 'draft')
            ->get()
            ->keyBy('id');

        $allLines = ['cricket' => [], 'football' => []];
        $breakdown = [];
        $awards = [];

        foreach ($entries->groupBy('tournament_id') as $tournamentId => $tournamentEntries) {
            $tournament = $tournaments->get($tournamentId);

            if (! $tournament) {
                continue;
            }

            $data = $this->tournamentLines($tournament);
            $sport = $this->sportOf($tournament);

            foreach ($tournamentEntries as $entry) {
                $lines = $data['lines'][$entry->id] ?? [];
                array_push($allLines[$sport], ...$lines);
                array_push($awards, ...$this->awards($lines, $data, $tournament));

                $breakdown[] = [
                    'tournament' => [
                        'id' => $tournament->id,
                        'name' => $tournament->name,
                        'slug' => $tournament->slug,
                        'sport_code' => $sport,
                        'status' => $tournament->status,
                        'start_date' => $tournament->start_date,
                    ],
                    'player_id' => $entry->id,
                    'team_id' => $entry->team_id,
                    'team_name' => $data['teams'][$entry->team_id] ?? null,
                    'stats' => $sport === 'cricket' ? $this->cricketTotals($lines) : $this->footballTotals($lines),
                ];
            }
        }

        usort($breakdown, fn (array $a, array $b) => strcmp((string) $b['tournament']['start_date'], (string) $a['tournament']['start_date']));
        usort($awards, fn (array $a, array $b) => strcmp((string) $b['date'], (string) $a['date']));

        return [
            'linked_to_account' => $account !== null,
            'tournaments_count' => count($breakdown),
            'cricket' => $this->hasSport($breakdown, 'cricket') ? $this->cricketTotals($allLines['cricket']) : null,
            'football' => $this->hasSport($breakdown, 'football') ? $this->footballTotals($allLines['football']) : null,
            'tournaments' => $breakdown,
            'awards' => $awards,
        ];
    }

    /* ---------------------------------------------------------------------
     | Stats block
     * -------------------------------------------------------------------*/

    /**
     * The shape every screen reads: identity, one sport's totals, recent
     * matches and awards.
     *
     * @param  array<string, mixed>|null  $data
     * @return array<string, mixed>
     */
    private function block(Player $player, ?Tournament $tournament, ?array $data): array
    {
        $sport = $this->sportOf($tournament);
        $lines = $data['lines'][$player->id] ?? [];

        return [
            'id' => 'ps_'.$player->id,
            'player_id' => $player->id,
            'full_name' => $player->full_name,
            'player_code' => $player->player_code,
            'photo' => $player->photo ?: null,
            'jersey_number' => $player->jersey_number,
            'team_id' => $player->team_id ?: null,
            'team_name' => $data['teams'][$player->team_id] ?? Team::query()->whereKey($player->team_id)->value('name'),
            'organization_id' => $player->organization_id,
            'tournament_id' => $player->tournament_id,
            'sport_code' => $sport,
            'cricket' => $sport === 'cricket' ? $this->cricketTotals($lines) : null,
            'football' => $sport === 'football' ? $this->footballTotals($lines) : null,
            'recent_performances' => $tournament && $data
                ? array_slice($this->logEntries($player, $tournament, $data), 0, self::RECENT_MATCHES)
                : [],
            'awards' => $tournament && $data ? $this->awards($lines, $data, $tournament) : [],
            'updated_at' => now()->toIso8601String(),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    private function awards(array $lines, array $data, Tournament $tournament): array
    {
        $awards = [];

        foreach ($lines as $line) {
            if (! $line['player_of_match']) {
                continue;
            }

            $match = $data['matches'][$line['match_id']];
            $awards[] = [
                'id' => 'potm-'.$match->id,
                'title' => 'Player of the Match',
                'match_id' => $match->id,
                'opponent_name' => $data['teams'][$this->opponentOf($match, $line['team_id'])] ?? null,
                'date' => $match->scheduled_at,
                'tournament_id' => $tournament->id,
                'tournament_name' => $tournament->name,
            ];
        }

        return array_values(array_reverse($this->sortLinesByDate($awards, $data)));
    }

    /* ---------------------------------------------------------------------
     | Match log
     * -------------------------------------------------------------------*/

    /**
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    private function logEntries(Player $player, Tournament $tournament, array $data): array
    {
        $sport = $this->sportOf($tournament);
        $entries = [];

        foreach (array_reverse($this->sortLinesByDate($data['lines'][$player->id] ?? [], $data)) as $line) {
            /** @var GameMatch $match */
            $match = $data['matches'][$line['match_id']];
            $opponentId = $this->opponentOf($match, $line['team_id']);

            $entry = [
                'match_id' => $match->id,
                'match_number' => $match->match_number,
                'round_name' => $match->round_name,
                'date' => $match->scheduled_at,
                'status' => $match->status,
                'tournament_id' => $tournament->id,
                'tournament_name' => $tournament->name,
                'sport_code' => $sport,
                'team_id' => $line['team_id'],
                'team_name' => $data['teams'][$line['team_id']] ?? null,
                'opponent_team_id' => $opponentId,
                'opponent_name' => $data['teams'][$opponentId] ?? 'Opponent',
                'result' => $this->resultFor($match, $line['team_id'], $sport),
                'result_summary' => $match->result_summary,
                'player_of_match' => $line['player_of_match'],
            ];

            if ($sport === 'cricket') {
                $entry['summary'] = $this->cricketSummary($line);
                $entry['cricket'] = $this->cricketMatchDetail($line);
            } else {
                $entry['summary'] = $this->footballSummary($line);
                $entry['football'] = $this->footballMatchDetail($line);
            }

            $entries[] = $entry;
        }

        return $entries;
    }

    /**
     * Oldest first — by the fixture date, then its number in the draw.
     *
     * @param  array<int, array<string, mixed>>  $rows  each carrying a `match_id`
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    private function sortLinesByDate(array $rows, array $data): array
    {
        usort($rows, function (array $a, array $b) use ($data) {
            $matchA = $data['matches'][$a['match_id']];
            $matchB = $data['matches'][$b['match_id']];

            return [(string) $matchA->scheduled_at, (int) $matchA->match_number]
                <=> [(string) $matchB->scheduled_at, (int) $matchB->match_number];
        });

        return $rows;
    }

    private function resultFor(GameMatch $match, string $teamId, string $sport): ?string
    {
        if ($match->status !== 'completed') {
            return null;
        }

        if (! $match->winner_team_id) {
            return $sport === 'cricket' ? 'tied' : 'drawn';
        }

        return $match->winner_team_id === $teamId ? 'won' : 'lost';
    }

    private function opponentOf(GameMatch $match, string $teamId): string
    {
        return $teamId === $match->team_a_id ? $match->team_b_id : $match->team_a_id;
    }

    /* ---------------------------------------------------------------------
     | Building the lines
     * -------------------------------------------------------------------*/

    /**
     * Load a tournament's played matches and reduce each to per-player lines.
     *
     * @return array{matches: Collection<string, GameMatch>, players: Collection<string, Player>, teams: array<string, string>, lines: array<string, array<int, array<string, mixed>>>}
     */
    private function tournamentLines(Tournament $tournament): array
    {
        $sport = $this->sportOf($tournament);

        $matches = GameMatch::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', '!=', 'cancelled')
            ->get()
            ->keyBy('id');

        $players = Player::query()->where('tournament_id', $tournament->id)->get()->keyBy('id');
        $teams = Team::query()->where('tournament_id', $tournament->id)->pluck('name', 'id')->all();

        $matchIds = $matches->keys()->all();

        $sheets = MatchLineup::query()
            ->whereIn('match_id', $matchIds)
            ->where('is_playing', true)
            ->get()
            ->groupBy('match_id');

        $logs = ($sport === 'cricket' ? CricketDelivery::query() : FootballEvent::query())
            ->whereIn('match_id', $matchIds)
            ->orderBy('sequence')
            ->get()
            ->groupBy('match_id');

        $scores = $sport === 'football'
            ? FootballMatchState::query()->whereIn('match_id', $matchIds)->get()->keyBy('match_id')
            : collect();

        $lines = [];

        foreach ($matches as $match) {
            $log = $logs->get($match->id) ?? collect();

            // A fixture that never got under way has no appearances, even if
            // a team sheet was saved for it ahead of time.
            if ($log->isEmpty() && ! in_array($match->status, self::STARTED_STATUSES, true)) {
                continue;
            }

            $matchLines = $sport === 'cricket'
                ? $this->cricketLines($log)
                : $this->footballLines($log);

            foreach ($sheets->get($match->id) ?? [] as $row) {
                $matchLines[$row->player_id] ??= $sport === 'cricket' ? $this->emptyCricketLine() : $this->emptyFootballLine();
            }

            if ($match->man_of_the_match_player_id) {
                $matchLines[$match->man_of_the_match_player_id] ??= $sport === 'cricket' ? $this->emptyCricketLine() : $this->emptyFootballLine();
            }

            foreach ($matchLines as $playerId => $line) {
                $player = $players->get($playerId);

                // Only this match's two squads; a stray id in the log (a
                // player since removed from the roster) credits nobody.
                if (! $player || ! in_array($player->team_id, [$match->team_a_id, $match->team_b_id], true)) {
                    continue;
                }

                if ($sport === 'football') {
                    $line['clean_sheet'] = $this->keptCleanSheet($match, $player, $scores->get($match->id));
                }

                $lines[$playerId][] = [
                    ...$line,
                    'match_id' => $match->id,
                    'team_id' => $player->team_id,
                    'player_of_match' => $match->man_of_the_match_player_id === $playerId,
                ];
            }
        }

        return ['matches' => $matches, 'players' => $players, 'teams' => $teams, 'lines' => $lines];
    }

    /**
     * One match's deliveries reduced to a line per player named in them.
     * Deliveries bowled before the crease was named carry blank ids and credit
     * nobody, exactly as the scorecard skips them.
     *
     * @param  Collection<int, CricketDelivery>  $balls
     * @return array<string, array<string, mixed>>
     */
    private function cricketLines(Collection $balls): array
    {
        $lines = [];
        $line = function (?string $playerId) use (&$lines): ?string {
            if (! $playerId) {
                return null;
            }
            $lines[$playerId] ??= $this->emptyCricketLine();

            return $playerId;
        };

        foreach ($balls as $ball) {
            if ($striker = $line($ball->striker_id)) {
                $lines[$striker]['batted'] = true;
                $lines[$striker]['runs'] += (int) $ball->runs_scored;

                // A wide is never a ball faced; a no-ball is.
                if ($ball->extras !== 'wide') {
                    $lines[$striker]['balls'] += 1;
                }
                if ((int) $ball->runs_scored === 4) {
                    $lines[$striker]['fours'] += 1;
                }
                if ((int) $ball->runs_scored === 6) {
                    $lines[$striker]['sixes'] += 1;
                }
            }

            // At the crease is an innings, even without facing a ball.
            if ($nonStriker = $line($ball->non_striker_id)) {
                $lines[$nonStriker]['batted'] = true;
            }

            if ($bowler = $line($ball->bowler_id)) {
                if ($this->isLegal($ball)) {
                    $lines[$bowler]['balls_bowled'] += 1;
                }
                $lines[$bowler]['runs_conceded'] += $this->runsChargedToBowler($ball);

                if ($ball->is_wicket && ! in_array((string) $ball->wicket_type, self::UNBOWLED_DISMISSALS, true)) {
                    $lines[$bowler]['wickets'] += 1;
                }
            }

            if (! $ball->is_wicket) {
                continue;
            }

            // Retired hurt leaves the batter not out.
            if ($ball->wicket_type !== 'retired_hurt' && ($dismissed = $line($ball->dismissed_player_id ?: $ball->striker_id))) {
                $lines[$dismissed]['batted'] = true;
                $lines[$dismissed]['out'] = true;
            }

            match ($ball->wicket_type) {
                // A catch with no fielder named is read as caught-and-bowled,
                // the way the scorecard prints it.
                'caught' => ($catcher = $line($ball->fielder_id ?: $ball->bowler_id)) ? $lines[$catcher]['catches'] += 1 : null,
                'caught_and_bowled' => ($catcher = $line($ball->bowler_id)) ? $lines[$catcher]['catches'] += 1 : null,
                'stumped' => ($keeper = $line($ball->fielder_id)) ? $lines[$keeper]['stumpings'] += 1 : null,
                'run_out' => ($fielder = $line($ball->fielder_id)) ? $lines[$fielder]['run_outs'] += 1 : null,
                default => null,
            };
        }

        // A maiden: a completed over, all of it from one bowler, off which
        // nothing was charged to them. Byes and leg-byes don't break it.
        foreach ($balls->groupBy(fn (CricketDelivery $ball) => $ball->innings.'-'.$ball->over_number) as $over) {
            $bowlers = $over->pluck('bowler_id')->unique();

            if ($bowlers->count() === 1
                && $bowlers->first()
                && $over->filter(fn (CricketDelivery $ball) => $this->isLegal($ball))->count() === 6
                && $over->sum(fn (CricketDelivery $ball) => $this->runsChargedToBowler($ball)) === 0) {
                $lines[$bowlers->first()]['maidens'] += 1;
            }
        }

        return $lines;
    }

    /**
     * One match's events reduced to a line per player named in them.
     *
     * @param  Collection<int, FootballEvent>  $events
     * @return array<string, array<string, mixed>>
     */
    private function footballLines(Collection $events): array
    {
        $lines = [];
        $line = function (?string $playerId) use (&$lines): ?string {
            if (! $playerId) {
                return null;
            }
            $lines[$playerId] ??= $this->emptyFootballLine();

            return $playerId;
        };

        foreach ($events as $event) {
            $playerId = $line($event->player_id);

            match ($event->event_type) {
                'goal' => $playerId ? $lines[$playerId]['goals'] += 1 : null,
                'penalty_goal' => $playerId ? [$lines[$playerId]['goals'] += 1, $lines[$playerId]['penalty_goals'] += 1] : null,
                'penalty_missed' => $playerId ? $lines[$playerId]['penalties_missed'] += 1 : null,
                'own_goal' => $playerId ? $lines[$playerId]['own_goals'] += 1 : null,
                'yellow_card' => $playerId ? $lines[$playerId]['yellow_cards'] += 1 : null,
                'red_card' => $playerId ? $lines[$playerId]['red_cards'] += 1 : null,
                default => null,
            };

            // The engine only keeps an assist on an open-play goal.
            if ($event->event_type === 'goal' && ($assister = $line($event->assist_player_id))) {
                $lines[$assister]['assists'] += 1;
            }

            if ($event->event_type === 'substitution') {
                $line($event->sub_in_player_id);
                $line($event->sub_out_player_id);
            }
        }

        return $lines;
    }

    /**
     * A goalkeeper who played in a finished match their side conceded nothing in.
     */
    private function keptCleanSheet(GameMatch $match, Player $player, ?FootballMatchState $score): bool
    {
        if ($match->status !== 'completed' || ! $score || ! preg_match('/goal\s*-?\s*keeper|^gk$/i', trim((string) $player->football_position))) {
            return false;
        }

        $conceded = $player->team_id === $match->team_a_id ? $score->team_b_score : $score->team_a_score;

        return (int) $conceded === 0;
    }

    /** @return array<string, mixed> */
    private function emptyCricketLine(): array
    {
        return [
            'batted' => false, 'runs' => 0, 'balls' => 0, 'fours' => 0, 'sixes' => 0, 'out' => false,
            'balls_bowled' => 0, 'runs_conceded' => 0, 'wickets' => 0, 'maidens' => 0,
            'catches' => 0, 'stumpings' => 0, 'run_outs' => 0,
        ];
    }

    /** @return array<string, mixed> */
    private function emptyFootballLine(): array
    {
        return [
            'goals' => 0, 'penalty_goals' => 0, 'penalties_missed' => 0, 'own_goals' => 0, 'assists' => 0,
            'yellow_cards' => 0, 'red_cards' => 0, 'clean_sheet' => false,
        ];
    }

    /* ---------------------------------------------------------------------
     | Totals
     * -------------------------------------------------------------------*/

    /**
     * Ratios with nothing to divide by (an average with no dismissals, an
     * economy with no balls bowled) are null rather than a misleading zero.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<string, mixed>
     */
    private function cricketTotals(array $lines): array
    {
        $batted = array_filter($lines, fn (array $line) => $line['batted']);
        $bowled = array_filter($lines, fn (array $line) => $line['balls_bowled'] > 0 || $line['runs_conceded'] > 0);

        $runs = array_sum(array_column($batted, 'runs'));
        $ballsFaced = array_sum(array_column($batted, 'balls'));
        $outs = count(array_filter($batted, fn (array $line) => $line['out']));

        $highest = null;
        foreach ($batted as $line) {
            if ($highest === null || $line['runs'] > $highest['runs'] || ($line['runs'] === $highest['runs'] && ! $line['out'])) {
                $highest = $line;
            }
        }

        $ballsBowled = array_sum(array_column($lines, 'balls_bowled'));
        $conceded = array_sum(array_column($lines, 'runs_conceded'));
        $wickets = array_sum(array_column($lines, 'wickets'));

        $best = null;
        foreach ($bowled as $line) {
            if ($best === null || $line['wickets'] > $best['wickets'] || ($line['wickets'] === $best['wickets'] && $line['runs_conceded'] < $best['runs_conceded'])) {
                $best = $line;
            }
        }

        return [
            'matches' => count($lines),
            'innings_batted' => count($batted),
            'runs_scored' => $runs,
            'balls_faced' => $ballsFaced,
            'highest_score' => $highest['runs'] ?? null,
            'highest_score_not_out' => $highest !== null && ! $highest['out'],
            'batting_average' => $outs > 0 ? round($runs / $outs, 2) : null,
            'strike_rate' => $ballsFaced > 0 ? round($runs * 100 / $ballsFaced, 2) : null,
            'centuries' => count(array_filter($batted, fn (array $line) => $line['runs'] >= 100)),
            'fifties' => count(array_filter($batted, fn (array $line) => $line['runs'] >= 50 && $line['runs'] < 100)),
            'fours' => array_sum(array_column($batted, 'fours')),
            'sixes' => array_sum(array_column($batted, 'sixes')),
            'ducks' => count(array_filter($batted, fn (array $line) => $line['out'] && $line['runs'] === 0)),
            'not_outs' => count($batted) - $outs,
            'innings_bowled' => count($bowled),
            'balls_bowled' => $ballsBowled,
            'overs_bowled' => $this->oversNotation($ballsBowled),
            'maidens' => array_sum(array_column($lines, 'maidens')),
            'runs_conceded' => $conceded,
            'wickets_taken' => $wickets,
            'bowling_average' => $wickets > 0 ? round($conceded / $wickets, 2) : null,
            'economy_rate' => $ballsBowled > 0 ? round($conceded * 6 / $ballsBowled, 2) : null,
            'bowling_strike_rate' => $wickets > 0 ? round($ballsBowled / $wickets, 2) : null,
            'best_bowling_wickets' => $best['wickets'] ?? null,
            'best_bowling_runs' => $best['runs_conceded'] ?? null,
            // Kept apart the way scorecards count them: three or four in an
            // innings, and five or more.
            'three_wicket_hauls' => count(array_filter($lines, fn (array $line) => $line['wickets'] >= 3 && $line['wickets'] < 5)),
            'five_wicket_hauls' => count(array_filter($lines, fn (array $line) => $line['wickets'] >= 5)),
            'catches' => array_sum(array_column($lines, 'catches')),
            'stumpings' => array_sum(array_column($lines, 'stumpings')),
            'run_outs' => array_sum(array_column($lines, 'run_outs')),
            'player_of_match_count' => count(array_filter($lines, fn (array $line) => $line['player_of_match'])),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<string, mixed>
     */
    private function footballTotals(array $lines): array
    {
        $matches = count($lines);
        $goals = array_sum(array_column($lines, 'goals'));

        return [
            'matches' => $matches,
            'goals' => $goals,
            'penalties_scored' => array_sum(array_column($lines, 'penalty_goals')),
            'penalties_missed' => array_sum(array_column($lines, 'penalties_missed')),
            'own_goals' => array_sum(array_column($lines, 'own_goals')),
            'assists' => array_sum(array_column($lines, 'assists')),
            'goals_per_match' => $matches > 0 ? round($goals / $matches, 2) : null,
            'clean_sheets' => count(array_filter($lines, fn (array $line) => $line['clean_sheet'])),
            'yellow_cards' => array_sum(array_column($lines, 'yellow_cards')),
            'red_cards' => array_sum(array_column($lines, 'red_cards')),
            'player_of_match_count' => count(array_filter($lines, fn (array $line) => $line['player_of_match'])),
        ];
    }

    /* ---------------------------------------------------------------------
     | Per-match detail
     * -------------------------------------------------------------------*/

    /**
     * @param  array<string, mixed>  $line
     * @return array<string, mixed>
     */
    private function cricketMatchDetail(array $line): array
    {
        $bowled = $line['balls_bowled'] > 0 || $line['runs_conceded'] > 0;

        return [
            'batting' => $line['batted'] ? [
                'runs' => $line['runs'],
                'balls' => $line['balls'],
                'fours' => $line['fours'],
                'sixes' => $line['sixes'],
                'not_out' => ! $line['out'],
                'strike_rate' => $line['balls'] > 0 ? round($line['runs'] * 100 / $line['balls'], 2) : null,
            ] : null,
            'bowling' => $bowled ? [
                'overs' => $this->oversNotation($line['balls_bowled']),
                'balls' => $line['balls_bowled'],
                'maidens' => $line['maidens'],
                'runs' => $line['runs_conceded'],
                'wickets' => $line['wickets'],
                'economy' => $line['balls_bowled'] > 0 ? round($line['runs_conceded'] * 6 / $line['balls_bowled'], 2) : null,
            ] : null,
            'fielding' => [
                'catches' => $line['catches'],
                'stumpings' => $line['stumpings'],
                'run_outs' => $line['run_outs'],
            ],
        ];
    }

    /**
     * Scorebook shorthand — "42* (26) & 1/14 (2.0 ov), 1 ct".
     *
     * @param  array<string, mixed>  $line
     */
    private function cricketSummary(array $line): string
    {
        $parts = [];

        if ($line['batted']) {
            $parts[] = $line['runs'].($line['out'] ? '' : '*').' ('.$line['balls'].')';
        }
        if ($line['balls_bowled'] > 0 || $line['runs_conceded'] > 0) {
            $parts[] = $line['wickets'].'/'.$line['runs_conceded'].' ('.number_format($this->oversNotation($line['balls_bowled']), 1).' ov)';
        }

        $summary = $parts ? implode(' & ', $parts) : 'Did not bat or bowl';

        $fielding = array_filter([
            $line['catches'] ? $line['catches'].' ct' : null,
            $line['stumpings'] ? $line['stumpings'].' st' : null,
            $line['run_outs'] ? $line['run_outs'].' ro' : null,
        ]);

        return $fielding ? $summary.', '.implode(', ', $fielding) : $summary;
    }

    /**
     * @param  array<string, mixed>  $line
     * @return array<string, mixed>
     */
    private function footballMatchDetail(array $line): array
    {
        return [
            'goals' => $line['goals'],
            'penalty_goals' => $line['penalty_goals'],
            'penalties_missed' => $line['penalties_missed'],
            'own_goals' => $line['own_goals'],
            'assists' => $line['assists'],
            'yellow_cards' => $line['yellow_cards'],
            'red_cards' => $line['red_cards'],
            'clean_sheet' => $line['clean_sheet'],
        ];
    }

    /**
     * "2 goals (1 pen), 1 assist, yellow card".
     *
     * @param  array<string, mixed>  $line
     */
    private function footballSummary(array $line): string
    {
        $plural = fn (int $count, string $word) => $count.' '.$word.($count === 1 ? '' : 's');

        $parts = array_filter([
            $line['goals'] ? $plural($line['goals'], 'goal').($line['penalty_goals'] ? ' ('.$line['penalty_goals'].' pen)' : '') : null,
            $line['assists'] ? $plural($line['assists'], 'assist') : null,
            $line['own_goals'] ? $plural($line['own_goals'], 'own goal') : null,
            $line['penalties_missed'] ? $plural($line['penalties_missed'], 'missed penalty') : null,
            $line['clean_sheet'] ? 'clean sheet' : null,
            $line['yellow_cards'] ? 'yellow card' : null,
            $line['red_cards'] ? 'red card' : null,
        ]);

        return $parts ? ucfirst(implode(', ', $parts)) : 'Played';
    }

    /* ---------------------------------------------------------------------
     | Helpers
     * -------------------------------------------------------------------*/

    private function sportOf(?Tournament $tournament): string
    {
        return $tournament?->sport_code === 'cricket' ? 'cricket' : 'football';
    }

    /** @param  array<int, array<string, mixed>>  $breakdown */
    private function hasSport(array $breakdown, string $sport): bool
    {
        return in_array($sport, array_column(array_column($breakdown, 'tournament'), 'sport_code'), true);
    }

    private function isLegal(CricketDelivery $ball): bool
    {
        return ! in_array($ball->extras, ['wide', 'no_ball'], true);
    }

    /** Byes and leg-byes go to the team, never onto the bowler's analysis. */
    private function runsChargedToBowler(CricketDelivery $ball): int
    {
        $chargeable = in_array($ball->extras, ['bye', 'leg_bye'], true) ? 0 : (int) $ball->extras_runs;

        return (int) $ball->runs_scored + $chargeable;
    }

    /** Cricket's overs.balls notation as a number: 16.2 is sixteen overs and two balls. */
    private function oversNotation(int $balls): float
    {
        return intdiv($balls, 6) + ($balls % 6) / 10;
    }
}
