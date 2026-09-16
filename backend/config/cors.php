<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS)
    |--------------------------------------------------------------------------
    |
    | The SPA is served from a separate origin (Vite in development, a static
    | host in production), so the API answers preflight requests directly.
    | `x-demo-role` and `x-demo-org-id` carry the role switcher used for guided
    | walkthroughs; they are only allowed where the switcher is enabled
    | (see `app.demo_role_switcher`).
    |
    | Narrow `allowed_origins` to your real front-end origins before deploying.
    |
    */

    'paths' => ['api/*', 'up'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => explode(',', (string) env('CORS_ALLOWED_ORIGINS', '*')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => array_merge(
        ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
        (bool) env('DEMO_ROLE_SWITCHER', in_array(env('APP_ENV', 'production'), ['local', 'testing'], true))
            ? ['x-demo-role', 'x-demo-org-id']
            : []
    ),

    'exposed_headers' => [],

    'max_age' => 3600,

    'supports_credentials' => false,

];
