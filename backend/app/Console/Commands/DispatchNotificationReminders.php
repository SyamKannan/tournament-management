<?php

namespace App\Console\Commands;

use App\Models\GameMatch;
use App\Models\PlatformSetting;
use App\Models\RegistrationPayment;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\Notifications\Audience;
use App\Services\Notifications\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * The time-based half of the notification engine: reminders nobody clicks a
 * button for.
 *
 * Runs often and relies on `dedupe_key` rather than on bookkeeping to avoid
 * repeats — every message it can send has a key naming the match or the week it
 * is for, so running twice in a minute or catching up after a day of downtime
 * both send each reminder exactly once.
 */
class DispatchNotificationReminders extends Command
{
    protected $signature = 'notifications:reminders
                            {--dry-run : List what would be sent without queueing anything}';

    protected $description = 'Queue match reminders and unpaid ground-fee reminders that are due';

    public function handle(NotificationService $notifications): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $matches = $this->matchReminders($notifications, $dryRun);
        $fees = $this->feeReminders($notifications, $dryRun);

        $this->info(sprintf(
            '%s%d match reminder(s), %d fee reminder(s).',
            $dryRun ? '[dry run] ' : '',
            $matches,
            $fees
        ));

        return self::SUCCESS;
    }

    /**
     * A reminder per configured window before kick-off.
     *
     * The window is a band, not an instant — the sweep does not run at the exact
     * second a match is 24 hours away. `dedupe_key` carries the window, so the
     * 24-hour and 2-hour reminders are separate messages and neither repeats.
     */
    private function matchReminders(NotificationService $notifications, bool $dryRun): int
    {
        $windows = (array) config('notifications.match_reminder_hours', []);
        $now = now();
        $furthest = $now->copy()->addHours(max([1, ...array_map('intval', $windows)]) + 1);

        $matches = GameMatch::query()
            ->where('status', 'scheduled')
            ->where('scheduled_at', '!=', '')
            ->get()
            ->filter(function (GameMatch $match) use ($now, $furthest) {
                $kickoff = $this->parseSchedule($match->scheduled_at);

                return $kickoff && $kickoff->isBetween($now, $furthest);
            });

        $sent = 0;

        foreach ($matches as $match) {
            $kickoff = $this->parseSchedule($match->scheduled_at);
            $hoursAway = $now->diffInHours($kickoff, false);

            // The smallest window this match has already come inside, so a
            // match 3 hours out gets the 24-hour reminder and not yet the 2.
            $window = null;

            foreach ($windows as $candidate) {
                if ($hoursAway <= (int) $candidate && ($window === null || (int) $candidate < $window)) {
                    $window = (int) $candidate;
                }
            }

            if ($window === null) {
                continue;
            }

            $tournament = Tournament::find($match->tournament_id);
            $teams = Team::query()->whereIn('id', [$match->team_a_id, $match->team_b_id])->get()->keyBy('id');
            $venue = $match->venue_id ? Venue::find($match->venue_id) : null;

            foreach ([[$match->team_a_id, $match->team_b_id], [$match->team_b_id, $match->team_a_id]] as [$teamId, $opponentId]) {
                $team = $teams->get($teamId);

                if (! $team) {
                    continue;
                }

                $sent += $this->queue($notifications, $dryRun, 'match_reminder', Audience::teamManager($team), [
                    'team' => $team->name,
                    'opponent' => $teams->get($opponentId)?->name ?? 'the other side',
                    'kickoff' => $kickoff->format('D j M, g:ia'),
                    'venue_line' => $venue?->name ? ' at '.$venue->name : '',
                    'tournament' => $tournament?->name ?? '',
                ], $tournament?->organization_id, 'match', $match->id, "match_reminder:{$match->id}:{$window}h:{$teamId}");
            }
        }

        return $sent;
    }

    /**
     * One reminder a week per team that still owes something, for as long as it
     * is owed — weekly rather than daily because this goes to a volunteer
     * running a village side, and a daily text is how a number gets blocked.
     */
    private function feeReminders(NotificationService $notifications, bool $dryRun): int
    {
        $tournaments = Tournament::query()
            ->whereIn('status', ['registration_open', 'registration_closed', 'upcoming', 'ongoing'])
            ->where('ground_fee', '>', 0)
            ->get()
            ->keyBy('id');

        if ($tournaments->isEmpty()) {
            return 0;
        }

        // Straight off the payment rows — one per team, already carrying what is
        // left to pay, so there is nothing to recompute here.
        $outstanding = RegistrationPayment::query()
            ->whereIn('tournament_id', $tournaments->keys())
            ->where('remaining_amount', '>', 0)
            ->get();

        $teams = Team::query()
            ->whereIn('id', $outstanding->pluck('team_id'))
            ->whereIn('status', ['approved', 'pending'])
            ->get()
            ->keyBy('id');

        $week = now()->format('o-\WW');
        $sent = 0;

        foreach ($outstanding as $payment) {
            $team = $teams->get($payment->team_id);
            $tournament = $tournaments->get($payment->tournament_id);

            if (! $team || ! $tournament) {
                continue;
            }

            $sent += $this->queue($notifications, $dryRun, 'fee_due_reminder', Audience::teamManager($team), [
                'team' => $team->name,
                'tournament' => $tournament->name,
                'balance' => $this->money($payment->remaining_amount),
                'deadline' => $tournament->registration_closing ?: $tournament->start_date,
            ], $tournament->organization_id, 'team', $team->id, "fee_due:{$team->id}:{$week}");
        }

        return $sent;
    }

    /**
     * @param  array<int, array<string, mixed>>  $recipients
     * @param  array<string, mixed>  $data
     */
    private function queue(
        NotificationService $notifications,
        bool $dryRun,
        string $event,
        array $recipients,
        array $data,
        ?string $organizationId,
        string $relatedType,
        string $relatedId,
        string $dedupeKey,
    ): int {
        if (! $recipients) {
            return 0;
        }

        if ($dryRun) {
            $this->line(sprintf('  %s -> %s', $event, $recipients[0]['name'] ?? 'unknown'));

            return 1;
        }

        return count($notifications->dispatch(
            $event,
            $recipients,
            $data,
            $organizationId,
            $relatedType,
            $relatedId,
            $dedupeKey,
        ));
    }

    /** `scheduled_at` is a string column, and not every row holds a valid date. */
    private function parseSchedule(?string $value): ?Carbon
    {
        if (! $value) {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    /** The platform's own currency symbol, not a hard-coded rupee. */
    private function money(float|int|string $amount): string
    {
        $symbol = PlatformSetting::query()->value('currency_symbol') ?: '₹';

        return $symbol.number_format((float) $amount, 0);
    }
}
