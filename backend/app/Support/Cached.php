<?php

namespace App\Support;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Read-through cache for the public endpoints that are computed on request —
 * the tournament hub, brackets, player stats and leaderboards.
 *
 * Entries are grouped into *scopes* (`tournament:<id>`, `org:<id>`,
 * `platform`). Every scope has a version number, and an entry's key carries
 * the versions of all the scopes it was built from. Invalidating a scope is
 * one increment of its version: every entry built from the old version simply
 * stops being asked for and ages out on its TTL. No key scanning, no tags, so
 * it works the same on Redis and on any other store.
 *
 * A version is seeded from the clock, so one lost to eviction comes back
 * larger than any it replaced and can never resurrect an old entry.
 *
 * Invalidation is automatic: `CacheServiceProvider` flushes the right scopes
 * whenever a model is saved or deleted. Only mass `query()->update()` /
 * `->delete()` calls skip model events and need an explicit `flush()`.
 *
 * Off (a straight pass-through, nothing written) unless `caching.enabled` —
 * by default only when the cache store is Redis. A cache outage is never an
 * error: a failed read computes the answer, a failed flush is logged.
 */
final class Cached
{
    private const PREFIX = 'kw:';

    /**
     * @param  string|array<int, string>  $scopes  what the answer is built from
     * @param  string  $key  distinguishes answers within the scopes (query params…)
     * @param  string  $ttl  profile name under `caching.ttl`
     */
    public static function remember(string|array $scopes, string $key, string $ttl, Closure $compute): mixed
    {
        if (! self::enabled()) {
            return $compute();
        }

        try {
            $scopes = (array) $scopes;
            $stamp = implode('.', array_map(self::version(...), $scopes));
            $cacheKey = self::PREFIX.$scopes[0].':'.$stamp.':'.hash('xxh128', $key);
            $hit = Cache::get($cacheKey);
        } catch (Throwable $e) {
            report($e);

            return $compute();
        }

        if ($hit !== null) {
            return $hit;
        }

        $value = $compute();

        try {
            Cache::put($cacheKey, $value, (int) config("caching.ttl.$ttl", 60));
        } catch (Throwable $e) {
            report($e);
        }

        return $value;
    }

    /**
     * A JSON response cached as its encoded body, so a hit is byte-for-byte
     * what the miss sent and costs no model hydration or re-encoding.
     *
     * @param  string|array<int, string>  $scopes
     */
    public static function json(string|array $scopes, string $key, string $ttl, Closure $payload): JsonResponse
    {
        return JsonResponse::fromJsonString(
            self::remember($scopes, $key, $ttl, fn () => response()->json($payload())->getContent())
        );
    }

    public static function flush(string ...$scopes): void
    {
        if (! self::enabled()) {
            return;
        }

        foreach (array_unique($scopes) as $scope) {
            try {
                $key = self::versionKey($scope);

                // Seed first: an increment on a missing key would restart at 1.
                Cache::add($key, time(), now()->addYears(10));
                Cache::increment($key);
            } catch (Throwable $e) {
                Log::warning('Cache flush failed', ['scope' => $scope, 'error' => $e->getMessage()]);
            }
        }
    }

    public static function tournament(string $id): string
    {
        return 'tournament:'.$id;
    }

    public static function org(string $id): string
    {
        return 'org:'.$id;
    }

    public static function enabled(): bool
    {
        return (bool) config('caching.enabled');
    }

    private static function version(string $scope): int
    {
        $key = self::versionKey($scope);
        $version = Cache::get($key);

        // Redis hands numbers back as strings.
        if (is_numeric($version)) {
            return (int) $version;
        }

        $version = time();
        Cache::forever($key, $version);

        return $version;
    }

    private static function versionKey(string $scope): string
    {
        return self::PREFIX.'v:'.$scope;
    }
}
