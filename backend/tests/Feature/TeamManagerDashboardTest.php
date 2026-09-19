<?php

namespace Tests\Feature;

use App\Models\Team;
use App\Models\User;
use Tests\TestCase;

class TeamManagerDashboardTest extends TestCase
{
    private function managerHeaders(User $manager): array
    {
        return ['Authorization' => 'Bearer '.app(\App\Services\TokenService::class)->issue($manager)];
    }

    public function test_manager_sees_only_their_own_teams_with_squad_and_fixtures(): void
    {
        $manager = User::find('user-manager-blasters');
        $ownIds = Team::query()->where('manager_user_id', $manager->id)->pluck('id')->all();
        $this->assertNotEmpty($ownIds, 'seed should link the demo manager to a team');

        $response = $this->withHeaders($this->managerHeaders($manager))
            ->getJson('/api/teams/mine')
            ->assertOk()
            ->assertJsonStructure([['team', 'tournament', 'organization', 'players', 'payment', 'receipt', 'matches']]);

        $this->assertEqualsCanonicalizing($ownIds, collect($response->json())->pluck('team.id')->all());
    }

    public function test_manager_joins_an_open_tournament_pays_at_ground_then_settles_online(): void
    {
        $manager = User::find('user-manager-blasters');
        // Start from a manager with no teams, so every open tournament is on offer.
        Team::query()->where('manager_user_id', $manager->id)->update(['manager_user_id' => null]);
        $headers = $this->managerHeaders($manager);

        $open = collect($this->withHeaders($headers)->getJson('/api/teams/open-tournaments')->assertOk()->json());
        $sevens = $open->firstWhere('tournament.id', 'tourney-football-sevens');
        $this->assertNotNull($sevens, 'an open tournament should be listed');
        $this->assertSame(5000, (int) $sevens['entry_fee']);

        $players = collect(range(1, 8))->map(fn (int $n) => ['full_name' => "Portal Player {$n}", 'jersey_number' => $n])->all();
        $teamId = $this->withHeaders($headers)
            ->postJson("/api/teams/public/registration/{$sevens['registration_token']}", [
                'team_name' => 'Portal Blasters',
                'manager_name' => $manager->name,
                'manager_phone' => '+91 90000 44444',
                'players' => $players,
                'payment_method' => 'pay_at_ground',
            ])
            ->assertCreated()
            ->json('team.id');

        $this->assertSame($manager->id, Team::find($teamId)->manager_user_id);

        // Joined: no longer offered, and a second entry is refused.
        $this->assertNull(collect($this->withHeaders($headers)->getJson('/api/teams/open-tournaments')->json())
            ->firstWhere('tournament.id', 'tourney-football-sevens'));

        // Settle the whole fee online from the portal.
        $order = $this->withHeaders($headers)
            ->postJson("/api/teams/{$teamId}/balance/order", ['method' => 'card'])
            ->assertOk()
            ->json();
        $this->assertSame(5000, (int) $order['amount_due']);

        $signed = $this->postJson("/api/payments/demo/{$order['order_id']}/pay", [
            'method' => 'card',
            'card_number' => '4111 1111 1111 1111',
            'card_name' => 'Faisal',
            'card_expiry' => '12/40',
            'card_cvv' => '123',
        ])->assertOk()->json();

        $this->withHeaders($headers)
            ->postJson("/api/teams/{$teamId}/balance/pay", ['payment_method' => 'card', ...$signed])
            ->assertOk()
            ->assertJsonPath('payment.status', 'fully_paid');

        // Nothing left to pay, and the same signed result can't be replayed.
        $this->withHeaders($headers)->postJson("/api/teams/{$teamId}/balance/order")->assertStatus(400);
        $this->withHeaders($headers)
            ->postJson("/api/teams/{$teamId}/balance/pay", ['payment_method' => 'card', ...$signed])
            ->assertStatus(400);
    }

