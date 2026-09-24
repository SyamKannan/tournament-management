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

    public function test_a_paid_plan_activates_only_after_the_demo_checkout_is_paid(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $org = 'org-green-valley';

        $this->postJson("/api/organizations/{$org}/subscribe", ['plan_id' => 'plan-premium'])
            ->assertStatus(400)
            ->assertJsonPath('error', 'Payment verification is required to activate this plan.');

        $order = $this->postJson("/api/organizations/{$org}/subscribe/order", ['plan_id' => 'plan-premium'])
            ->assertOk()
            ->assertJsonPath('provider', 'demo')
            ->assertJsonPath('methods', ['upi', 'card', 'netbanking'])
            ->json();

        $paid = $this->postJson("/api/payments/demo/{$order['order_id']}/pay", ['method' => 'upi', 'upi_id' => 'success@demo'])
            ->assertOk()
            ->json();

        $this->postJson("/api/organizations/{$org}/subscribe", ['plan_id' => 'plan-premium', 'payment_method' => 'upi', ...$paid])
            ->assertOk();

        $this->assertSame('plan-premium', \App\Models\Subscription::query()->where('organization_id', $org)->value('plan_id'));
    }

    public function test_a_razorpay_payment_buys_only_the_plan_it_was_opened_for_and_only_once(): void
    {
        $this->actingAsUser('syamdas@gmail.com');
        $this->putJson('/api/admin/settings', [
            'payment_gateways' => ['subscription' => ['provider' => 'razorpay', 'key_id' => 'rzp_test_abc', 'key_secret' => 'super-secret']],
        ])->assertOk();

        $orders = [];
        \Illuminate\Support\Facades\Http::fake(function (\Illuminate\Http\Client\Request $request) use (&$orders) {
            if ($request->method() === 'POST') {
                $id = 'order_'.(count($orders) + 1);
                $orders[$id] = ['id' => $id, 'amount' => $request['amount'], 'currency' => 'INR', 'notes' => $request['notes']];

                return \Illuminate\Support\Facades\Http::response($orders[$id]);
            }

            return \Illuminate\Support\Facades\Http::response($orders[basename($request->url())] ?? [], isset($orders[basename($request->url())]) ? 200 : 404);
        });

        $this->actingAsUser('admin@greenvalley.com');
        $org = 'org-green-valley';
        $pay = function (string $orderId): array {
            $paymentId = 'pay_'.$orderId;

            return [
                'payment_method' => 'upi',
                'razorpay_order_id' => $orderId,
                'razorpay_payment_id' => $paymentId,
                'razorpay_signature' => hash_hmac('sha256', "{$orderId}|{$paymentId}", 'super-secret'),
            ];
        };

        $cheap = $this->postJson("/api/organizations/{$org}/subscribe/order", ['plan_id' => 'plan-basic'])->assertOk()->json('order_id');

        // Paying the cheap plan's checkout doesn't switch on the expensive one.
        $this->postJson("/api/organizations/{$org}/subscribe", ['plan_id' => 'plan-premium', ...$pay($cheap)])->assertStatus(400);

        // Nor once the order has fallen out of the cache — Razorpay is asked.
        \Illuminate\Support\Facades\Cache::forget("razorpay_order:{$cheap}");
        $this->postJson("/api/organizations/{$org}/subscribe", ['plan_id' => 'plan-premium', ...$pay($cheap)])->assertStatus(400);

        $this->postJson("/api/organizations/{$org}/subscribe", ['plan_id' => 'plan-basic', ...$pay($cheap)])->assertOk();

        // The same signed result, sent again, doesn't renew the plan for free.
        $this->postJson("/api/organizations/{$org}/subscribe", ['plan_id' => 'plan-basic', ...$pay($cheap)])->assertStatus(409);
        $this->assertSame(1, \App\Models\Invoice::query()->where('transaction_reference', "pay_{$cheap}")->count());
    }

    public function test_admin_payment_gateway_settings_never_return_the_saved_secret(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $response = $this->putJson('/api/admin/settings', [
            'payment_gateways' => [
                'subscription' => ['provider' => 'razorpay', 'key_id' => 'rzp_test_abc', 'key_secret' => 'super-secret'],
                'registration' => ['provider' => 'demo'],
            ],
            'subscription_payment_methods' => ['card'],
        ])->assertOk();

        $response->assertJsonPath('payment_gateways.subscription.provider', 'razorpay')
            ->assertJsonPath('payment_gateways.subscription.has_key_secret', true)
            ->assertJsonPath('payment_gateways.subscription.ready', true)
            ->assertJsonPath('subscription_payment_methods', ['card']);
        $this->assertStringNotContainsString('super-secret', $response->getContent());
        $this->assertStringNotContainsString('super-secret', $this->getJson('/api/admin/settings')->getContent());

        // Saving again without a secret keeps the stored one.
        $this->putJson('/api/admin/settings', [
            'payment_gateways' => ['subscription' => ['provider' => 'razorpay', 'key_id' => 'rzp_test_abc']],
        ])->assertJsonPath('payment_gateways.subscription.has_key_secret', true);

        $this->assertSame('super-secret', app(\App\Services\PaymentGatewayService::class)->config('subscription')['key_secret']);
    }
}
