<?php

namespace Tests\Feature;

use App\Models\NotificationOptOut;
use App\Models\Player;
use App\Models\RegistrationLink;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\Ids;
use Tests\TestCase;

/**
 * Holes found in a review of every flow, each pinned so it stays shut:
 * a way to mint a super-admin token, fees "paid" without paying, payments
 * spent twice or on the wrong tournament, and contact details on public reads.
 */
class SecurityRegressionTest extends TestCase
{
    private const FOOTBALL = 'tourney-football-sevens';

    public function test_the_demo_role_switch_endpoint_is_gone_when_the_switcher_is_off(): void
    {
        config(['app.demo_role_switcher' => false]);

        $this->postJson('/api/auth/switch-demo-role', ['role' => 'SUPER_ADMIN'])->assertNotFound();
    }

    public function test_a_public_registration_cannot_declare_its_fee_paid_in_cash(): void
    {
        $this->postJson('/api/teams/public/registration/'.$this->token(), [
            ...$this->entry('Cash Claim FC', '+91 90000 12121'),
            'payment_method' => 'cash',
        ])->assertStatus(422);

        $this->assertFalse(Team::query()->where('name', 'Cash Claim FC')->exists());
    }

    public function test_a_payment_for_one_tournament_cannot_enter_a_team_in_another(): void
    {
        $paid = $this->payWithDemoCard($this->token());

        // Another tournament asking the very same fee.
        $other = $this->tournamentLike(self::FOOTBALL);

        $this->postJson("/api/teams/public/registration/{$other->registrationLink->token}", [
            ...$this->entry('Wrong Cup FC', '+91 90000 13131'),
            'payment_method' => 'card',
            'payment_option' => 'full',
            ...$paid,
        ])->assertStatus(400)->assertJsonPath('error', 'Payment verification failed. Please try again.');
    }

    public function test_a_public_player_profile_carries_no_manager_contacts(): void
    {
        $team = $this->getJson('/api/players/pl-mb-1/profile')->assertOk()->json('team');

        foreach (['manager_phone', 'manager_whatsapp', 'manager_email', 'manager_address'] as $field) {
            $this->assertArrayNotHasKey($field, $team);
        }
    }

    public function test_a_receipt_is_only_for_the_organizer_and_the_team(): void
    {
        $this->getJson('/api/teams/team-malabar-blasters/receipt')->assertUnauthorized();

        $this->actingAsUser('admin@malabar.com');
        $this->getJson('/api/teams/team-malabar-blasters/receipt')->assertNotFound();
    }

    public function test_typing_someone_elses_number_does_not_hand_over_their_player_record(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $this->postJson('/api/players/me/profile', [
            'phone' => '+91 94470 77772', // pl-kk-1's mobile, another club's player
            'name' => 'Hijacked',
        ])->assertOk();

        $this->assertNotSame('Hijacked', Player::find('pl-kk-1')->full_name);
    }

    public function test_a_club_cannot_reset_a_manager_who_also_runs_teams_elsewhere(): void
    {
        // The Blasters' manager also enters a team in the cricket club's tournament.
        Team::query()->whereKey('team-kozhikode-kings')->update(['manager_user_id' => 'user-manager-blasters']);

        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/organizations/org-malabar-cricket/members/user-manager-blasters/reset-password')
            ->assertForbidden();
    }

    public function test_the_public_auction_pool_hides_registrants_contacts(): void
    {
        $players = $this->getJson('/api/auctions/auction-football-1')->assertOk()->json('players');

        $this->assertNotEmpty($players);
        foreach ($players as $player) {
            $this->assertArrayNotHasKey('mobile', $player);
            $this->assertArrayNotHasKey('email', $player);
        }

        $this->actingAsUser('admin@greenvalley.com');
        $organizerView = $this->getJson('/api/auctions/auction-football-1')->assertOk()->json('players.0');
        $this->assertArrayHasKey('mobile', $organizerView);
    }

