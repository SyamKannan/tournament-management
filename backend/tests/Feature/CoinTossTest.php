<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Services\TossService;
use Tests\TestCase;

class CoinTossTest extends TestCase
{
    private const MATCH_ID = 'match-crick-live-1';

    private const TEAM_A = 'team-kozhikode-kings';

    private const TEAM_B = 'team-coastal-warriors';

    private TossService $toss;

    protected function setUp(): void
    {
        parent::setUp();
        $this->toss = app(TossService::class);
    }

    /* ------------------------------------------------------- Digital mode */

    public function test_calling_the_toss_flips_a_coin_and_resolves_a_winner(): void
    {
        $this->clearToss();

        $match = $this->toss->call(self::MATCH_ID, self::TEAM_A, 'heads');

        $this->assertContains($match->toss_result, ['heads', 'tails']);
        $this->assertSame(self::TEAM_A, $match->toss_caller_team_id);
        $this->assertSame('heads', $match->toss_call);
        $this->assertSame('digital', $match->toss_method);
        $this->assertContains($match->toss_winner_team_id, [self::TEAM_A, self::TEAM_B]);
        $this->assertNull($match->toss_decision);
        $this->assertNotNull($match->toss_time);

        // The call resolves the winner deterministically from the result.
        $expectedWinner = $match->toss_result === 'heads' ? self::TEAM_A : self::TEAM_B;
        $this->assertSame($expectedWinner, $match->toss_winner_team_id);
    }

    public function test_electing_to_bat_makes_the_toss_winner_bat_first(): void
    {
        $this->clearToss();
        $called = $this->toss->call(self::MATCH_ID, self::TEAM_A, 'heads');

        $match = $this->toss->decide(self::MATCH_ID, 'bat');

        $this->assertSame('bat', $match->toss_decision);
        $this->assertSame($called->toss_winner_team_id, $match->batting_first_team_id);
    }

    public function test_electing_to_bowl_makes_the_other_side_bat_first(): void
    {
        $this->clearToss();
        $called = $this->toss->call(self::MATCH_ID, self::TEAM_A, 'heads');
        $expectedBattingFirst = $called->toss_winner_team_id === self::TEAM_A ? self::TEAM_B : self::TEAM_A;

        $match = $this->toss->decide(self::MATCH_ID, 'bowl');

        $this->assertSame('bowl', $match->toss_decision);
        $this->assertSame($expectedBattingFirst, $match->batting_first_team_id);
    }

    public function test_deciding_before_calling_the_toss_is_rejected(): void
    {
        $this->clearToss();

        $this->expectException(\RuntimeException::class);
        $this->toss->decide(self::MATCH_ID, 'bat');
    }

    public function test_deciding_twice_is_rejected(): void
    {
        $this->clearToss();
        $this->toss->call(self::MATCH_ID, self::TEAM_A, 'heads');
        $this->toss->decide(self::MATCH_ID, 'bat');

        $this->expectException(\RuntimeException::class);
        $this->toss->decide(self::MATCH_ID, 'bowl');
    }

    public function test_calling_the_toss_for_a_team_outside_the_match_is_rejected(): void
    {
        $this->clearToss();

        $this->expectException(\RuntimeException::class);
        $this->toss->call(self::MATCH_ID, 'team-not-in-this-match', 'heads');
    }

    /* -------------------------------------------------------- Manual mode */

    public function test_manual_toss_records_winner_and_decision_in_one_step(): void
    {
        $this->clearToss();

        $match = $this->toss->recordManual(self::MATCH_ID, self::TEAM_B, 'bowl');

        $this->assertSame('manual', $match->toss_method);
        $this->assertSame(self::TEAM_B, $match->toss_winner_team_id);
        $this->assertSame('bowl', $match->toss_decision);
        $this->assertNull($match->toss_call);
        $this->assertNull($match->toss_result);
        $this->assertNull($match->toss_caller_team_id);
        // Team B won and chose to bowl, so team A bats first.
        $this->assertSame(self::TEAM_A, $match->batting_first_team_id);
    }

