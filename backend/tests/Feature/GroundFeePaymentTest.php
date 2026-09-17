<?php

namespace Tests\Feature;

use App\Models\RegistrationLink;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\TournamentPaymentService;
use App\Support\Ids;
use Tests\TestCase;

/**
 * Ground fees teams pay organizers to enter a tournament — distinct from the
 * organizer's own platform subscription.
 */
class GroundFeePaymentTest extends TestCase
{
    private TournamentPaymentService $payments;

    protected function setUp(): void
    {
        parent::setUp();
        $this->payments = app(TournamentPaymentService::class);
    }

    public function test_payment_options_split_the_fee_by_the_configured_partial_rule(): void
    {
        $tournament = Tournament::find('tourney-football-sevens');
        $options = $this->payments->paymentOptions($tournament);

        $this->assertSame(5000, $options['totalFee']);
        $this->assertTrue($options['allowPartial']);
        $this->assertSame(2500, $options['partialAmount']);
    }

    public function test_a_half_payment_leaves_the_balance_outstanding_on_the_receipt(): void
    {
        $team = $this->registerTestTeam();

        $result = $this->payments->processPayment([
            'teamId' => $team->id,
            'tournamentId' => $team->tournament_id,
            'organizationId' => $team->organization_id,
            'paymentOption' => 'partial',
            'paymentMethod' => 'upi',
            'transactionId' => 'UPI-TEST-9988',
        ]);

        $this->assertSame(5000.0, (float) $result['payment']->total_fee);
        $this->assertSame(2500.0, (float) $result['payment']->paid_amount);
        $this->assertSame(2500.0, (float) $result['payment']->remaining_amount);
        $this->assertSame('partially_paid', $result['payment']->status);
        $this->assertSame(2500, $result['receipt']->receipt_data['remaining_balance']);
    }

    public function test_a_later_cash_payment_settles_the_balance_and_is_marked_admin_recorded(): void
    {
        $team = $this->registerTestTeam();

        $this->payments->processPayment([
            'teamId' => $team->id,
            'tournamentId' => $team->tournament_id,
            'organizationId' => $team->organization_id,
            'paymentOption' => 'partial',
            'paymentMethod' => 'upi',
        ]);

        $result = $this->payments->processPayment([
            'teamId' => $team->id,
            'tournamentId' => $team->tournament_id,
            'organizationId' => $team->organization_id,
            'paymentOption' => 'full',
            'paymentMethod' => 'cash',
            'customAmount' => 2500,
            'recordedByAdmin' => true,
            'adminUserId' => 'user-org-admin-green',
        ]);

        $this->assertSame(5000.0, (float) $result['payment']->paid_amount);
        $this->assertSame(0.0, (float) $result['payment']->remaining_amount);
        $this->assertSame('fully_paid', $result['payment']->status);
        $this->assertTrue($result['payment']->recorded_by_admin);
    }

