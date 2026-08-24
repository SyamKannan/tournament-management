<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * Pushes live events to the standalone WebSocket gateway
 * (`php artisan websocket:serve`).
 *
 * The gateway owns the client sockets; this class simply hands it a message
 * over a loopback HTTP call. Delivery is best-effort by design: scoring, bidding
 * and announcement endpoints must keep working and returning their normal HTTP
 * responses even when the gateway is not running.
 */
class RealtimeBroadcaster
{
    public function toRoom(string $room, string $type, array $payload = []): void
    {
        $this->push(['room' => $room, 'type' => $type, 'payload' => $payload]);
    }

    public function toEveryone(string $type, array $payload = []): void
    {
        $this->push(['room' => null, 'type' => $type, 'payload' => $payload]);
    }

    private function push(array $message): void
    {
        $endpoint = rtrim((string) config('realtime.bridge_url'), '/').'/broadcast';
        $body = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nConnection: close\r\n",
                'content' => $body,
                'timeout' => (float) config('realtime.bridge_timeout', 0.5),
                'ignore_errors' => true,
            ],
        ]);

        // Suppressed on purpose: an unreachable gateway must never fail the request.
        $result = @file_get_contents($endpoint, false, $context);

        if ($result === false) {
            Log::debug('Realtime gateway unreachable; skipped broadcast.', [
                'type' => $message['type'],
                'room' => $message['room'],
            ]);
        }
    }
}