    /* ---------------------------------------- Cannot toss twice (locking) */

    public function test_a_second_digital_call_on_an_already_tossed_match_is_rejected(): void
    {
        $this->clearToss();
        $this->toss->call(self::MATCH_ID, self::TEAM_A, 'heads');

        $this->expectException(\RuntimeException::class);
        $this->toss->call(self::MATCH_ID, self::TEAM_B, 'tails');
    }

    public function test_a_manual_toss_after_a_digital_call_is_rejected(): void
    {
        $this->clearToss();
        $this->toss->call(self::MATCH_ID, self::TEAM_A, 'heads');

        $this->expectException(\RuntimeException::class);
        $this->toss->recordManual(self::MATCH_ID, self::TEAM_B, 'bat');
    }

    public function test_a_second_manual_toss_on_an_already_tossed_match_is_rejected(): void
    {
        $this->clearToss();
        $this->toss->recordManual(self::MATCH_ID, self::TEAM_A, 'bat');

        $this->expectException(\RuntimeException::class);
        $this->toss->recordManual(self::MATCH_ID, self::TEAM_B, 'bowl');
    }

    /* --------------------------------------------------------- Over HTTP */

    public function test_scoring_is_locked_until_the_toss_is_recorded(): void
    {
        $this->clearToss();
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/ball', [
            'innings' => 1,
            'runs_scored' => 1,
            'extras' => 'none',
            'is_wicket' => false,
        ])->assertStatus(422);

        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/manual', [
            'winner_team_id' => self::TEAM_A,
            'decision' => 'bat',
        ])->assertOk();

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/ball', [
            'innings' => 1,
            'runs_scored' => 1,
            'extras' => 'none',
            'is_wicket' => false,
        ])->assertOk();
    }

    public function test_only_authorized_roles_can_run_the_toss(): void
    {
        $this->clearToss();

        $this->actingAsUser('shameer.player@gmail.com');
        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/manual', [
            'winner_team_id' => self::TEAM_A,
            'decision' => 'bat',
        ])->assertStatus(403);

        $this->actingAsUser('manager@malabarblasters.com');
        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/manual', [
            'winner_team_id' => self::TEAM_A,
            'decision' => 'bat',
        ])->assertStatus(403);

        $this->actingAsUser('admin@malabar.com');
        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/manual', [
            'winner_team_id' => self::TEAM_A,
            'decision' => 'bat',
        ])->assertOk();
    }

    public function test_a_second_toss_over_http_is_rejected(): void
    {
        $this->clearToss();
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/manual', [
            'winner_team_id' => self::TEAM_A,
            'decision' => 'bat',
        ])->assertOk();

        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/manual', [
            'winner_team_id' => self::TEAM_B,
            'decision' => 'bowl',
        ])->assertStatus(400);
    }

    public function test_the_public_toss_endpoint_returns_the_recorded_result_without_auth(): void
    {
        $this->clearToss();
        $this->toss->recordManual(self::MATCH_ID, self::TEAM_A, 'bat');

        $response = $this->getJson('/api/matches/'.self::MATCH_ID.'/toss')->assertOk();

        $this->assertSame(self::TEAM_A, $response->json('toss_winner_team_id'));
        $this->assertSame('bat', $response->json('toss_decision'));
        $this->assertSame('manual', $response->json('toss_method'));
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * match-crick-live-1 ships pre-tossed (it's a seeded "live" fixture), so
     * tests that exercise the toss flow itself reset it first.
     */
    private function clearToss(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->toss_caller_team_id = null;
        $match->toss_call = null;
        $match->toss_result = null;
        $match->toss_winner_team_id = null;
        $match->toss_decision = null;
        $match->toss_method = null;
        $match->toss_time = null;
        $match->batting_first_team_id = null;
        $match->save();
    }
}
