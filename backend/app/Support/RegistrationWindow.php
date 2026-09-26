<?php

namespace App\Support;

use App\Models\RegistrationLink;
use App\Models\Tournament;
use Illuminate\Support\Carbon;

/**
 * Whether a tournament is still taking team entries. The registration page
 * refuses entries on this, and the club dashboard shows it, so both agree.
 */
class RegistrationWindow
{
    /**
     * Why entries are closed, or null while they are open. The closing date was
     * being collected and shown but never enforced, so teams could enter days
     * after the deadline — and after the draw had been made.
     */
    public static function closedReason(Tournament $tournament, ?RegistrationLink $link): ?string
    {
        if (in_array($tournament->status, ['cancelled', 'completed'], true)) {
            return $tournament->status === 'cancelled'
                ? 'This tournament has been cancelled.'
                : 'This tournament has already finished.';
        }

        $deadline = $link?->deadline ?: $tournament->registration_closing;

        if ($deadline) {
            try {
                // A date with no time means entries close at the end of that day.
                $closesAt = Carbon::parse($deadline);

                if ($closesAt->equalTo($closesAt->copy()->startOfDay())) {
                    $closesAt = $closesAt->endOfDay();
                }

                if ($closesAt->isPast()) {
                    return 'Registration closed on '.$closesAt->format('j M Y').'.';
                }
            } catch (\Exception) {
                // An unparseable date is treated as no deadline at all.
            }
        }

        return null;
    }
}
