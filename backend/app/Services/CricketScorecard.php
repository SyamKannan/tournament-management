<?php

namespace App\Services;

use App\Models\CricketDelivery;
use App\Models\CricketMatchState;
use App\Models\GameMatch;
use App\Models\Player;

/**
 * The batting and bowling card, derived from the delivery log.
 *
 * Nothing here is stored. `cricket_deliveries` already records the striker,
 * non-striker, bowler, runs, extras and dismissal for every ball, so a card
 * read back out of it can never drift from the scoreline — and undoing a ball
 * corrects the card for free.
 *
 * Deliveries bowled before the scorer named the crease carry a blank player id
 * (see ScoringEngine) and are skipped rather than shown as a nameless batter.
 */
class CricketScorecard
{
    /**
     * Dismissals credited to no bowler.
     */
    private const UNBOWLED_DISMISSALS = ['run_out', 'retired_hurt', 'obstructing_field'];

    public function __construct(private readonly LineupService $lineups) {}

    /**
     * Both innings, each with its batting card in batting order and its
     * bowling figures in the order the bowlers first bowled.
     *
     * @return array<int, array<string, mixed>>
     */
    public function forMatch(GameMatch $match, ?CricketMatchState $state): array
    {
        if (! $state) {
            return [];
        }

        $deliveries = CricketDelivery::query()
            ->where('match_id', $match->id)
            ->orderBy('sequence')
            ->get();

        $players = Player::query()
            ->whereIn('team_id', [$match->team_a_id, $match->team_b_id])
            ->get()
            ->keyBy('id');

        $lineup = collect($this->lineups->forMatch($match));

        $battingFirst = $match->batting_first_team_id ?: $match->team_a_id;
        $battingSecond = $battingFirst === $match->team_a_id ? $match->team_b_id : $match->team_a_id;

        $cards = [];

        foreach ([1 => $battingFirst, 2 => $battingSecond] as $innings => $battingTeamId) {
            $bowlingTeamId = $battingTeamId === $match->team_a_id ? $match->team_b_id : $match->team_a_id;
            $inningsBalls = $deliveries->where('innings', $innings);

            // Innings two only exists once the sides have swapped; showing an
            // empty card before that just clutters the display.
            if ($innings === 2 && $inningsBalls->isEmpty() && $state->current_innings < 2) {
                continue;
            }

            $cards[] = [
                'innings' => $innings,
                'batting_team_id' => $battingTeamId,
                'bowling_team_id' => $bowlingTeamId,
                'runs' => $innings === 1 ? $state->team_a_runs : $state->team_b_runs,
                'wickets' => $innings === 1 ? $state->team_a_wickets : $state->team_b_wickets,
                'overs' => $innings === 1 ? $state->team_a_overs : $state->team_b_overs,
                'extras' => (int) $inningsBalls->sum('extras_runs'),
                'batting' => $this->battingCard($inningsBalls, $lineup, $players, $battingTeamId),
                'bowling' => $this->bowlingCard($inningsBalls, $players),
            ];
        }

        return $cards;
    }

    /**
     * One row per player in the batting side's order — including those yet to
     * bat, so the card reads as a full team sheet rather than appearing a
     * player at a time.
     *
     * @param  \Illuminate\Support\Collection<int, CricketDelivery>  $balls
     * @param  \Illuminate\Support\Collection<int, array<string, mixed>>  $lineup
     * @param  \Illuminate\Support\Collection<string, Player>  $players
     * @return array<int, array<string, mixed>>
     */
    private function battingCard($balls, $lineup, $players, string $battingTeamId): array
    {
        $order = $lineup
            ->filter(fn (array $row) => $row['team_id'] === $battingTeamId && $row['is_playing'])
            ->pluck('player_id')
            ->all();

        // Anyone who came to the crease without being in the sheet (a late
        // change the organizer didn't save) still belongs on the card.
        foreach ($balls->pluck('striker_id')->filter()->unique() as $playerId) {
            if (! in_array($playerId, $order, true)) {
                $order[] = $playerId;
            }
        }

        $rows = [];

        foreach ($order as $playerId) {
            $faced = $balls->where('striker_id', $playerId);
            $dismissal = $balls->first(
                fn (CricketDelivery $ball) => $ball->is_wicket
                    && ($ball->dismissed_player_id ?: $ball->striker_id) === $playerId
            );

            // Wides are not balls faced; every other delivery is.
            $ballsFaced = $faced->filter(fn (CricketDelivery $ball) => $ball->extras !== 'wide')->count();
            $runs = (int) $faced->sum('runs_scored');

            $rows[] = [
                'player_id' => $playerId,
                'name' => $players->get($playerId)?->full_name ?? 'Player',
                'jersey_number' => $players->get($playerId)?->jersey_number,
                'runs' => $runs,
                'balls' => $ballsFaced,
                'fours' => $faced->where('runs_scored', 4)->count(),
                'sixes' => $faced->where('runs_scored', 6)->count(),
                'strike_rate' => $ballsFaced > 0 ? round($runs * 100 / $ballsFaced, 2) : 0.0,
                'has_batted' => $faced->isNotEmpty() || $dismissal !== null,
                'is_out' => $dismissal !== null,
                'dismissal' => $dismissal ? $this->dismissalText($dismissal, $players) : null,
            ];
        }

        return $rows;
    }

