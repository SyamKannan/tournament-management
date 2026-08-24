<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Services\RealtimeBroadcaster;
use Tests\TestCase;

/**
 * The WebSocket gateway is a separate process. Scoring, bidding and
 * announcements must keep working — and keep returning their normal responses —
 * whether or not it happens to be running.
 */
class RealtimeResilienceTest extends TestCase
{
    public function test_scoring_still_succeeds_when_the_gateway_is_unreachable(): void
    {
        config(['realtime.bridge_url' => 'http://127.0.0.1:59999', 'realtime.bridge_timeout' => 0.05]);

        $match = GameMatch::find('match-fb-live-1');
        $this->actingAsUser('scorer@greenvalley.com');

        $this->postJson('/api/matches/match-fb-live-1/football/event', [
            'team_id' => $match->team_a_id,
            'player_id' => 'pl-mb-3',
            'event_type' => 'goal',
            'minute' => 70,
        ])->assertOk()->assertJsonPath('state.team_a_score', 3);
    }

    public function test_scoring_endpoints_publish_to_both_the_scorer_and_scoreboard_rooms(): void
    {
        $broadcaster = $this->spyBroadcaster();
        $match = GameMatch::find('match-fb-live-1');
        $this->actingAsUser('scorer@greenvalley.com');

        $this->postJson('/api/matches/match-fb-live-1/football/event', [
            'team_id' => $match->team_a_id,
            'player_id' => 'pl-mb-3',
            'event_type' => 'goal',
            'minute' => 70,
        ])->assertOk();

        $this->assertSame([
            ['match:match-fb-live-1', 'SCORE_UPDATED'],
            ['scoreboard:match-fb-live-1', 'SCORE_UPDATED'],
        ], $broadcaster->rooms);
    }

    public function test_pinning_an_announcement_publishes_to_every_connected_screen(): void
    {
        $broadcaster = $this->spyBroadcaster();
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/announcements', [
            'title' => 'Match delayed',
            'message' => 'Heavy rain — play resumes at 17:00.',
            'type' => 'urgent_match_delay',
            'is_active_on_scoreboard' => true,
        ])->assertCreated();

        $this->assertSame(['EMERGENCY_ANNOUNCEMENT'], $broadcaster->global);
    }

    public function test_an_unpinned_announcement_does_not_interrupt_screens(): void
    {
        $broadcaster = $this->spyBroadcaster();
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/sponsors/announcements', [
            'title' => 'Routine notice',
            'message' => 'Team meeting at 09:00.',
        ])->assertCreated();

        $this->assertSame([], $broadcaster->global);
    }

    public function test_placing_a_bid_publishes_to_the_auction_room(): void
    {
        $broadcaster = $this->spyBroadcaster();
        $this->actingAsUser('admin@greenvalley.com');

        $player = \App\Models\AuctionPlayer::query()->where('auction_id', 'auction-football-1')->firstOrFail();
        $player->update(['status' => 'approved']);

        $this->postJson('/api/auctions/auction-football-1/call-player', ['player_id' => $player->id])->assertOk();

        $this->assertSame([['auction:auction-football-1', 'PLAYER_ON_HAMMER']], $broadcaster->rooms);
    }

    /**
     * Swap the broadcaster for one that records instead of sending.
     */
    private function spyBroadcaster(): RealtimeBroadcaster
    {
        $spy = new class extends RealtimeBroadcaster
        {
            /** @var array<int, array{0: string, 1: string}> */
            public array $rooms = [];

            /** @var array<int, string> */
            public array $global = [];

            public function toRoom(string $room, string $type, array $payload = []): void
            {
                $this->rooms[] = [$room, $type];
            }

            public function toEveryone(string $type, array $payload = []): void
            {
                $this->global[] = $type;
            }
        };

        $this->app->instance(RealtimeBroadcaster::class, $spy);

        return $spy;
    }
}
