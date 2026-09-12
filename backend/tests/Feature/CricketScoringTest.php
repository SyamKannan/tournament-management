<?php

namespace Tests\Feature;

use App\Models\CricketDelivery;
use App\Models\CricketMatchState;
use App\Models\GameMatch;
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

    public function test_flipping_the_toss_picks_a_winner_and_moves_the_match_to_toss_status(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'scheduled';
        $match->save();

        $state = $this->scoring->flipCricketToss(self::MATCH_ID);

        $this->assertContains($state->toss_winner_team_id, [$match->team_a_id, $match->team_b_id]);
        $this->assertNull($state->toss_decision);
        $this->assertSame('toss', GameMatch::find(self::MATCH_ID)->status);
    }

    public function test_electing_to_bat_makes_the_toss_winner_the_batting_side(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'scheduled';
        $match->save();

        $flipped = $this->scoring->flipCricketToss(self::MATCH_ID);
        $winner = $flipped->toss_winner_team_id;
        $loser = $winner === $match->team_a_id ? $match->team_b_id : $match->team_a_id;

        $state = $this->scoring->recordCricketTossDecision(self::MATCH_ID, 'bat');

        $this->assertSame('bat', $state->toss_decision);
        $this->assertSame($winner, $state->batting_team_id);
        $this->assertSame($loser, $state->bowling_team_id);
    }

    public function test_electing_to_bowl_makes_the_toss_winner_the_bowling_side(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'scheduled';
        $match->save();

        $flipped = $this->scoring->flipCricketToss(self::MATCH_ID);
        $winner = $flipped->toss_winner_team_id;
        $loser = $winner === $match->team_a_id ? $match->team_b_id : $match->team_a_id;

        $state = $this->scoring->recordCricketTossDecision(self::MATCH_ID, 'bowl');

        $this->assertSame('bowl', $state->toss_decision);
        $this->assertSame($loser, $state->batting_team_id);
        $this->assertSame($winner, $state->bowling_team_id);
    }

    public function test_recording_a_decision_before_flipping_the_coin_is_rejected(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'scheduled';
        $match->save();

        // The seeded fixture already carries a toss result; clear it so this
        // match starts from the "coin not yet flipped" state under test.
        $state = $this->scoring->cricketState(self::MATCH_ID);
        $state->toss_winner_team_id = null;
        $state->save();

        $this->expectException(\RuntimeException::class);
        $this->scoring->recordCricketTossDecision(self::MATCH_ID, 'bat');
    }

    public function test_flipping_the_toss_once_scoring_has_started_is_rejected(): void
    {
        // match-crick-live-1 is seeded as in_progress with balls already bowled.
        $this->expectException(\RuntimeException::class);
        $this->scoring->flipCricketToss(self::MATCH_ID);
    }

    public function test_flipping_the_toss_over_http_returns_the_updated_state(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'scheduled';
        $match->save();

        $this->actingAsUser('admin@malabar.com');

        $response = $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/toss/flip')->assertOk();

        $this->assertContains($response->json('state.toss_winner_team_id'), [$match->team_a_id, $match->team_b_id]);
        $this->assertSame('toss', $response->json('match.status'));
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

    /* ------------------------------------------------------------- Helpers */

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
