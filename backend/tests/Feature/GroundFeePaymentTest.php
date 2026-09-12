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
 * organizer's own SaaS subscription.
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
            'payment_method' => 'upi',
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
}
