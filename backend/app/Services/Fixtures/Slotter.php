<?php

namespace App\Services\Fixtures;

use App\Models\Venue;
use Illuminate\Support\Carbon;

/**
 * Puts a round of fixtures on grounds and clocks.
 *
 * Fixtures used to all be given the organization's *first* venue and stacked at
 * two- or three-hour offsets from one instant, which meant a club with three
 * grounds used one of them and a tournament ran through the night.
 *
 * Two rules, and they are the whole point:
 *   - a ground hosts one match at a time. Matches in a round fill the available
 *     grounds first and only then move to the next time slot, so nothing is
 *     ever double-booked.
 *   - a round is a day. The round-robin and bracket builders both hand over
 *     rounds in which no team appears twice, so no side is ever asked to play
 *     two matches at once, or two in a row without a rest.
 */
class Slotter
{
    /** @var array<int, string|null> */
    private array $venues;

    private int $slotMinutes;

    /**
     * @param  array<int, string>  $venueIds  grounds to rotate through; empty is fine
     * @param  int  $matchMinutes  how long a match of this sport takes
     */
    public function __construct(
        private readonly Carbon $start,
        array $venueIds = [],
        int $matchMinutes = 60,
    ) {
        // No venues on file is normal for a new club — the fixtures still need
        // times, they just carry no ground.
        $this->venues = $venueIds ?: [null];

        // Half an hour between matches on the same ground: the previous one
        // overruns, and somebody has to clear the pitch.
        $this->slotMinutes = max(30, $matchMinutes) + 30;
    }

    /**
     * Read the grounds a tournament's organizer has, in a stable order.
     *
     * @return array<int, string>
     */
    public static function venuesFor(string $organizationId): array
    {
        return Venue::query()
            ->where('organization_id', $organizationId)
            ->orderBy('name')
            ->pluck('id')
            ->all();
    }

    /**
     * Where the nth match of a round is played and when.
     *
     * @return array{venue_id: string|null, scheduled_at: string}
     */
    public function slot(int $roundIndex, int $indexInRound): array
    {
        $venueCount = count($this->venues);

        $kickoff = $this->start
            ->copy()
            ->addDays($roundIndex)
            // Only once every ground is busy does the clock move on.
            ->addMinutes(intdiv($indexInRound, $venueCount) * $this->slotMinutes);

        return [
            'venue_id' => $this->venues[$indexInRound % $venueCount],
            'scheduled_at' => $kickoff->format('Y-m-d\TH:i:s.v\Z'),
        ];
    }

    public function venueCount(): int
    {
        return count(array_filter($this->venues));
    }
}
