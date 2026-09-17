<?php

namespace Tests\Feature;

use App\Models\Auction;
use App\Models\AuctionPlayer;
use Tests\TestCase;

class AuctionPaymentReportTest extends TestCase
{
    private const AUCTION_ID = 'auction-football-1';

    public function test_payment_report_is_for_the_organizer_only(): void
    {
        $this->getJson('/api/auctions/'.self::AUCTION_ID.'/payment-report')->assertUnauthorized();

        $this->actingAsUser('manager@malabarblasters.com');
        $this->getJson('/api/auctions/'.self::AUCTION_ID.'/payment-report')->assertForbidden();
    }

    public function test_payment_report_returns_summary_and_disbursement_breakdown(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->getJson('/api/auctions/'.self::AUCTION_ID.'/payment-report')->assertOk();

        $this->assertSame(self::AUCTION_ID, $response->json('auction.id'));
        $this->assertArrayHasKey('summary', $response->json());
        $this->assertArrayHasKey('total_entitled_amount', $response->json('summary'));
        $this->assertArrayHasKey('total_paid_amount', $response->json('summary'));
        $this->assertArrayHasKey('total_pending_amount', $response->json('summary'));
        $this->assertArrayHasKey('settlement_percentage', $response->json('summary'));
        $this->assertIsArray($response->json('team_summaries'));
        $this->assertIsArray($response->json('sold_players'));
        $this->assertNotNull($response->json('virtual_money_disclaimer'));
    }

    public function test_organizer_can_mark_player_payment_as_paid_with_method_and_reference(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = AuctionPlayer::query()
            ->where('auction_id', self::AUCTION_ID)
            ->where('status', 'sold')
            ->firstOrFail();

        $response = $this->postJson('/api/auctions/'.self::AUCTION_ID."/players/{$player->id}/payment", [
            'payment_status' => 'paid',
            'payment_method' => 'upi',
            'payment_reference' => 'UPI/TXN/99887766',
            'payment_notes' => 'Settled via GooglePay by committee',
        ])->assertOk();

        $this->assertSame('paid', $response->json('player.payment_status'));
        $this->assertSame('upi', $response->json('player.payment_method'));
        $this->assertSame('UPI/TXN/99887766', $response->json('player.payment_reference'));
        $this->assertNotNull($response->json('player.paid_at'));

        $player->refresh();
        $this->assertSame('paid', $player->payment_status);
        $this->assertSame('upi', $player->payment_method);
        $this->assertSame('UPI/TXN/99887766', $player->payment_reference);
    }

    public function test_organizer_can_revert_player_payment_to_pending(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = AuctionPlayer::query()
            ->where('auction_id', self::AUCTION_ID)
            ->where('status', 'sold')
            ->firstOrFail();

        $player->payment_status = 'paid';
        $player->save();

        $response = $this->postJson('/api/auctions/'.self::AUCTION_ID."/players/{$player->id}/payment", [
            'payment_status' => 'pending',
            'payment_notes' => 'Reverted for re-verification',
        ])->assertOk();

        $this->assertSame('pending', $response->json('player.payment_status'));
        $this->assertNull($response->json('player.paid_at'));
    }

    public function test_bulk_updating_player_payments(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $soldPlayers = AuctionPlayer::query()
            ->where('auction_id', self::AUCTION_ID)
            ->where('status', 'sold')
            ->get();

        $response = $this->postJson('/api/auctions/'.self::AUCTION_ID.'/payments/bulk-update', [
            'player_ids' => $soldPlayers->pluck('id')->all(),
            'payment_status' => 'paid',
            'payment_method' => 'cash',
            'payment_notes' => 'Cash handed over at prize distribution ceremony',
        ])->assertOk();

        $this->assertSame($soldPlayers->count(), $response->json('count'));

        foreach ($soldPlayers as $player) {
            $player->refresh();
            $this->assertSame('paid', $player->payment_status);
            $this->assertSame('cash', $player->payment_method);
        }
    }

    public function test_non_organizer_cannot_update_player_payment(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $player = AuctionPlayer::query()
            ->where('auction_id', self::AUCTION_ID)
            ->where('status', 'sold')
            ->firstOrFail();

        $this->postJson('/api/auctions/'.self::AUCTION_ID."/players/{$player->id}/payment", [
            'payment_status' => 'paid',
        ])->assertForbidden();
    }
}
