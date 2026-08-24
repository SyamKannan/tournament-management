<?php

namespace App\Support;

/**
 * Generates the millisecond-timestamped string identifiers this platform uses
 * as primary keys (`tourney_1724500000000`, `bid_1724500000000_a1b2`).
 *
 * Unlike the array-backed store this replaced, these values are now real
 * primary keys, so anything created in a tight loop uses `unique()` to add a
 * random suffix and stay collision-free within a single millisecond.
 */
final class Ids
{
    public static function millis(): int
    {
        return (int) round(microtime(true) * 1000);
    }

    public static function timestamped(string $prefix): string
    {
        return $prefix.'_'.self::millis();
    }

    public static function unique(string $prefix): string
    {
        return $prefix.'_'.self::millis().'_'.self::token(5);
    }

    public static function token(int $length = 6): string
    {
        $alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $out;
    }

    /**
     * Slugify a name the same way the previous Node service did:
     * lower-cased, non-alphanumerics collapsed to single hyphens, trimmed.
     */
    public static function slug(string $value): string
    {
        $slug = strtolower($value);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';

        return trim($slug, '-');
    }

    /**
     * ISO-8601 UTC timestamp with millisecond precision.
     */
    public static function now(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }
}
