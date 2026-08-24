<?php

namespace App\WebSocket;

use Workerman\Connection\TcpConnection;

/**
 * Room registry for the live gateway.
 *
 * Clients subscribe to rooms by name (`match:<id>`, `scoreboard:<id>`,
 * `auction:<id>`); the API then fans events out to everyone in a room. Rooms are
 * created implicitly on first subscribe and dropped when they empty.
 */
class Hub
{
    /** @var array<int, TcpConnection> */
    private array $connections = [];

    /** @var array<string, array<int, true>> room name => set of connection ids */
    private array $rooms = [];

    /** @var array<int, array<string, true>> connection id => set of room names */
    private array $connectionRooms = [];

    public function attach(TcpConnection $connection): void
    {
        $this->connections[$connection->id] = $connection;
        $this->connectionRooms[$connection->id] = [];
    }

    public function detach(TcpConnection $connection): void
    {
        foreach (array_keys($this->connectionRooms[$connection->id] ?? []) as $room) {
            unset($this->rooms[$room][$connection->id]);
            if (empty($this->rooms[$room])) {
                unset($this->rooms[$room]);
            }
        }

        unset($this->connections[$connection->id], $this->connectionRooms[$connection->id]);
    }

    public function subscribe(TcpConnection $connection, string $room): void
    {
        $this->rooms[$room][$connection->id] = true;
        $this->connectionRooms[$connection->id][$room] = true;
    }

    public function unsubscribe(TcpConnection $connection, string $room): void
    {
        unset($this->rooms[$room][$connection->id], $this->connectionRooms[$connection->id][$room]);

        if (empty($this->rooms[$room])) {
            unset($this->rooms[$room]);
        }
    }

    public function broadcastToRoom(string $room, string $type, mixed $payload): int
    {
        $message = $this->encode([
            'type' => $type,
            'room' => $room,
            'payload' => $payload,
            'timestamp' => (int) round(microtime(true) * 1000),
        ]);

        $sent = 0;
        foreach (array_keys($this->rooms[$room] ?? []) as $connectionId) {
            if (isset($this->connections[$connectionId])) {
                $this->connections[$connectionId]->send($message);
                $sent++;
            }
        }

        return $sent;
    }

    public function broadcastGlobal(string $type, mixed $payload): int
    {
        $message = $this->encode([
            'type' => $type,
            'payload' => $payload,
            'timestamp' => (int) round(microtime(true) * 1000),
        ]);

        foreach ($this->connections as $connection) {
            $connection->send($message);
        }

        return count($this->connections);
    }

    public function connectionCount(): int
    {
        return count($this->connections);
    }

    public function roomCount(): int
    {
        return count($this->rooms);
    }

    private function encode(array $message): string
    {
        return json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