    public function test_one_club_cannot_lift_an_opt_out_another_club_recorded(): void
    {
        NotificationOptOut::query()->create([
            'phone' => '919447012345',
            'organization_id' => 'org-malabar-cricket',
            'reason' => 'Asked not to be contacted',
            'created_at' => now(),
        ]);

        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/organizations/org-green-valley/notifications/opt-in', ['phone' => '9447012345'])
            ->assertForbidden();

        $this->assertTrue(NotificationOptOut::query()->whereKey('919447012345')->exists());
    }

    public function test_payments_recorded_before_the_ledger_count_as_spent(): void
    {
        // Run the ledger's migration the way it runs on an existing database.
        \Illuminate\Support\Facades\Schema::drop('gateway_payments');
        (require database_path('migrations/2026_09_26_200000_create_gateway_payments_table.php'))->up();

        $gateway = app(\App\Services\PaymentGatewayService::class);

        $this->assertTrue($gateway->isSpent('UPI9847120021'));
        $this->assertSame('team-malabar-blasters', $gateway->spentOn('UPI9847120021'));
    }

    public function test_a_payment_id_is_spent_once(): void
    {
        $gateway = app(\App\Services\PaymentGatewayService::class);

        $this->assertTrue($gateway->spend('pay_once_only', 'registration', 'ground_fee', 'team-a'));
        $this->assertFalse($gateway->spend('pay_once_only', 'registration', 'ground_fee', 'team-b'));
        $this->assertSame('team-a', $gateway->spentOn('pay_once_only'));
    }

    public function test_an_archived_plan_is_off_sale_but_its_clubs_can_renew_it(): void
    {
        \App\Models\Plan::query()->whereKey('plan-standard')->update(['status' => 'archived']);

        // Green Valley is on it: renewing still opens a checkout.
        $this->actingAsUser('admin@greenvalley.com');
        $this->postJson('/api/organizations/org-green-valley/subscribe/order', ['plan_id' => 'plan-standard'])->assertOk();

        // Malabar isn't: it can no longer buy it.
        $this->actingAsUser('admin@malabar.com');
        $this->postJson('/api/organizations/org-malabar-cricket/subscribe/order', ['plan_id' => 'plan-standard'])->assertNotFound();
    }

    public function test_an_end_date_without_a_start_date_is_accepted(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->postJson('/api/tournaments', [
            'name' => 'No Start Cup',
            'sport_code' => 'football',
            'end_date' => now()->addDays(5)->toDateString(),
        ]);

        // Whatever the plan allows, the dates are not what refuses it.
        $this->assertNotSame(422, $response->status(), (string) $response->getContent());
    }

    /* ------------------------------------------------------------ Helpers */

    private function token(): string
    {
        return Tournament::find(self::FOOTBALL)->registrationLink->token;
    }

    private function entry(string $team, string $phone): array
    {
        return [
            'team_name' => $team,
            'manager_name' => 'Manager',
            'manager_phone' => $phone,
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
        ];
    }

    private function tournamentLike(string $id): Tournament
    {
        $source = Tournament::find($id);
        $copy = $source->replicate();
        $copy->forceFill([
            'id' => Ids::unique('tourney'),
            'slug' => 'copy-'.Ids::token(6),
            'registration_closing' => now()->addMonth()->toDateString(),
        ])->save();

        RegistrationLink::query()->create([
            'id' => Ids::unique('link'),
            'tournament_id' => $copy->id,
            'organization_id' => $copy->organization_id,
            'token' => $copy->slug.'-reg',
            'status' => 'active',
            'max_teams' => 16,
            'current_registrations' => 0,
            'deadline' => null,
        ]);

        return $copy->fresh();
    }

    private function payWithDemoCard(string $token): array
    {
        $order = $this->postJson("/api/teams/public/registration/{$token}/payment-order", [
            'payment_option' => 'full',
            'method' => 'card',
        ])->assertOk()->json();

        return $this->postJson("/api/payments/demo/{$order['order_id']}/pay", [
            'method' => 'card',
            'card_number' => '4111 1111 1111 1111',
            'card_name' => 'Test Payer',
            'card_expiry' => '12/40',
            'card_cvv' => '123',
        ])->assertOk()->json();
    }
}
