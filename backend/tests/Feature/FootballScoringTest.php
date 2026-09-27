<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\Standing;
use App\Services\ScoringEngine;
use Tests\TestCase;

class FootballScoringTest extends TestCase
{
    private const MATCH_ID = 'match-fb-live-1';

    private ScoringEngine $scoring;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scoring = app(ScoringEngine::class);
    }

    public function test_a_goal_raises_the_score_and_feeds_the_table(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $before = $this->scoring->footballState(self::MATCH_ID)->team_a_score;

        $this->scoring->addFootballEvent([
            'matchId' => self::MATCH_ID,
            'teamId' => $match->team_a_id,
            'playerId' => 'pl-mb-3',
            'eventType' => 'goal',
            'minute' => 35,
        ]);

        $this->assertSame($before + 1, $this->scoring->footballState(self::MATCH_ID)->team_a_score);

        $standing = Standing::query()
            ->where('tournament_id', $match->tournament_id)
            ->where('team_id', $match->team_a_id)
            ->first();

        $this->assertNotNull($standing);
        $this->assertGreaterThanOrEqual(3, $standing->goals_for);
    }

    public function test_undo_reverses_the_last_goal(): void
    {
        $match = GameMatch::find(self::MATCH_ID);

        $this->scoring->addFootballEvent([
            'matchId' => self::MATCH_ID,
            'teamId' => $match->team_a_id,
            'playerId' => 'pl-mb-3',
            'eventType' => 'goal',
            'minute' => 35,
        ]);

        $before = $this->scoring->footballState(self::MATCH_ID)->team_a_score;
        $this->scoring->undoLastFootballEvent(self::MATCH_ID);

        $this->assertSame($before - 1, $this->scoring->footballState(self::MATCH_ID)->team_a_score);
    }

    public function test_an_own_goal_credits_the_opposing_side(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $before = $this->scoring->footballState(self::MATCH_ID);
        $teamB = $before->team_b_score;

        $this->scoring->addFootballEvent([
            'matchId' => self::MATCH_ID,
            'teamId' => $match->team_a_id,
            'playerId' => 'pl-mb-3',
            'eventType' => 'own_goal',
            'minute' => 40,
        ]);

        $after = $this->scoring->footballState(self::MATCH_ID);

        $this->assertSame($teamB + 1, $after->team_b_score);
        $this->assertSame($before->team_a_score, $after->team_a_score);
    }

    public function test_a_card_is_logged_without_changing_the_score(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $before = $this->scoring->footballState(self::MATCH_ID);

        $this->scoring->addFootballEvent([
            'matchId' => self::MATCH_ID,
            'teamId' => $match->team_b_id,
            'playerId' => 'pl-gvs-2',
            'eventType' => 'yellow_card',
            'minute' => 52,
        ]);

        $after = $this->scoring->footballState(self::MATCH_ID);

        $this->assertSame($before->team_a_score, $after->team_a_score);
        $this->assertSame($before->team_b_score, $after->team_b_score);
        $this->assertCount($before->events->count() + 1, $after->events);
    }

    public function test_finishing_the_match_records_the_winner_and_completes_it(): void
    {
        $this->scoring->updateFootballTimer(self::MATCH_ID, 'set_half', ['half' => 'full_time']);

        $match = GameMatch::find(self::MATCH_ID);
        $state = $this->scoring->footballState(self::MATCH_ID);

        $this->assertSame('completed', $match->status);
        $this->assertFalse($state->is_timer_running);
        $this->assertNotEmpty($match->result_summary);
        $this->assertSame($match->team_a_id, $match->winner_team_id);
    }

    public function test_a_shoot_out_decides_a_level_match_without_changing_the_score(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $state = $this->scoring->footballState(self::MATCH_ID);
        $state->forceFill(['team_a_score' => 1, 'team_b_score' => 1])->save();

        $this->scoring->updateFootballTimer(self::MATCH_ID, 'set_half', ['half' => 'penalties']);

        $kick = fn (string $team, string $player, string $type) => $this->scoring->addFootballEvent([
            'matchId' => self::MATCH_ID, 'teamId' => $team, 'playerId' => $player, 'eventType' => $type,
        ]);

        $kick($match->team_a_id, 'pl-mb-3', 'penalty_goal');
        $kick($match->team_b_id, 'pl-gvs-2', 'penalty_missed');
        $kick($match->team_a_id, 'pl-mb-3', 'penalty_goal');
        $kick($match->team_b_id, 'pl-gvs-2', 'penalty_goal');

        $during = $this->scoring->footballState(self::MATCH_ID);
        $this->assertSame([1, 1], [$during->team_a_score, $during->team_b_score], 'a shoot-out kick is not a goal');
        $this->assertSame([2, 1], [$during->team_a_penalties, $during->team_b_penalties]);

        // Undo takes the kick back off the shoot-out tally, not the score.
        $this->scoring->undoLastFootballEvent(self::MATCH_ID);
        $this->assertSame(0, $this->scoring->footballState(self::MATCH_ID)->team_b_penalties);

        $this->expectOpenPlayRefused($match->team_a_id);

        $this->scoring->updateFootballTimer(self::MATCH_ID, 'finish');

        $match->refresh();
        $this->assertSame($match->team_a_id, $match->winner_team_id);
        $this->assertStringContainsString('on penalties (1 - 1)', (string) $match->result_summary);
    }

    private function expectOpenPlayRefused(string $teamId): void
    {
        try {
            $this->scoring->addFootballEvent([
                'matchId' => self::MATCH_ID, 'teamId' => $teamId, 'playerId' => 'pl-mb-3', 'eventType' => 'goal',
            ]);
            $this->fail('an open-play goal was accepted during the shoot-out');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('shoot-out', $e->getMessage());
        }
    }

    public function test_scoring_over_http_returns_the_updated_state(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $this->actingAsUser('scorer@greenvalley.com');

        $response = $this->postJson('/api/matches/'.self::MATCH_ID.'/football/event', [
            'team_id' => $match->team_a_id,
            'player_id' => 'pl-mb-3',
            'event_type' => 'goal',
            'minute' => 61,
        ])->assertOk();

        $this->assertSame(3, $response->json('state.team_a_score'));
        $this->assertSame('goal', $response->json('event.event_type'));
        $this->assertIsArray($response->json('state.events'));
    }
}
