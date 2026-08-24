<?php

namespace Tests\Feature;

use App\Models\Auction;
use App\Models\AuctionPlayer;
use App\Models\Team;
use App\Models\Tournament;
use Tests\TestCase;

/**
 * Who may do what in an auction.
 *
 * The organizer conducts the auction; team managers take part in it. Keeping
 * those apart matters because a bid spends real purse: without it any signed-in
 * user could bid on behalf of a rival team, or hammer a player sold.
 */
class AuctionAuthorizationTest extends TestCase
{
    private const AUCTION_ID = 'auction-football-1';

    public function test_every_auction_points_at_a_tournament_that_exists(): void
    {
        foreach (Auction::query()->get() as $auction) {
            $this->assertNotNull(
                Tournament::find($auction->tournament_id),
                "Auction {$auction->id} references a missing tournament."
            );
        }
    }

    public function test_the_seeded_manager_is_linked_to_a_team_in_the_auctions_tournament(): void
    {
        $auction = Auction::find(self::AUCTION_ID);
        $manager = $this->actingAsUser('manager@malabarblasters.com');

        $team = Team::query()
            ->where('manager_user_id', $manager->id)
            ->where('tournament_id', $auction->tournament_id)
            ->first();

        $this->assertNotNull($team, 'The demo team manager must run a team in the auction tournament.');
    }

    public function test_a_team_manager_cannot_run_the_auction(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');
        $player = $this->hammeredPlayer();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertForbidden();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/sell-player')->assertForbidden();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/unsold-player')->assertForbidden();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/accelerated-round')->assertForbidden();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/status', ['status' => 'cancelled'])->assertForbidden();
    }

    public function test_a_managers_bid_is_recorded_against_their_own_team_whatever_they_send(): void
    {
        $this->hammeredPlayer();

        $auction = Auction::find(self::AUCTION_ID);
        $rival = Team::query()
            ->where('tournament_id', $auction->tournament_id)
            ->whereNull('manager_user_id')
            ->firstOrFail();

        $manager = $this->actingAsUser('manager@malabarblasters.com');
        $ownTeam = Team::query()->where('manager_user_id', $manager->id)->firstOrFail();

        // Naming a rival team must not spend the rival's purse.
        $response = $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', [
            'team_id' => $rival->id,
            'amount' => 12000,
        ])->assertOk();

        $this->assertSame($ownTeam->id, $response->json('bid.team_id'));
        $this->assertNotSame($rival->id, $response->json('bid.team_id'));
    }

    public function test_an_organizer_from_another_tenant_cannot_run_the_auction(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $player = $this->hammeredPlayer();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])
            ->assertForbidden();
    }

    public function test_the_organizer_can_run_the_auction(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = AuctionPlayer::query()->where('auction_id', self::AUCTION_ID)->firstOrFail();
        $player->update(['status' => 'approved']);

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/unsold-player')->assertOk();
    }

    public function test_the_my_team_view_reports_purse_squad_and_bid_state(): void
    {
        $this->hammeredPlayer();
        $this->actingAsUser('manager@malabarblasters.com');

        $this->getJson('/api/auctions/'.self::AUCTION_ID.'/my-team')
            ->assertOk()
            ->assertJsonStructure([
                'auction', 'tournament', 'team',
                'purse' => ['total_purse', 'spent_amount', 'remaining_purse', 'players_bought_count', 'max_players'],
                'current_player',
                'squad',
                'bidding' => ['open', 'is_leading', 'current_bid', 'next_bid', 'can_afford', 'squad_full'],
                'my_bids',
            ]);
    }

    public function test_the_my_team_view_is_refused_to_someone_with_no_team(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/auctions/'.self::AUCTION_ID.'/my-team')->assertForbidden();
    }

    public function test_a_manager_only_sees_auctions_their_team_is_entered_in(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $response = $this->getJson('/api/auctions/mine')->assertOk();

        $this->assertNotEmpty($response->json());

        foreach ($response->json() as $row) {
            $this->assertSame($row['team']['tournament_id'], $row['auction']['tournament_id']);
        }
    }

    public function test_a_tournament_can_run_without_an_auction_and_still_take_direct_entries(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->putJson('/api/tournaments/tourney-highland-7s/auction', ['has_auction' => false])
            ->assertOk()
            ->assertJsonPath('tournament.has_auction', false);

        $token = $this->getJson('/api/tournaments/tourney-highland-7s')->json('registration_link.token');
        $this->assertNotEmpty($token, 'A direct-registration tournament needs a share link.');

        $squad = collect(range(1, 8))
            ->map(fn (int $n) => ['full_name' => "Direct Player {$n}", 'jersey_number' => $n])
            ->all();

        $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Direct Entry FC',
            'manager_name' => 'Direct Manager',
            'manager_phone' => '+91 90000 55555',
            'players' => $squad,
        ])->assertCreated();
    }

    public function test_auction_and_direct_entry_tournaments_coexist(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->assertTrue(Tournament::find('tourney-football-sevens')->has_auction);
        $this->assertTrue(Tournament::find('tourney-cricket-t20')->has_auction);
        $this->assertFalse((bool) Tournament::find('tourney-highland-7s')->has_auction);
    }

    /**
     * Put an approved player on the hammer as the organizer, then restore
     * whoever the test was acting as, so the arrangement does not silently
     * leave the caller signed in as an admin.
     */
    private function hammeredPlayer(): AuctionPlayer
    {
        $caller = $this->actingUser;

        $player = AuctionPlayer::query()->where('auction_id', self::AUCTION_ID)->firstOrFail();
        $player->update(['status' => 'approved']);

        $this->actingAsUser('admin@greenvalley.com');
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();

        if ($caller) {
            $this->actingAsUser($caller->email);
        }

        return $player->fresh();
    }
}