    public function test_public_registration_creates_the_squad_and_collects_the_fee(): void
    {
        $tournament = Tournament::find('tourney-football-sevens');
        $token = $tournament->registrationLink->token;

        $players = collect(range(1, 8))->map(fn (int $number) => [
            'full_name' => "Test Player {$number}",
            'jersey_number' => $number,
        ])->all();

        $response = $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Phoenix Kerala FC',
            'short_name' => 'PKFC',
            'manager_name' => 'Vineeth S.',
            'manager_phone' => '+91 98950 00112',
            'players' => $players,
            'payment_option' => 'partial',
            'payment_method' => 'card',
            ...$this->payWithDemoCard($token, 'partial'),
        ])->assertCreated();

        $this->assertSame('pending', $response->json('team.status'));
        $this->assertSame(2500, (int) $response->json('payment.paid_amount'));
        $this->assertSame('partially_paid', $response->json('payment.status'));
        $this->assertNotEmpty($response->json('receipt.receipt_number'));

        $teamId = $response->json('team.id');
        $this->assertSame(8, Team::find($teamId)->players()->count());
    }

    public function test_registration_is_refused_when_the_squad_is_too_small(): void
    {
        $tournament = Tournament::find('tourney-football-sevens');
        $token = $tournament->registrationLink->token;

        $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Too Few FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 00000',
            'players' => [['full_name' => 'Only Player', 'jersey_number' => 1]],
        ])->assertStatus(400)
            ->assertJsonPath('error', 'Minimum 7 players are required. You entered 1.');
    }

    public function test_creating_a_tournament_persists_the_organizers_chosen_payment_methods(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->postJson('/api/tournaments', [
            'name' => 'Payment Methods Test Cup',
            'sport_code' => 'football',
            'payment_config' => [
                'enabled_methods' => ['upi', 'pay_at_ground'],
            ],
        ])->assertCreated();

        $this->assertSame(
            ['upi', 'pay_at_ground'],
            $response->json('tournament.payment_config.enabled_methods')
        );
    }

    public function test_an_unspecified_payment_config_defaults_to_every_method_enabled(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->postJson('/api/tournaments', [
            'name' => 'Default Payment Methods Cup',
            'sport_code' => 'football',
        ])->assertCreated();

        $this->assertSame(
            Tournament::PAYMENT_METHODS,
            $response->json('tournament.payment_config.enabled_methods')
        );
    }

    public function test_paying_at_the_ground_defers_the_whole_fee_and_charges_nothing_now(): void
    {
        $tournament = Tournament::find('tourney-football-sevens');
        $token = $tournament->registrationLink->token;

        $players = collect(range(1, 8))->map(fn (int $number) => [
            'full_name' => "Ground Pay Player {$number}",
            'jersey_number' => $number,
        ])->all();

        $response = $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Pay Later FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 00001',
            'players' => $players,
            'payment_method' => 'pay_at_ground',
        ])->assertCreated();

        $this->assertSame(0, (int) $response->json('payment.paid_amount'));
        $this->assertSame(5000, (int) $response->json('payment.remaining_amount'));
        $this->assertSame('unpaid', $response->json('payment.status'));
    }

    public function test_registration_is_refused_for_a_payment_method_the_tournament_does_not_accept(): void
    {
        $tournament = $this->tournamentAcceptingOnly(['pay_at_ground']);

        $players = collect(range(1, 8))->map(fn (int $number) => [
            'full_name' => "Restricted Player {$number}",
            'jersey_number' => $number,
        ])->all();

        $this->postJson("/api/teams/public/registration/{$tournament['token']}", [
            'team_name' => 'Wrong Method FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 00002',
            'players' => $players,
            'payment_method' => 'upi',
        ])->assertStatus(400)
            ->assertJsonPath('error', 'This payment method is not accepted for this tournament. Please choose another one.');
    }

    /**
     * @param  array<int, string>  $enabledMethods
     * @return array{tournament: Tournament, token: string}
     */
    private function tournamentAcceptingOnly(array $enabledMethods): array
    {
        $tournament = Tournament::create([
            'id' => Ids::unique('test-tourney'),
            'organization_id' => 'org-green-valley',
            'sport_id' => 'sport-football',
            'sport_code' => 'football',
            'name' => 'Restricted Methods Cup',
            'slug' => Ids::unique('restricted-methods'),
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-10',
            'max_teams' => 8,
            'ground_fee' => 5000,
            'payment_config' => [
                'allow_partial' => true,
                'min_partial_type' => 'percentage',
                'min_partial_value' => 50,
                'enabled_methods' => $enabledMethods,
            ],
            'settings' => ['squad_min_players' => 7, 'squad_max_players' => 14],
            'status' => 'registration_open',
        ]);

        $link = RegistrationLink::create([
            'id' => Ids::unique('test-link'),
            'tournament_id' => $tournament->id,
            'organization_id' => $tournament->organization_id,
            'token' => Ids::unique('test-token'),
            'status' => 'active',
            'max_teams' => 8,
        ]);

        return ['tournament' => $tournament, 'token' => $link->token];
    }

    public function test_registration_is_refused_when_two_players_share_a_jersey_number(): void
    {
        $tournament = Tournament::find('tourney-football-sevens');
        $token = $tournament->registrationLink->token;

        $players = collect(range(1, 8))->map(fn (int $number) => [
            'full_name' => "Test Player {$number}",
            'jersey_number' => 7,
        ])->all();

        $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Clashing FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 00000',
            'players' => $players,
        ])->assertStatus(400)
            ->assertJsonPath('error', 'Duplicate jersey numbers detected in the team roster. Every player must have a unique number.');
    }

    private function registerTestTeam(): Team
    {
        $tournament = Tournament::find('tourney-football-sevens');

        return Team::create([
            'id' => 'test-team-phoenix',
            'tournament_id' => $tournament->id,
            'organization_id' => $tournament->organization_id,
            'name' => 'Phoenix Kerala FC',
            'short_name' => 'PKFC',
            'village' => 'Nilambur',
            'panchayat' => 'Nilambur',
            'district' => 'Malappuram',
            'jersey_color' => '#F97316',
            'captain_name' => 'Vineeth S.',
            'manager_name' => 'Vineeth S.',
            'manager_phone' => '+91 98950 00112',
            'manager_whatsapp' => '+91 98950 00112',
            'manager_email' => 'vineeth@phoenixfc.in',
            'manager_address' => 'Stadium Road',
            'status' => 'pending',
        ]);
    }

    public function test_an_online_registration_without_a_verified_payment_is_refused(): void
    {
        $token = Tournament::find('tourney-football-sevens')->registrationLink->token;

        $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Unpaid FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 11111',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'card',
            'razorpay_order_id' => 'demo_order_fake',
            'razorpay_payment_id' => 'demo_pay_fake',
            'razorpay_signature' => 'forged',
        ])->assertStatus(400)
            ->assertJsonPath('error', 'Payment verification failed. Please try again.');
    }

    public function test_the_demo_checkout_declines_the_test_decline_card_and_rejects_bad_input(): void
    {
        $token = Tournament::find('tourney-football-sevens')->registrationLink->token;
        $orderId = $this->postJson("/api/teams/public/registration/{$token}/payment-order", ['payment_option' => 'full'])
            ->assertOk()
            ->assertJsonPath('provider', 'demo')
            ->json('order_id');

        $card = ['method' => 'card', 'card_name' => 'Test', 'card_expiry' => '12/40', 'card_cvv' => '123'];

        $this->postJson("/api/payments/demo/{$orderId}/pay", [...$card, 'card_number' => '4000 0000 0000 0002'])
            ->assertStatus(402);
        $this->postJson("/api/payments/demo/{$orderId}/pay", [...$card, 'card_number' => '4111 1111 1111 1112'])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Enter a valid card number.');
        $this->postJson("/api/payments/demo/{$orderId}/pay", ['method' => 'upi', 'upi_id' => 'failure@demo'])
            ->assertStatus(402);
    }

    public function test_registration_closes_after_the_deadline(): void
    {
        $tournament = Tournament::find('tourney-football-sevens');
        $link = $tournament->registrationLink;
        $link->update(['deadline' => now()->subDay()->format('Y-m-d')]);

        $this->getJson("/api/teams/public/registration/{$link->token}")
            ->assertOk()
            ->assertJsonPath('is_closed', true);

        $this->postJson("/api/teams/public/registration/{$link->token}/payment-order", ['payment_option' => 'full'])
            ->assertStatus(400);

        $this->postJson("/api/teams/public/registration/{$link->token}", [
            'team_name' => 'Late FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 44444',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'pay_at_ground',
        ])->assertStatus(400)
            ->assertJsonPath('error', fn (string $error) => str_contains($error, 'Registration closed on'));
    }

    public function test_a_part_payment_cannot_be_presented_as_the_full_fee(): void
    {
        $token = Tournament::find('tourney-football-sevens')->registrationLink->token;
        $paid = $this->payWithDemoCard($token, 'partial');

        $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Half Paid FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 55555',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'card',
            'payment_option' => 'full',
            ...$paid,
        ])->assertStatus(400)
            ->assertJsonPath('error', 'Payment verification failed. Please try again.');
    }

    public function test_one_payment_cannot_register_two_teams(): void
    {
        $token = Tournament::find('tourney-football-sevens')->registrationLink->token;
        $paid = $this->payWithDemoCard($token, 'full');
        $entry = [
            'manager_name' => 'Manager',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'card',
            'payment_option' => 'full',
            ...$paid,
        ];

        $this->postJson("/api/teams/public/registration/{$token}", [
            ...$entry,
            'team_name' => 'First FC',
            'manager_phone' => '+91 90000 66666',
        ])->assertCreated();

        $this->postJson("/api/teams/public/registration/{$token}", [
            ...$entry,
            'team_name' => 'Second FC',
            'manager_phone' => '+91 90000 77777',
        ])->assertStatus(400);
    }

    /** Runs the demo checkout the SPA shows and returns the signed result to submit. */
    private function payWithDemoCard(string $token, string $option): array
    {
        $order = $this->postJson("/api/teams/public/registration/{$token}/payment-order", [
            'payment_option' => $option,
            'method' => 'card',
        ])->assertOk()->json();

        $this->assertSame('card', $order['preferred_method']);

        return $this->postJson("/api/payments/demo/{$order['order_id']}/pay", [
            'method' => 'card',
            'card_number' => '4111 1111 1111 1111',
            'card_name' => 'Vineeth S',
            'card_expiry' => '12/40',
            'card_cvv' => '123',
        ])->assertOk()->json();
    }
}
