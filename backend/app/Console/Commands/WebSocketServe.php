<?php

namespace App\Console\Commands;

use App\WebSocket\Hub;
use Illuminate\Console\Command;
use Workerman\Connection\TcpConnection;
use Workerman\Protocols\Http\Request as WorkermanRequest;
use Workerman\Protocols\Http\Response as WorkermanResponse;
use Workerman\Worker;

/**
 * Runs the real-time gateway.
 *
 * Two listeners share one event loop:
 *   - a public WebSocket listener (default :4000, path /ws) that browsers connect to
 *   - a loopback HTTP bridge (default 127.0.0.1:4100) the API posts events to
 *
 * The wire protocol is deliberately plain JSON — `SUBSCRIBE`, `UNSUBSCRIBE` and
 * `PING` in, room-addressed events out — so the browser needs no client library.
 */
class WebSocketServe extends Command
{
    protected $signature = 'websocket:serve
                            {--host= : Address the WebSocket listener binds to}
                            {--port= : Port the WebSocket listener binds to}
                            {--d|daemon : Run in the background}';

    protected $description = 'Run the real-time WebSocket gateway for live scoring, auctions and announcements';

    public function handle(): int
    {
        $host = (string) ($this->option('host') ?: config('realtime.ws_host'));
        $port = (int) ($this->option('port') ?: config('realtime.ws_port'));
        $path = (string) config('realtime.ws_path');
        $bridgeHost = (string) config('realtime.bridge_host');
        $bridgePort = (int) config('realtime.bridge_port');

        $hub = new Hub();

        $this->bootWebSocketListener($hub, $host, $port, $path, $bridgeHost, $bridgePort);

        $this->line("⚡ WebSocket gateway listening on ws://{$host}:{$port}{$path}");
        $this->line("🔒 Internal broadcast bridge on http://{$bridgeHost}:{$bridgePort}/broadcast");

        // Workerman reads its verb straight from $argv; Artisan's own arguments
        // are already consumed by this point, so hand it a clean command line.
        global $argv;
        $argv = [$argv[0], 'start'];
        if ($this->option('daemon')) {
            $argv[] = '-d';
        }

        Worker::runAll();

        return self::SUCCESS;
    }

    private function bootWebSocketListener(Hub $hub, string $host, int $port, string $path, string $bridgeHost, int $bridgePort): void
    {
        $worker = new Worker("websocket://{$host}:{$port}");
        $worker->name = 'sports-saas-ws';
        $worker->count = 1;

        // The bridge listener is opened from inside this worker rather than as a
        // second Worker, because Workerman forks a process per Worker and the two
        // listeners must share one Hub — the bridge has to see the very sockets
        // the WebSocket listener is holding.
        $worker->onWorkerStart = function () use ($hub, $bridgeHost, $bridgePort) {
            $this->bootBridgeListener($hub, $bridgeHost, $bridgePort);
        };

        $worker->onWebSocketConnect = function (TcpConnection $connection, $request) use ($hub, $path) {
            if ($this->requestPath($request) !== $path) {
                $connection->close();

                return;
            }

            $hub->attach($connection);

            $connection->send($this->json([
                'type' => 'CONNECTED',
                'message' => 'Connected to Antigravity Real-Time Sports Gateway',
            ]));
        };

        $worker->onMessage = function (TcpConnection $connection, $data) use ($hub) {
            $this->handleClientMessage($hub, $connection, (string) $data);
        };

        $worker->onClose = function (TcpConnection $connection) use ($hub) {
            $hub->detach($connection);
        };

        $worker->onError = function (TcpConnection $connection, $code, $message) {
            fwrite(STDERR, "WebSocket client error [{$code}]: {$message}\n");
        };
    }

    private function requestPath(mixed $request): string
    {
        if ($request instanceof WorkermanRequest) {
            return $request->path();
        }

        return (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    }

    private function handleClientMessage(Hub $hub, TcpConnection $connection, string $raw): void
    {
        $message = json_decode($raw, true);
        if (! is_array($message) || ! isset($message['type'])) {
            return;
        }

        $type = (string) $message['type'];
        $room = isset($message['room']) ? (string) $message['room'] : null;

        if ($type === 'PING') {
            $connection->send($this->json([
                'type' => 'PONG',
                'timestamp' => (int) round(microtime(true) * 1000),
            ]));

            return;
        }

        if ($room === null) {
            return;
        }

        if ($type === 'SUBSCRIBE') {
            $hub->subscribe($connection, $room);
            $connection->send($this->json(['type' => 'SUBSCRIBED', 'room' => $room]));
        } elseif ($type === 'UNSUBSCRIBE') {
            $hub->unsubscribe($connection, $room);
            $connection->send($this->json(['type' => 'UNSUBSCRIBED', 'room' => $room]));
        }
    }

    private function bootBridgeListener(Hub $hub, string $host, int $port): void
    {
        $worker = new Worker("http://{$host}:{$port}");
        $worker->name = 'sports-saas-ws-bridge';

        $worker->onMessage = function (TcpConnection $connection, WorkermanRequest $request) use ($hub) {
            $connection->send($this->handleBridgeRequest($hub, $request));
        };

        // listen() binds in the current process; instantiating a second Worker
        // before runAll() would fork it into one of its own.
        $worker->listen();
    }

    private function handleBridgeRequest(Hub $hub, WorkermanRequest $request): WorkermanResponse
    {
        $headers = ['Content-Type' => 'application/json'];

        if ($request->path() === '/health') {
            return new WorkermanResponse(200, $headers, $this->json([
                'status' => 'healthy',
                'connections' => $hub->connectionCount(),
                'rooms' => $hub->roomCount(),
            ]));
        }

        if ($request->path() !== '/broadcast' || $request->method() !== 'POST') {
            return new WorkermanResponse(404, $headers, $this->json(['error' => 'Not found']));
        }

        $body = json_decode((string) $request->rawBody(), true);
        if (! is_array($body) || ! isset($body['type'])) {
            return new WorkermanResponse(422, $headers, $this->json(['error' => 'A message type is required']));
        }

        $room = $body['room'] ?? null;
        $payload = $body['payload'] ?? [];

        $delivered = $room
            ? $hub->broadcastToRoom((string) $room, (string) $body['type'], $payload)
            : $hub->broadcastGlobal((string) $body['type'], $payload);

        return new WorkermanResponse(200, $headers, $this->json(['delivered' => $delivered]));
    }

    private function json(array $data): string
    {
        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
