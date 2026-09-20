<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\PlatformSetting;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\Notifications\Audience;
use App\Services\Notifications\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Ends subscriptions that have run out, and warns the organizers whose are about
 * to.
 *
 * Subscriptions carried `end_date`, `next_billing_date` and `auto_renew`, and
 * `platform_settings` carried `grace_period_days`, and nothing ever read any of
 * them: `BillingService::activeSubscription()` asks only whether the status says
 * `active`, so a plan that expired last year still let an organizer host
 * tournaments. This is what makes the dates mean something.
 *
 * The grace period is honoured rather than cutting off on the stroke of the end
 * date — a village club paying by UPI on a Monday should not lose its tournament
 * over a weekend.
 */
class SweepSubscriptions extends Command
{
    protected $signature = 'subscriptions:sweep
                            {--dry-run : Report what would change without writing anything}';

    protected $description = 'Expire lapsed subscriptions and warn organizers whose plans are about to end';

    public function handle(NotificationService $notifications): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $graceDays = (int) (PlatformSetting::query()->value('grace_period_days') ?? 0);
        $today = now()->startOfDay();

        $expired = 0;
        $warned = 0;

        $subscriptions = Subscription::query()->where('status', 'active')->get();
        $plans = Plan::query()->get()->keyBy('id');
        $organizations = Organization::query()
            ->whereIn('id', $subscriptions->pluck('organization_id'))
            ->get()
            ->keyBy('id');

        foreach ($subscriptions as $subscription) {
            $endsOn = $this->parseDate($subscription->end_date);

            if (! $endsOn) {
                continue;
            }

            $plan = $plans->get($subscription->plan_id);
            $organization = $organizations->get($subscription->organization_id);
            $lastDay = $endsOn->copy()->addDays($graceDays);
            // Carbon returns a float here, and the thresholds below are compared
            // strictly — 3.0 is not 3, and the warning would never fire.
            $daysLeft = (int) $today->diffInDays($endsOn, false);

            if ($today->greaterThan($lastDay)) {
                $expired++;

                if ($dryRun) {
                    $this->line(sprintf('  expire: %s (ended %s)', $organization?->name ?? $subscription->organization_id, $subscription->end_date));

                    continue;
                }

                $subscription->status = 'expired';
                $subscription->auto_renew = false;
                $subscription->save();

                if ($organization) {
                    $notifications->dispatch(
                        'subscription_expired',
                        Audience::organizers($organization->id),
                        ['plan' => $plan?->name ?? 'subscription', 'end_date' => $endsOn->format('j M Y')],
                        $organization->id,
                        'subscription',
                        $subscription->id,
                        // One notice per subscription, ever — the sweep runs
                        // daily and this is not news twice.
                        "subscription_expired:{$subscription->id}",
                    );
                }

                continue;
            }

            // Warn on the configured days out, and only on those days: the key
            // carries the threshold, so a daily sweep sends three warnings over
            // a week rather than seven.
            foreach ((array) config('notifications.subscription_warning_days', []) as $threshold) {
                if ($daysLeft !== (int) $threshold || ! $organization) {
                    continue;
                }

                $warned++;

                if ($dryRun) {
                    $this->line(sprintf('  warn: %s (%d days left)', $organization->name, $daysLeft));

                    continue;
                }

                $notifications->dispatch(
                    'subscription_expiring',
                    Audience::organizers($organization->id),
                    [
                        'plan' => $plan?->name ?? 'subscription',
                        'end_date' => $endsOn->format('j M Y'),
                        'days_left' => (string) $daysLeft,
                    ],
                    $organization->id,
                    'subscription',
                    $subscription->id,
                    "subscription_expiring:{$subscription->id}:{$threshold}",
                );
            }
        }

        $this->info(sprintf(
            '%s%d subscription(s) expired, %d organizer(s) warned.',
            $dryRun ? '[dry run] ' : '',
            $expired,
            $warned
        ));

        return self::SUCCESS;
    }

    /** `end_date` is a string column and may hold anything, or nothing. */
    private function parseDate(?string $value): ?Carbon
    {
        if (! $value) {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
