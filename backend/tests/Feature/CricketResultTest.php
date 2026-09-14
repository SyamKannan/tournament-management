<?php

namespace Tests\Feature;

use App\Models\CricketMatchState;
use App\Models\GameMatch;
use App\Models\Tournament;
use App\Services\LineupService;
use App\Services\ScoreboardDirector;
use App\Services\ScoringEngine;
use Tests\TestCase;

/**
 * How an innings ends and a match is decided — and what the big screen shows
 * when it happens.
 */
class CricketResultTest extends TestCase
{
    private const MATCH_ID = 'match-crick-live-1';

    /** Bats first in the seed, so it defends the target. */
    private const TEAM_A = 'team-kozhikode-kings';

    /** Bats second, so it chases. */
    private const TEAM_B = 'team-coastal-warriors';

    private ScoringEngine $scoring;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scoring = app(ScoringEngine::class);
    }

    /* ------------------------------------------------------ Innings break */

    public function test_the_first_ball_of_the_second_innings_puts_the_match_back_in_play(): void
    {
        $this->startChase(firstInnings: 50);
        $this->assertSame('innings_break', $this->match()->status);

        $this->bowl(0);

        $this->assertSame('in_progress', $this->match()->status);
    }

    public function test_the_second_innings_cannot_be_started_twice(): void
    {
        $this->startChase(firstInnings: 50);

        $this->expectException(\RuntimeException::class);
        $this->scoring->switchCricketInnings(self::MATCH_ID);
    }

    /* --------------------------------------------------------- Deciding it */

    public function test_reaching_the_target_wins_by_the_wickets_in_hand(): void
    {
        $this->startChase(firstInnings: 4);

        $this->bowl(6);

        $match = $this->match();
        $this->assertSame('completed', $match->status);
        $this->assertSame(self::TEAM_B, $match->winner_team_id);
        $this->assertStringContainsString("won by {$this->allOutAt()} wickets", $match->result_summary);
    }

    public function test_bowling_the_chasing_side_out_wins_by_the_runs_to_spare(): void
    {
        $state = $this->startChase(firstInnings: 50);
        $state->team_b_wickets = $this->allOutAt() - 1;
        $state->save();

        $this->bowl(0, wicket: true);

        $match = $this->match();
        $this->assertSame('completed', $match->status);
        $this->assertSame(self::TEAM_A, $match->winner_team_id);
        $this->assertStringContainsString('won by 50 runs', $match->result_summary);
    }

    public function test_running_out_of_overs_short_of_the_target_ends_the_match(): void
    {
        $state = $this->startChase(firstInnings: 50);
        $state->total_overs = 1;
        $state->save();

        foreach (range(1, 5) as $ball) {
            $this->bowl(1);
            $this->assertNotSame('completed', $this->match()->status, "The match ended early, on ball {$ball}.");
        }

        $this->bowl(1);

        $match = $this->match();
        $this->assertSame('completed', $match->status);
        $this->assertSame(self::TEAM_A, $match->winner_team_id);
        $this->assertStringContainsString('won by 44 runs', $match->result_summary);
    }

    public function test_finishing_level_is_a_tie(): void
    {
        $state = $this->startChase(firstInnings: 4);
        $state->total_overs = 1;
        $state->save();

        $this->bowl(4);
        foreach (range(1, 5) as $ball) {
            $this->bowl(0);
        }

        $match = $this->match();
        $this->assertSame('completed', $match->status);
        $this->assertNull($match->winner_team_id);
        $this->assertSame('Match tied', $match->result_summary);
    }

    public function test_extras_in_the_second_innings_do_not_use_up_the_overs(): void
    {
        $state = $this->startChase(firstInnings: 50);
        $state->total_overs = 1;
        $state->save();

        foreach (range(1, 5) as $ball) {
            $this->bowl(0);
        }

        // A wide on what would be the last ball is bowled again, not counted.
        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID, 'innings' => 2, 'runsScored' => 0,
            'extras' => 'wide', 'extrasRuns' => 1, 'isWicket' => false,
        ]);

        $this->assertNotSame('completed', $this->match()->status);
    }

    /* --------------------------------------------------------------- Undo */

    public function test_undoing_the_ball_that_finished_the_match_reopens_it(): void
    {
        $this->startChase(firstInnings: 4);
        $this->bowl(6);
        $this->assertSame('completed', $this->match()->status);

        $this->scoring->undoLastCricketBall(self::MATCH_ID);

        $match = $this->match();
        $this->assertNotSame('completed', $match->status);
        $this->assertNull($match->winner_team_id);
        $this->assertNull($match->result_summary);
    }

    public function test_undoing_the_only_ball_of_the_chase_returns_to_the_innings_break(): void
    {
        $this->startChase(firstInnings: 50);
        $this->bowl(0);

        $this->scoring->undoLastCricketBall(self::MATCH_ID);

        $this->assertSame('innings_break', $this->match()->status);
    }

    /* ------------------------------------------------------ Finishing it */

    public function test_the_scorer_can_finish_the_match_during_the_chase(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $this->startChase(firstInnings: 50);
        $this->bowl(10);

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/finish')
            ->assertOk()
            ->assertJsonPath('match.status', 'completed')
            ->assertJsonPath('match.winner_team_id', self::TEAM_A);
    }

    public function test_the_match_cannot_be_finished_during_the_first_innings(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/finish')->assertStatus(400);
        $this->assertNotSame('completed', $this->match()->status);
    }

    public function test_a_finished_match_cannot_be_finished_again(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $this->startChase(firstInnings: 4);
        $this->bowl(6);

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/finish')->assertStatus(400);
    }

    public function test_another_organizer_cannot_finish_this_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $this->startChase(firstInnings: 50);

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/finish')->assertForbidden();
    }

    public function test_the_switch_innings_route_the_console_calls_exists(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/switch-innings')
            ->assertOk()
            ->assertJsonPath('state.current_innings', 2);
    }

    /* --------------------------------------------------------- Big screen */

    public function test_the_big_screen_shows_the_full_card_at_the_innings_break(): void
    {
        $this->startChase(firstInnings: 50);

        $this->assertSame('scorecard', app(ScoreboardDirector::class)->resolve($this->match()));
    }

    public function test_the_big_screen_shows_the_full_card_at_full_time(): void
    {
        $this->startChase(firstInnings: 4);
        $this->bowl(6);

        $this->assertSame('scorecard', app(ScoreboardDirector::class)->resolve($this->match()));
    }

    public function test_the_big_screen_returns_to_the_live_score_when_the_chase_begins(): void
    {
        $this->startChase(firstInnings: 50);
        $this->bowl(0);

        $this->assertSame('live', app(ScoreboardDirector::class)->resolve($this->match()));
    }

    public function test_a_finished_football_match_keeps_its_final_score_on_screen(): void
    {
        $match = GameMatch::find('match-fb-live-1');
        $match->status = 'completed';
        $match->scoreboard_stage = 'auto';

        $this->assertSame('live', app(ScoreboardDirector::class)->resolve($match));
    }

    /* ----------------------------------------------------------- Setting */

    public function test_a_new_innings_takes_its_length_from_the_tournament(): void
    {
        $match = $this->match();
        $tournament = Tournament::find($match->tournament_id);
        $tournament->settings = [...($tournament->settings ?? []), 'total_overs' => 10];
        $tournament->save();

        CricketMatchState::query()->where('match_id', self::MATCH_ID)->delete();

        $this->assertSame(10, $this->scoring->cricketState(self::MATCH_ID)->total_overs);
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * Put the match into its second innings with a known first-innings total,
     * so each test sets its own target rather than inheriting the seed's.
     */
    private function startChase(int $firstInnings): CricketMatchState
    {
        $state = $this->scoring->cricketState(self::MATCH_ID);
        $state->team_a_runs = $firstInnings;
        $state->save();

        $this->scoring->switchCricketInnings(self::MATCH_ID);

        return CricketMatchState::query()->where('match_id', self::MATCH_ID)->first();
    }

    private function bowl(int $runs, bool $wicket = false): void
    {
        $this->scoring->recordCricketBall([
            'matchId' => self::MATCH_ID,
            'innings' => 2,
            'runsScored' => $runs,
            'extras' => 'none',
            'isWicket' => $wicket,
            'wicketType' => $wicket ? 'bowled' : null,
        ]);
    }

    /** One fewer than the chasing side's match-day eleven. */
    private function allOutAt(): int
    {
        $playing = count(app(LineupService::class)->playingFor($this->match(), self::TEAM_B));

        return $playing > 1 ? $playing - 1 : 10;
    }

    private function match(): GameMatch
    {
        return GameMatch::find(self::MATCH_ID);
    }
}
