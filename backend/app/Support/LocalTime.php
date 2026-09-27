<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * The organizers' wall clock, as opposed to the server's UTC.
 *
 * Fixtures were built in UTC and then stamped with a `Z`, so a kick-off the
 * organizer set for 4pm was stored as 4pm UTC and every browser in India showed
 * it at 9:30pm, while the SMS reminder (formatted in UTC) said 4pm. Anything a
 * person types or reads as a time of day goes through here.
 */
final class LocalTime
{
    public static function zone(): string
    {
        return (string) (config('app.local_timezone') ?: 'Asia/Kolkata');
    }

    public static function now(): Carbon
    {
        return Carbon::now(self::zone());
    }

    /**
     * A stored or typed time. One carrying its own offset (`…Z`, `+05:30`)
     * keeps it; a bare "2027-03-01 16:00" is the organizers' local time.
     */
    public static function parse(string $value): Carbon
    {
        return Carbon::parse($value, self::zone());
    }

    /** How a moment is stored on `matches.scheduled_at`: UTC, ISO-8601. */
    public static function stored(Carbon $moment): string
    {
        return $moment->copy()->utc()->format('Y-m-d\TH:i:s.v\Z');
    }

    /** A moment as people on the ground read it. */
    public static function format(Carbon $moment, string $format): string
    {
        return $moment->copy()->setTimezone(self::zone())->format($format);
    }
}
