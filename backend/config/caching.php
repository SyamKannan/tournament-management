<?php

/*
|--------------------------------------------------------------------------
| Public read cache (App\Support\Cached)
|--------------------------------------------------------------------------
|
| Caches the public, computed-on-request endpoints. Writes invalidate it
| immediately (CacheServiceProvider), so the TTLs are only a ceiling on how
| long an entry lingers unused — not how stale an answer can be.
|
| On by default only when the cache store is Redis: on the database store
| every invalidation would be one more write to the same database the cache
| is meant to spare.
|
*/

return [

    'enabled' => (bool) env('RESPONSE_CACHE_ENABLED', env('CACHE_STORE', 'database') === 'redis'),

    // Seconds.
    'ttl' => [
        'hub' => (int) env('CACHE_TTL_HUB', 300),
        'stats' => (int) env('CACHE_TTL_STATS', 600),
        'platform' => (int) env('CACHE_TTL_PLATFORM', 3600),
    ],

];
