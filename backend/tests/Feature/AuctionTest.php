<?php

namespace Tests\Feature;

use App\Models\Auction;
use App\Models\AuctionPlayer;
use App\Models\Player;
use App\Models\Team;
use App\Services\AuctionService;
use Tests\TestCase;

class AuctionTest extends TestCase
{
    private const AUCTION_ID = 'auction-football-1';

    public function test_the_live_room_reports_purses_and_the_player_pool(): void
    {
        $response = $this->getJson('/api/auctions/'.self::AUCTION_ID)->assertOk();

        $this->assertSame(self::AUCTION_ID, $response->json('auction.id'));
        $this->assertIsArray($response->json('team_purses'));
        $this->assertIsArray($response->json('players'));
        $this->assertIsArray($response->json('bid_history'));
    }

    public function test_a_player_can_join_the_pool_through_the_public_link(): void
    {
        $auction = Auction::find(self::AUCTION_ID);

        $response = $this->postJson("/api/auctions/public/registration/{$auction->token}", [
            'full_name' => 'Nishanth P',
            'mobile' => '+91 90000 22222',
            'age' => 24,
            'village' => 'Nilambur',
            'sport_code' => 'football',
            'category' => 'Category A',
            'football_position' => 'Striker',
        ])->assertCreated();

        $this->assertSame('registered', $response->json('player.status'));
        $this->assertSame(5000.0, (float) $response->json('player.base_price'));
    }