    public function test_manager_pays_half_then_the_rest_and_sees_both_in_the_payment_report(): void
    {
        $manager = User::find('user-manager-blasters');
        Team::query()->where('manager_user_id', $manager->id)->update(['manager_user_id' => null]);
        $headers = $this->managerHeaders($manager);
        $token = \App\Models\Tournament::find('tourney-football-sevens')->registrationLink->token;

        $players = collect(range(1, 8))->map(fn (int $n) => ['full_name' => "Half Player {$n}", 'jersey_number' => $n])->all();
        $teamId = $this->withHeaders($headers)
            ->postJson("/api/teams/public/registration/{$token}", [
                'team_name' => 'Half And Half FC',
                'manager_name' => $manager->name,
                'manager_phone' => '+91 90000 55555',
                'players' => $players,
                'payment_method' => 'pay_at_ground',
            ])
            ->assertCreated()
            ->json('team.id');

        $pay = function (string $option) use ($headers, $teamId) {
            $order = $this->withHeaders($headers)
                ->postJson("/api/teams/{$teamId}/balance/order", ['method' => 'card', 'option' => $option])
                ->assertOk()
                ->json();
            $signed = $this->postJson("/api/payments/demo/{$order['order_id']}/pay", [
                'method' => 'card', 'card_number' => '4111 1111 1111 1111', 'card_name' => 'Faisal',
                'card_expiry' => '12/40', 'card_cvv' => '123',
            ])->assertOk()->json();

            return [$order, $this->withHeaders($headers)
                ->postJson("/api/teams/{$teamId}/balance/pay", ['option' => $option, 'payment_method' => 'card', ...$signed])
                ->assertOk()];
        };

        [$halfOrder, $half] = $pay('half');
        $this->assertSame(2500, (int) $halfOrder['amount']);
        $half->assertJsonPath('payment.status', 'partially_paid');
        $this->assertSame(2500, (int) $half->json('payment.remaining_amount'));

        // Half the fee is now the whole balance, so "half" charges the rest.
        [$restOrder, $rest] = $pay('half');
        $this->assertSame(2500, (int) $restOrder['amount']);
        $rest->assertJsonPath('payment.status', 'fully_paid');

        $report = $this->withHeaders($headers)->getJson('/api/teams/my-payments')->assertOk();
        $rows = collect($report->json('payments'))->where('team_id', $teamId)->values();

        // Newest first: the settling payment, the half, then the pay-at-ground entry (₹0).
        $this->assertSame([2500, 2500, 0], $rows->pluck('amount')->map(fn ($a) => (int) $a)->all());
        $this->assertSame([0, 2500, 5000], $rows->pluck('balance_after')->map(fn ($a) => (int) $a)->all());
        $this->assertSame(5000, (int) $report->json('totals.paid'));
        $this->assertSame(0, (int) $report->json('totals.due'));
    }

    public function test_a_manager_cannot_pay_for_someone_elses_team(): void
    {
        $manager = User::find('user-manager-blasters');
        $otherTeam = Team::query()->where(fn ($q) => $q->whereNull('manager_user_id')->orWhere('manager_user_id', '!=', $manager->id))->first();

        $this->withHeaders($this->managerHeaders($manager))
            ->postJson("/api/teams/{$otherTeam->id}/balance/order")
            ->assertNotFound();
    }

    public function test_manager_sets_player_roles_and_the_captain_on_their_own_team(): void
    {
        $manager = User::find('user-manager-blasters');
        $team = Team::query()->where('manager_user_id', $manager->id)->first();
        [$first, $second] = $team->players()->orderBy('jersey_number')->take(2)->get()->all();
        $headers = $this->managerHeaders($manager);

        $this->withHeaders($headers)
            ->putJson("/api/teams/{$team->id}/players/{$second->id}", [
                'football_position' => 'Left Wing',
                'cricket_role' => 'Bowler',
                'is_captain' => true,
            ])
            ->assertOk();

        $this->assertSame('Left Wing', $second->fresh()->football_position);
        $this->assertTrue((bool) $second->fresh()->is_captain);
        $this->assertFalse((bool) $first->fresh()->is_captain);
        $this->assertSame($second->full_name, $team->fresh()->captain_name);

        // Someone else's player is out of reach.
        $foreign = \App\Models\Player::query()->where('team_id', '!=', $team->id)->first();
        $this->withHeaders($headers)
            ->putJson("/api/teams/{$team->id}/players/{$foreign->id}", ['cricket_role' => 'Batter'])
            ->assertNotFound();
    }

    public function test_other_roles_cannot_use_the_manager_endpoint(): void
    {
        $this->getJson('/api/teams/mine')->assertUnauthorized();

        $this->withHeaders($this->demoHeaders('ORG_ADMIN', 'org-green-valley'))
            ->getJson('/api/teams/mine')
            ->assertForbidden();
    }
}
