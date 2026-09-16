<?php

namespace Tests\Feature;

use App\Models\CricketDelivery;
use App\Models\CricketMatchState;
use App\Models\GameMatch;
use App\Models\Player;
use App\Models\Standing;
use App\Services\CricketScorecard;
use App\Services\PlayerStatsService;
use App\Services\ScoringEngine;
use Tests\TestCase;

class CricketScoringTest extends TestCase
{
    private const MATCH_ID = 'match-crick-live-1';

    private ScoringEngine $scoring;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scoring = app(ScoringEngine::class);
    }

    public function test_a_boundary_adds_runs_and_updates_the_run_rate(): void
    {
        $before = $this->scoring->cricketState(self::MATCH_ID)->team_a_runs;

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 4,
            'extras' => 'none',
            'isWicket' => false,
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $after = $this->scoring->cricketState(self::MATCH_ID);

        $this->assertSame($before + 4, $after->team_a_runs);
        $this->assertGreaterThan(0, $after->current_run_rate);
    }

    public function test_strike_rotates_on_a_single_but_returns_at_the_end_of_the_over(): void
    {
        $this->bowlDotsUntilBallOfOver(5);
        $this->setBatters('pl-kk-1', 'pl-kk-2');

        // Ball six: the single swaps ends, then the over change swaps them back,
        // so the same batter keeps strike for the next over.
        $this->bowlSingle();

        $this->assertSame('pl-kk-1', $this->scoring->cricketState(self::MATCH_ID)->current_striker_id);

        // First ball of the next over: a single simply swaps ends.
        $this->bowlSingle();

        $after = $this->scoring->cricketState(self::MATCH_ID);

        $this->assertSame('pl-kk-2', $after->current_striker_id);
        $this->assertSame('pl-kk-1', $after->current_non_striker_id);
    }

    public function test_a_wide_adds_a_run_without_consuming_a_legal_ball(): void
    {
        // Bowl one legal ball first so the over count reflects the delivery log
        // before the wide is measured against it.
        $this->bowlDot();
        $before = $this->scoring->cricketState(self::MATCH_ID);

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'wide',
            'isWicket' => false,
        ]);

        $after = $this->scoring->cricketState(self::MATCH_ID);

        $this->assertSame($before->team_a_runs + 1, $after->team_a_runs);
        $this->assertSame($before->team_a_overs, $after->team_a_overs);
    }

    public function test_a_wicket_increments_the_tally(): void
    {
        $before = $this->scoring->cricketState(self::MATCH_ID)->team_a_wickets;

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'none',
            'isWicket' => true,
            'wicketType' => 'bowled',
            'dismissedPlayerId' => 'pl-kk-1',
        ]);

        $this->assertSame($before + 1, $this->scoring->cricketState(self::MATCH_ID)->team_a_wickets);
    }

    public function test_undo_reverses_the_last_delivery(): void
    {
        $before = $this->scoring->cricketState(self::MATCH_ID);
        $runsBefore = $before->team_a_runs;
        $ballsBefore = $before->deliveries->count();

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 6,
            'extras' => 'none',
            'isWicket' => false,
        ]);

        $this->scoring->undoLastCricketBall(self::MATCH_ID);

        $after = $this->scoring->cricketState(self::MATCH_ID);

        $this->assertSame($runsBefore, $after->team_a_runs);
        $this->assertCount($ballsBefore, $after->deliveries);
    }

    public function test_switching_innings_sets_the_target_and_swaps_the_sides(): void
    {
        $before = $this->scoring->cricketState(self::MATCH_ID);
        $batting = $before->batting_team_id;
        $bowling = $before->bowling_team_id;

        $state = $this->scoring->switchCricketInnings(self::MATCH_ID);

        $this->assertSame(2, $state->current_innings);
        $this->assertSame($before->team_a_runs + 1, $state->target_runs);
        $this->assertSame($bowling, $state->batting_team_id);
        $this->assertSame($batting, $state->bowling_team_id);
        $this->assertSame('innings_break', GameMatch::find(self::MATCH_ID)->status);
    }

    public function test_chasing_past_the_target_completes_the_match(): void
    {
        $this->scoring->switchCricketInnings(self::MATCH_ID);

        $state = CricketMatchState::query()->where('match_id', self::MATCH_ID)->first();
        $state->target_runs = 5;
        $state->save();

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 2,
            'runsScored' => 6,
            'extras' => 'none',
            'isWicket' => false,
        ]);

        $match = GameMatch::find(self::MATCH_ID);

        $this->assertSame('completed', $match->status);
        $this->assertStringContainsString('won by', $match->result_summary);
    }

    public function test_scoring_a_ball_over_http_returns_the_updated_state(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $response = $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/ball', [
            'innings' => 1,
            'runs_scored' => 6,
            'extras' => 'none',
            'is_wicket' => false,
            'striker_id' => 'pl-kk-1',
            'non_striker_id' => 'pl-kk-2',
            'bowler_id' => 'pl-cw-3',
            'commentary' => 'Launched over long-on for SIX!',
        ])->assertOk();

        $this->assertSame(6, $response->json('delivery.runs_scored'));
        $this->assertIsArray($response->json('state.deliveries'));
        $this->assertGreaterThan(0, $response->json('state.team_a_runs'));
    }

    /* --------------------------------------------- Extras, strike and stats */

    public function test_a_no_ball_hit_for_four_credits_the_bat_and_the_penalty_separately(): void
    {
        $before = $this->scoring->cricketState(self::MATCH_ID)->team_a_runs;

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 4,
            'extras' => 'no_ball',
            'extrasRuns' => 1,
            'isWicket' => false,
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $state = $this->scoring->cricketState(self::MATCH_ID);
        $delivery = $state->deliveries->last();

        $this->assertSame($before + 5, $state->team_a_runs);
        $this->assertSame(4, $delivery->runs_scored);
        $this->assertSame(1, $delivery->extras_runs);
    }

    public function test_four_byes_are_all_extras_and_none_of_them_the_batters(): void
    {
        $before = $this->scoring->cricketState(self::MATCH_ID)->team_a_runs;

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'bye',
            'extrasRuns' => 4,
            'isWicket' => false,
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $this->assertSame($before + 4, $this->scoring->cricketState(self::MATCH_ID)->team_a_runs);
    }

    public function test_an_odd_number_of_byes_changes_the_strike(): void
    {
        $this->bowlDotsUntilBallOfOver(1);
        $this->setBatters('pl-kk-1', 'pl-kk-2');

        // The batters ran one, so they have changed ends even though the run
        // was never off the bat.
        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'leg_bye',
            'extrasRuns' => 1,
            'isWicket' => false,
        ]);

        $this->assertSame('pl-kk-2', $this->scoring->cricketState(self::MATCH_ID)->current_striker_id);
    }

    public function test_the_one_run_penalty_on_a_wide_does_not_change_the_strike(): void
    {
        $this->bowlDotsUntilBallOfOver(1);
        $this->setBatters('pl-kk-1', 'pl-kk-2');

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'wide',
            'extrasRuns' => 1,
            'isWicket' => false,
        ]);

        $this->assertSame('pl-kk-1', $this->scoring->cricketState(self::MATCH_ID)->current_striker_id);
    }

    public function test_a_delivery_records_the_players_it_was_bowled_to(): void
    {
        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 2,
            'extras' => 'none',
            'isWicket' => false,
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $delivery = $this->scoring->cricketState(self::MATCH_ID)->deliveries->last();

        $this->assertSame('pl-kk-1', $delivery->striker_id);
        $this->assertSame('pl-cw-3', $delivery->bowler_id);
    }

    public function test_runs_and_wickets_reach_the_players_career_totals(): void
    {
        $runsBefore = $this->careerStat('pl-kk-1', 'runs_scored');
        $wicketsBefore = $this->careerStat('pl-cw-3', 'wickets_taken');

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 6,
            'extras' => 'none',
            'isWicket' => false,
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'none',
            'isWicket' => true,
            'wicketType' => 'bowled',
            'dismissedPlayerId' => 'pl-kk-1',
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $this->assertSame($runsBefore + 6, $this->careerStat('pl-kk-1', 'runs_scored'));
        $this->assertSame($wicketsBefore + 1, $this->careerStat('pl-cw-3', 'wickets_taken'));
    }

    public function test_a_run_out_is_not_credited_to_the_bowler(): void
    {
        $before = $this->careerStat('pl-cw-3', 'wickets_taken');

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'none',
            'isWicket' => true,
            'wicketType' => 'run_out',
            'dismissedPlayerId' => 'pl-kk-2',
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $this->assertSame($before, $this->careerStat('pl-cw-3', 'wickets_taken'));
    }

    public function test_byes_are_not_charged_to_the_bowler(): void
    {
        $before = $this->careerStat('pl-cw-3', 'runs_conceded');

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'bye',
            'extrasRuns' => 4,
            'isWicket' => false,
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $this->assertSame($before, $this->careerStat('pl-cw-3', 'runs_conceded'));
    }

    public function test_undo_takes_the_players_career_totals_back_with_it(): void
    {
        $runsBefore = $this->careerStat('pl-kk-1', 'runs_scored');
        $wicketsBefore = $this->careerStat('pl-cw-3', 'wickets_taken');

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 4,
            'extras' => 'none',
            'isWicket' => false,
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $this->scoring->undoLastCricketBall(self::MATCH_ID);

        $this->assertSame($runsBefore, $this->careerStat('pl-kk-1', 'runs_scored'));
        $this->assertSame($wicketsBefore, $this->careerStat('pl-cw-3', 'wickets_taken'));
    }

    public function test_undo_puts_the_batters_back_at_the_ends_they_came_from(): void
    {
        $this->bowlDotsUntilBallOfOver(1);
        $this->setBatters('pl-kk-1', 'pl-kk-2');

        // A single swaps the ends…
        $this->bowlSingle();
        $this->assertSame('pl-kk-2', $this->scoring->cricketState(self::MATCH_ID)->current_striker_id);

        // …and undoing it has to swap them back, or the next ball would be
        // credited to the wrong batter.
        $after = $this->scoring->undoLastCricketBall(self::MATCH_ID);

        $this->assertSame('pl-kk-1', $after->current_striker_id);
        $this->assertSame('pl-kk-2', $after->current_non_striker_id);
    }

    /* ------------------------------------------------------------- Scorecard */

    public function test_the_scorecard_adds_up_what_the_delivery_log_holds(): void
    {
        $opening = $this->currentCard();
        $openingBatter = collect($opening['batting'])->firstWhere('player_id', 'pl-kk-1');
        $foursBefore = $openingBatter['fours'];
        $sixesBefore = $openingBatter['sixes'];
        $runsBefore = $openingBatter['runs'];
        $concededBefore = collect($opening['bowling'])->firstWhere('player_id', 'pl-cw-3')['runs'] ?? 0;

        foreach ([4, 6, 1] as $runs) {
            // Reset the ends each time so every run belongs to pl-kk-1 and the
            // tally is unambiguous.
            $this->setBatters('pl-kk-1', 'pl-kk-2');

            $this->scoring->recordCricketBall([
                'matchId' => self::MATCH_ID,
                'innings' => 1,
                'runsScored' => $runs,
                'extras' => 'none',
                'isWicket' => false,
                'strikerId' => 'pl-kk-1',
                'nonStrikerId' => 'pl-kk-2',
                'bowlerId' => 'pl-cw-3',
            ]);
        }

        $card = [$this->currentCard()];

        $batter = collect($card[0]['batting'])->firstWhere('player_id', 'pl-kk-1');

        // Measured as deltas: the demo fixture already has deliveries logged
        // against this batter before the three bowled here.
        $this->assertSame($foursBefore + 1, $batter['fours']);
        $this->assertSame($sixesBefore + 1, $batter['sixes']);
        $this->assertSame($runsBefore + 11, $batter['runs']);
        $this->assertFalse($batter['is_out']);

        $bowler = collect($card[0]['bowling'])->firstWhere('player_id', 'pl-cw-3');
        $this->assertSame($concededBefore + 11, $bowler['runs']);
    }

    public function test_the_scorecard_reads_a_dismissal_the_way_a_printed_card_would(): void
    {
        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'none',
            'isWicket' => true,
            'wicketType' => 'caught',
            'dismissedPlayerId' => 'pl-kk-1',
            'fielderId' => 'pl-cw-2',
            'strikerId' => 'pl-kk-1',
            'nonStrikerId' => 'pl-kk-2',
            'bowlerId' => 'pl-cw-3',
        ]);

        $batter = collect($this->currentCard()['batting'])->firstWhere('player_id', 'pl-kk-1');

        $this->assertTrue($batter['is_out']);
        $this->assertStringStartsWith('c ', $batter['dismissal']);
        $this->assertStringContainsString(' b ', $batter['dismissal']);
    }

    /* ------------------------------------------------------------- Helpers */

    /* ------------------------------------------------------------- Standings */

    public function test_runs_go_to_the_side_that_actually_batted_first(): void
    {
        // The toss put team B in first, so the first-innings tally on the state
        // row is theirs — the columns are named team_a/team_b but hold innings
        // one and two.
        $match = GameMatch::find(self::MATCH_ID);
        $match->batting_first_team_id = $match->team_b_id;
        $match->save();

        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 6,
            'extras' => 'none',
            'isWicket' => false,
            'strikerId' => 'pl-cw-1',
            'nonStrikerId' => 'pl-cw-2',
            'bowlerId' => 'pl-kk-3',
        ]);

        $inningsRuns = $this->scoring->cricketState(self::MATCH_ID)->team_a_runs;

        $battedFirst = Standing::query()
            ->where('tournament_id', $match->tournament_id)
            ->where('team_id', $match->team_b_id)
            ->first();
        $bowledFirst = Standing::query()
            ->where('tournament_id', $match->tournament_id)
            ->where('team_id', $match->team_a_id)
            ->first();

        $this->assertSame($inningsRuns, $battedFirst->runs_scored);
        $this->assertSame($inningsRuns, $bowledFirst->runs_conceded);
    }

    /** The first-innings card as it stands right now. */
    private function currentCard(): array
    {
        return app(CricketScorecard::class)->forMatch(
            GameMatch::find(self::MATCH_ID),
            $this->scoring->cricketState(self::MATCH_ID)
        )[0];
    }

    /** One of a player's cricket totals, as the stats service reads it off the log. */
    private function careerStat(string $playerId, string $stat): mixed
    {
        return app(PlayerStatsService::class)->forPlayer(Player::findOrFail($playerId))['cricket'][$stat];
    }

    private function setBatters(string $striker, string $nonStriker): void
    {
        $state = $this->scoring->cricketState(self::MATCH_ID);
        $state->current_striker_id = $striker;
        $state->current_non_striker_id = $nonStriker;
        $state->save();
    }

    private function bowlDot(): void
    {
        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 0,
            'extras' => 'none',
            'isWicket' => false,
        ]);
    }

    private function bowlSingle(): void
    {
        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 1,
            'runsScored' => 1,
            'extras' => 'none',
            'isWicket' => false,
        ]);
    }

    /**
     * Bowl dot balls until the next delivery will be ball `$ballOfOver` of the
     * current over, so over-boundary behaviour can be asserted deterministically.
     */
    private function bowlDotsUntilBallOfOver(int $ballOfOver): void
    {
        $legalBalls = CricketDelivery::query()
            ->where('match_id', self::MATCH_ID)
            ->where('innings', 1)
            ->whereNotIn('extras', ['wide', 'no_ball'])
            ->count();

        while ($legalBalls % 6 !== $ballOfOver) {
            $this->bowlDot();
            $legalBalls++;
        }
    }
}