    /**
     * Figures for every bowler used, in the order they first bowled.
     *
     * @param  \Illuminate\Support\Collection<int, CricketDelivery>  $balls
     * @param  \Illuminate\Support\Collection<string, Player>  $players
     * @return array<int, array<string, mixed>>
     */
    private function bowlingCard($balls, $players): array
    {
        $rows = [];

        foreach ($balls->pluck('bowler_id')->filter()->unique() as $bowlerId) {
            $spell = $balls->where('bowler_id', $bowlerId);

            $legalBalls = $spell
                ->filter(fn (CricketDelivery $ball) => ! in_array($ball->extras, ['wide', 'no_ball'], true))
                ->count();

            $conceded = (int) $spell->sum(fn (CricketDelivery $ball) => $this->runsChargedToBowler($ball));

            $wickets = $spell->filter(
                fn (CricketDelivery $ball) => $ball->is_wicket
                    && ! in_array((string) $ball->wicket_type, self::UNBOWLED_DISMISSALS, true)
            )->count();

            $oversDecimal = $legalBalls / 6;

            $rows[] = [
                'player_id' => $bowlerId,
                'name' => $players->get($bowlerId)?->full_name ?? 'Bowler',
                'jersey_number' => $players->get($bowlerId)?->jersey_number,
                'overs' => $this->oversNotation($legalBalls),
                'balls' => $legalBalls,
                'maidens' => $this->maidens($spell),
                'runs' => $conceded,
                'wickets' => $wickets,
                'economy' => $oversDecimal > 0 ? round($conceded / $oversDecimal, 2) : 0.0,
            ];
        }

        return $rows;
    }

    /**
     * A completed over off which the bowler conceded nothing. Byes and
     * leg-byes don't break a maiden; wides and no-balls do, because they are
     * charged to the bowler.
     *
     * @param  \Illuminate\Support\Collection<int, CricketDelivery>  $spell
     */
    private function maidens($spell): int
    {
        return $spell
            ->groupBy('over_number')
            ->filter(function ($over) {
                $legal = $over->filter(
                    fn (CricketDelivery $ball) => ! in_array($ball->extras, ['wide', 'no_ball'], true)
                )->count();

                return $legal === 6
                    && $over->sum(fn (CricketDelivery $ball) => $this->runsChargedToBowler($ball)) === 0;
            })
            ->count();
    }

    private function runsChargedToBowler(CricketDelivery $ball): int
    {
        $chargeable = in_array($ball->extras, ['bye', 'leg_bye'], true) ? 0 : (int) $ball->extras_runs;

        return (int) $ball->runs_scored + $chargeable;
    }

    /**
     * Traditional shorthand — "c Anas b Rahul", "run out (Anas)" — so the big
     * screen reads like a printed card.
     *
     * @param  \Illuminate\Support\Collection<string, Player>  $players
     */
    private function dismissalText(CricketDelivery $ball, $players): string
    {
        $bowler = $players->get($ball->bowler_id)?->full_name;
        $fielder = $players->get($ball->fielder_id)?->full_name;

        return match ($ball->wicket_type) {
            'bowled' => $bowler ? "b {$bowler}" : 'bowled',
            'lbw' => $bowler ? "lbw b {$bowler}" : 'lbw',
            'caught' => match (true) {
                (bool) ($fielder && $bowler) => "c {$fielder} b {$bowler}",
                (bool) $bowler => "c & b {$bowler}",
                default => 'caught',
            },
            'caught_and_bowled' => $bowler ? "c & b {$bowler}" : 'caught & bowled',
            'stumped' => match (true) {
                (bool) ($fielder && $bowler) => "st {$fielder} b {$bowler}",
                (bool) $bowler => "st b {$bowler}",
                default => 'stumped',
            },
            'run_out' => $fielder ? "run out ({$fielder})" : 'run out',
            'hit_wicket' => $bowler ? "hit wicket b {$bowler}" : 'hit wicket',
            'retired_hurt' => 'retired hurt',
            'obstructing_field' => 'obstructing the field',
            default => 'out',
        };
    }

    /**
     * Cricket's overs.balls notation, where 1.3 means one over and three
     * balls — not a decimal.
     */
    private function oversNotation(int $legalBalls): string
    {
        return intdiv($legalBalls, 6).'.'.($legalBalls % 6);
    }
}
