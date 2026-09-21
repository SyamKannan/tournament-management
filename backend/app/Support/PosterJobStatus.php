<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Where a requested poster has got to, readable by the page that asked for it.
 *
 * The page used to diff the poster list every few seconds and give up after
 * two minutes with "check that the queue worker is running" — an instruction
 * for a sysadmin, shown to a club organizer. A render that failed looked the
 * same as one still running, and leaving the page lost track of it entirely.
 *
 * Each "Generate" click now gets an id; the job writes its progress here and
 * the page asks by id, so it can say "retrying (attempt 2 of 3)", "ready", or
 * "couldn't be made — try again" — and pick the job back up after a reload.
 */
final class PosterJobStatus
{
    /** Long enough to come back to after lunch; short enough not to pile up. */
    private const TTL_SECONDS = 6 * 3600;

    public static function key(string $jobId): string
    {
        return 'poster_job:'.$jobId;
    }

    /** @param  array<string, mixed>  $fields */
    public static function put(string $jobId, array $fields): void
    {
        $current = self::get($jobId) ?? [];

        Cache::put(self::key($jobId), [
            ...$current,
            ...$fields,
            'id' => $jobId,
            'updated_at' => now()->toIso8601String(),
        ], self::TTL_SECONDS);
    }

    /** @return array<string, mixed>|null */
    public static function get(string $jobId): ?array
    {
        $value = Cache::get(self::key($jobId));

        return is_array($value) ? $value : null;
    }
}
