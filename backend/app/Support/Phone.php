<?php

namespace App\Support;

/**
 * Turns the phone numbers people actually type into one comparable form.
 *
 * The same manager's number arrives as `+91 94470 98765`, `09447098765` and
 * `9447098765` on three different forms, and a gateway wants exactly one of
 * those. Normalising on the way out also makes the opt-out list work: a number
 * that asked to be left alone must match however it was written down.
 *
 * India is assumed for bare 10-digit numbers because that is who uses this —
 * anything already carrying a country code is left as it is.
 */
final class Phone
{
    private const DEFAULT_COUNTRY_CODE = '91';

    /** E.164 without the `+`, or null when there is nothing dialable. */
    public static function normalize(?string $raw): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $raw) ?? '';

        if ($digits === '') {
            return null;
        }

        // A single leading zero is the domestic trunk prefix, not part of the
        // number. `00` is an international prefix, which is.
        if (str_starts_with($digits, '0') && ! str_starts_with($digits, '00')) {
            $digits = ltrim($digits, '0');
        }

        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }

        if ($digits === '') {
            return null;
        }

        // Ten digits with no country code is the common case here.
        if (strlen($digits) === 10) {
            $digits = self::DEFAULT_COUNTRY_CODE.$digits;
        }

        // Shorter than a country code plus a subscriber number cannot be real,
        // and longer than E.164 allows cannot either.
        if (strlen($digits) < 11 || strlen($digits) > 15) {
            return null;
        }

        return $digits;
    }

    /** The `+` form, for display and for gateways that want it. */
    public static function e164(?string $raw): ?string
    {
        $normalized = self::normalize($raw);

        return $normalized ? '+'.$normalized : null;
    }

    /**
     * The first usable number from several candidates — a team carries a
     * WhatsApp number and a phone number, and either may be the blank one.
     */
    public static function first(?string ...$candidates): ?string
    {
        foreach ($candidates as $candidate) {
            if ($normalized = self::normalize($candidate)) {
                return $normalized;
            }
        }

        return null;
    }
}