    public function test_calling_a_player_opens_bidding_at_their_base_price(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = $this->approvedPoolPlayer();

        $response = $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', [
            'player_id' => $player->id,
        ])->assertOk();

        $this->assertSame('live', $response->json('auction.status'));
        $this->assertSame('bidding', $response->json('auction.hammer_state'));
        $this->assertSame($player->id, $response->json('auction.current_player_id'));
        $this->assertSame((float) $player->base_price, (float) $response->json('auction.current_bid_amount'));
    }

    public function test_a_bid_below_the_minimum_increment_is_refused(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $auction = Auction::find(self::AUCTION_ID);
        $player = $this->approvedPoolPlayer();
        $team = $this->auctionTeam($auction);

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', [
            'team_id' => $team->id,
            'amount' => $player->base_price,
        ])->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', [
            'team_id' => $team->id,
            'amount' => $player->base_price + 1,
        ])->assertStatus(400)
            ->assertJsonPath('error', fn (string $error) => str_contains($error, 'Minimum bid must be at least'));
    }

    public function test_a_bid_beyond_the_remaining_purse_is_refused(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $auction = Auction::find(self::AUCTION_ID);
        $player = $this->approvedPoolPlayer();
        $team = $this->auctionTeam($auction);

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', [
            'team_id' => $team->id,
            'amount' => $auction->team_purse + 1,
        ])->assertStatus(400)
            ->assertJsonPath('error', fn (string $error) => str_contains($error, 'Insufficient purse'));
    }

    public function test_selling_a_player_debits_the_purse_and_adds_them_to_the_squad(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $auction = Auction::find(self::AUCTION_ID);
        $player = $this->approvedPoolPlayer();
        $team = $this->auctionTeam($auction);
        $squadBefore = Player::query()->where('team_id', $team->id)->count();
        // The fixture already has sold players, so measure the change, not the total.
        $spentBefore = (float) collect(app(AuctionService::class)->teamPurses($auction))
            ->firstWhere('team_id', $team->id)['spent_amount'];

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', [
            'team_id' => $team->id,
            'amount' => 12500,
        ])->assertOk();

        $response = $this->postJson('/api/auctions/'.self::AUCTION_ID.'/sell-player')->assertOk();

        $this->assertSame('sold', $response->json('player.status'));
        $this->assertSame(12500.0, (float) $response->json('player.sold_price'));
        $this->assertSame($team->id, $response->json('player.sold_to_team_id'));

        $purse = collect($response->json('team_purses'))->firstWhere('team_id', $team->id);
        $this->assertSame($spentBefore + 12500.0, (float) $purse['spent_amount']);
        $this->assertSame((float) $auction->team_purse - $spentBefore - 12500.0, (float) $purse['remaining_purse']);

        $this->assertSame($squadBefore + 1, Player::query()->where('team_id', $team->id)->count());
    }

    public function test_selling_with_no_bids_is_refused(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = $this->approvedPoolPlayer();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/sell-player')
            ->assertStatus(400)
            ->assertJsonPath('error', 'No bids placed. Use unsold button instead.');
    }

    public function test_the_accelerated_round_returns_unsold_players_at_a_discount(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = $this->approvedPoolPlayer();
        $originalPrice = (float) $player->base_price;

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/unsold-player')->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/accelerated-round')
            ->assertOk()
            ->assertJsonPath('count', 1);

        $player->refresh();

        $this->assertSame('approved', $player->status);
        $this->assertSame(max(500.0, round($originalPrice * 0.75)), (float) $player->base_price);
    }

    public function test_the_summary_totals_the_completed_auction(): void
    {
        $response = $this->getJson('/api/auctions/'.self::AUCTION_ID.'/summary')->assertOk();

        $this->assertArrayHasKey('total_players', $response->json('stats'));
        $this->assertArrayHasKey('sold_count', $response->json('stats'));
        $this->assertIsArray($response->json('sold_players'));
        $this->assertIsArray($response->json('team_purses'));
    }

    public function test_an_auctioneer_from_another_organization_cannot_change_the_status(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/status', ['status' => 'cancelled'])
            ->assertForbidden();
    }

    public function test_the_public_room_hides_player_contact_details(): void
    {
        $players = $this->getJson('/api/auctions/'.self::AUCTION_ID)->assertOk()->json('players');
        $this->assertArrayNotHasKey('mobile', $players[0]);

        $this->actingAsUser('admin@greenvalley.com');
        $players = $this->getJson('/api/auctions/'.self::AUCTION_ID)->assertOk()->json('players');
        $this->assertArrayHasKey('mobile', $players[0]);
    }

    public function test_an_unknown_auction_is_not_found_rather_than_another_one(): void
    {
        $this->getJson('/api/auctions/no-such-auction')->assertNotFound();
        $this->getJson('/api/auctions/tournament/no-such-tournament')->assertNotFound();
    }

    public function test_only_the_organizer_manages_the_pool(): void
    {
        $player = AuctionPlayer::query()->where('auction_id', self::AUCTION_ID)->where('status', 'approved')->firstOrFail();

        $this->actingAsUser('manager@malabarblasters.com');
        $this->postJson('/api/auctions/'.self::AUCTION_ID."/players/{$player->id}/approve")->assertForbidden();
        $this->postJson('/api/auctions/'.self::AUCTION_ID."/players/{$player->id}/reject")->assertForbidden();
        $this->deleteJson('/api/auctions/'.self::AUCTION_ID."/players/{$player->id}")->assertForbidden();
        $this->putJson("/api/auctions/players/{$player->id}/status", ['status' => 'approved'])->assertForbidden();

        $this->actingAsUser('admin@greenvalley.com');
        $this->postJson('/api/auctions/'.self::AUCTION_ID."/players/{$player->id}/approve")->assertOk();
    }

    public function test_the_same_mobile_cannot_register_twice(): void
    {
        $auction = Auction::find(self::AUCTION_ID);
        $entry = ['full_name' => 'Nishanth P', 'mobile' => '+91 90000 33333', 'age' => 24];

        $this->postJson("/api/auctions/public/registration/{$auction->token}", $entry)->assertCreated();
        $this->postJson("/api/auctions/public/registration/{$auction->token}", [...$entry, 'mobile' => '9000033333'])
            ->assertStatus(409);
    }

    public function test_an_opening_bid_below_base_price_is_refused(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $auction = Auction::find(self::AUCTION_ID);
        $player = $this->approvedPoolPlayer();
        $team = $this->auctionTeam($auction);

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', [
            'team_id' => $team->id,
            'amount' => $player->base_price - 1,
        ])->assertStatus(400);
    }

    public function test_a_player_cannot_be_sold_twice(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $auction = Auction::find(self::AUCTION_ID);
        $player = $this->approvedPoolPlayer();
        $team = $this->auctionTeam($auction);

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', ['team_id' => $team->id, 'amount' => $player->base_price])->assertOk();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/sell-player')->assertOk();

        $squad = Player::query()->where('team_id', $team->id)->count();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/sell-player')->assertStatus(400);
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/unsold-player')->assertStatus(400);
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertStatus(400);

        $this->assertSame($squad, Player::query()->where('team_id', $team->id)->count());
        $this->assertSame('sold', $player->fresh()->status);
    }

    public function test_someone_outside_the_room_cannot_bid_for_a_team(): void
    {
        $auction = Auction::find(self::AUCTION_ID);
        $team = $this->auctionTeam($auction);

        $this->actingAsUser('admin@greenvalley.com');
        $player = $this->approvedPoolPlayer();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();

        foreach (['shameer.player@gmail.com', 'scorer@greenvalley.com', 'admin@malabar.com'] as $email) {
            $this->actingAsUser($email);
            $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', [
                'team_id' => $team->id,
                'amount' => $player->base_price,
            ])->assertForbidden();
        }
    }

    private function approvedPoolPlayer(): AuctionPlayer
    {
        $player = AuctionPlayer::query()->where('auction_id', self::AUCTION_ID)->firstOrFail();
        $player->status = 'approved';
        $player->save();

        return $player;
    }

    /**
     * The team the purse table actually bids with. The auction's tournament may
     * have no approved squads yet, in which case the service falls back to the
     * organization's teams — so resolve through the same path.
     */
    private function auctionTeam(Auction $auction): Team
    {
        $purse = app(AuctionService::class)->teamPurses($auction)[0]
            ?? $this->fail('The auction has no teams able to bid.');

        return Team::findOrFail($purse['team_id']);
    }
}
