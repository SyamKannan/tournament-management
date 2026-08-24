<?php

namespace Tests\Feature;

use App\Models\Team;
use App\Models\Tournament;
use App\Services\TournamentPaymentService;
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
