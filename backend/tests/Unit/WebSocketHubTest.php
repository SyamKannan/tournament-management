<?php

namespace Tests\Unit;

use App\WebSocket\Hub;
use PHPUnit\Framework\TestCase;
use Workerman\Connection\TcpConnection;

class WebSocketHubTest extends TestCase
{
    public function test_a_message_reaches_only_the_room_it_targets(): void
    {
        $hub = new Hub();
        $inRoom = $this->fakeConnection(1);
        $elsewhere = $this->fakeConnection(2);

        $hub->attach($inRoom);
        $hub->attach($elsewhere);
        $hub->subscribe($inRoom, 'match:abc');
        $hub->subscribe($elsewhere, 'match:xyz');

        $this->assertSame(1, $hub->broadcastToRoom('match:abc', 'SCORE_UPDATED', ['team_a_score' => 1]));

        $this->assertCount(1, $inRoom->sent);
        $this->assertCount(0, $elsewhere->sent);

        $payload = json_decode($inRoom->sent[0], true);
        $this->assertSame('SCORE_UPDATED', $payload['type']);
        $this->assertSame('match:abc', $payload['room']);
        $this->assertSame(1, $payload['payload']['team_a_score']);
    }

    public function test_a_global_message_reaches_every_connection(): void
    {
        $hub = new Hub();
        $first = $this->fakeConnection(1);
        $second = $this->fakeConnection(2);

        $hub->attach($first);
        $hub->attach($second);

        $this->assertSame(2, $hub->broadcastGlobal('EMERGENCY_ANNOUNCEMENT', ['announcement' => null]));
        $this->assertCount(1, $first->sent);
        $this->assertCount(1, $second->sent);
    }

    public function test_unsubscribing_stops_delivery_and_drops_the_empty_room(): void
    {
        $hub = new Hub();
        $connection = $this->fakeConnection(1);

        $hub->attach($connection);
        $hub->subscribe($connection, 'auction:1');
        $this->assertSame(1, $hub->roomCount());

        $hub->unsubscribe($connection, 'auction:1');

        $this->assertSame(0, $hub->broadcastToRoom('auction:1', 'BID_PLACED', []));
        $this->assertSame(0, $hub->roomCount());
    }

    public function test_a_disconnect_clears_every_room_the_client_had_joined(): void
    {
        $hub = new Hub();
        $connection = $this->fakeConnection(1);

        $hub->attach($connection);
        $hub->subscribe($connection, 'match:abc');
        $hub->subscribe($connection, 'scoreboard:abc');

        $hub->detach($connection);

        $this->assertSame(0, $hub->connectionCount());
        $this->assertSame(0, $hub->roomCount());
        $this->assertSame(0, $hub->broadcastToRoom('match:abc', 'SCORE_UPDATED', []));
    }

    /**
     * A stand-in for a live socket that records what was written to it.
     */
    private function fakeConnection(int $id): TcpConnection
    {
        return new class($id) extends TcpConnection
        {
            /** @var array<int, string> */
            public array $sent = [];

            public function __construct(int $id)
            {
                $this->id = $id;
            }

            public function send($sendBuffer, $raw = false): bool
            {
                $this->sent[] = (string) $sendBuffer;

                return true;
            }
        };
    }
}
