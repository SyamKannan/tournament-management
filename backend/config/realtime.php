<?php

return [

    /*
    |--------------------------------------------------------------------------
    | WebSocket Gateway
    |--------------------------------------------------------------------------
    |
    | The gateway is a standalone Workerman process started with
    | `php artisan websocket:serve`. Browsers connect to `ws_host:ws_port/ws`;
    | the API pushes events to it over the loopback bridge.
    |
    */

    'ws_host' => env('WEBSOCKET_HOST', '0.0.0.0'),

    'ws_port' => (int) env('WEBSOCKET_PORT', 4000),

    'ws_path' => env('WEBSOCKET_PATH', '/ws'),

    'bridge_host' => env('WEBSOCKET_BRIDGE_HOST', '127.0.0.1'),

    'bridge_port' => (int) env('WEBSOCKET_BRIDGE_PORT', 4100),

    'bridge_url' => env('WEBSOCKET_BRIDGE_URL', 'http://127.0.0.1:4100'),

    'bridge_timeout' => (float) env('WEBSOCKET_BRIDGE_TIMEOUT', 0.5),

];
