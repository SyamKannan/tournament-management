<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Tournament;
use App\Services\BillingService;
use App\Support\Ids;
use Tests\TestCase;

class BillingTest extends TestCase
{
    private BillingService $billing;

    protected function setUp(): void
    {
        parent::setUp();
        $this->billing = app(BillingService::class);
    }

    public function test_plan_catalogue_defines_the_expected_tournament_allowances(): void
    {
        $this->assertSame(1, Plan::find('plan-free')->tournament_limit);
        $this->assertSame(2, Plan::find('plan-basic')->tournament_limit);
        $this->assertSame(5, Plan::find('plan-standard')->tournament_limit);
    }

    public function test_tournament_limit_blocks_a_basic_plan_after_its_allowance_is_used(): void
    {
        $before = $this->billing->checkLimit('org-highland-fc', 'tournaments');
        $this->assertTrue($before['allowed']);

        $this->createTournamentFor('org-highland-fc');
        $this->assertTrue($this->billing->checkLimit('org-highland-fc', 'tournaments')['allowed']);

        $this->createTournamentFor('org-highland-fc');
        $after = $this->billing->checkLimit('org-highland-fc', 'tournaments');

        $this->assertFalse($after['allowed']);
        $this->assertStringContainsString('limit reached', $after['reason']);
    }

    public function test_free_plan_allows_exactly_one_tournament_then_requires_an_upgrade(): void
    {
        $this->billing->subscribePlan('org-highland-fc', 'plan-free', 'upi');

        $before = $this->billing->checkLimit('org-highland-fc', 'tournaments');
        $this->assertTrue($before['allowed']);

        $this->createTournamentFor('org-highland-fc');

        $after = $this->billing->checkLimit('org-highland-fc', 'tournaments');
        $this->assertFalse($after['allowed']);
        $this->assertStringContainsString('limit reached', $after['reason']);

        // Upgrading to a paid plan raises the allowance and unblocks creation.
        $this->billing->subscribePlan('org-highland-fc', 'plan-basic', 'upi');
        $this->assertTrue($this->billing->checkLimit('org-highland-fc', 'tournaments')['allowed']);
    }

    public function test_creating_a_tournament_past_the_plan_limit_is_refused_over_http(): void
    {
        $this->createTournamentFor('org-highland-fc');
        $this->createTournamentFor('org-highland-fc');
        $this->actingAsUser('admin@greenvalley.com');

        // Highland's own admin is not seeded, so drive the check as super admin
        // against Highland's organization id.
        $this->actingAsUser('syamdas@gmail.com');

        $this->postJson('/api/tournaments', [
            'organization_id' => 'org-highland-fc',
            'name' => 'Second Highland Cup',
            'sport_code' => 'football',
        ])->assertForbidden()->assertJsonStructure(['error', 'limit']);
    }

    public function test_usage_reports_current_consumption_against_plan_limits(): void
    {
        $usage = $this->billing->usage('org-green-valley');

        $this->assertNotNull($usage['plan']);
        $this->assertArrayHasKey('tournaments', $usage['usage']);
        $this->assertGreaterThanOrEqual(0, $usage['usage']['teams']['current']);
        $this->assertLessThanOrEqual(100, $usage['usage']['teams']['percentage']);
    }

    public function test_feature_gating_follows_the_subscribed_plan(): void
    {
        $this->assertTrue($this->billing->hasFeature('org-green-valley', 'live_scoring'));
        $this->assertFalse($this->billing->hasFeature('org-green-valley', 'a_feature_no_plan_has'));
    }

    public function test_subscribing_activates_the_plan_and_raises_a_paid_invoice(): void
    {
        $result = $this->billing->subscribePlan('org-highland-fc', 'plan-premium', 'upi');

        $this->assertSame('plan-premium', $result['subscription']->plan_id);
        $this->assertSame('active', $result['subscription']->status);
        $this->assertSame('paid', $result['invoice']->status);
        $this->assertSame(9999.0, (float) $result['invoice']->amount);
    }

    public function test_platform_metrics_derive_recurring_revenue_and_activity(): void
    {
        $metrics = $this->billing->platformMetrics();

        $this->assertGreaterThanOrEqual(3, $metrics['organizations']['total']);
        $this->assertGreaterThan(0, $metrics['revenue']['mrr']);
        $this->assertSame($metrics['revenue']['mrr'] * 12, $metrics['revenue']['arr']);
        $this->assertGreaterThan(0, $metrics['revenue']['totalPlatformRevenue']);
        $this->assertGreaterThanOrEqual(2, $metrics['activity']['totalTournaments']);
    }

    private function createTournamentFor(string $organizationId): Tournament
    {
        return Tournament::create([
            'id' => Ids::unique('test-tourney'),
            'organization_id' => $organizationId,
            'sport_id' => 'sport-football',
            'sport_code' => 'football',
            'name' => 'Highland Test Cup',
            'slug' => Ids::unique('highland-test'),
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-10',
            'registration_opening' => '2026-07-01',
            'registration_closing' => '2026-07-31',
            'format' => 'knockout',
            'max_teams' => 8,
            'ground_fee' => 2000,
            'payment_config' => ['allow_partial' => true, 'min_partial_type' => 'percentage', 'min_partial_value' => 50],
            'prize_money' => 10000,
            'runner_up_prize' => 5000,
            'status' => 'ongoing',
            'settings' => ['squad_min_players' => 7, 'squad_max_players' => 14, 'max_substitutes' => 5],
        ]);
    }
}
