<?php

namespace App\Services;

use App\Models\Advertisement;
use App\Models\GameMatch;
use App\Models\Invoice;
use App\Models\Organization;
use App\Models\Plan;
use App\Models\Player;
use App\Models\Subscription;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Upload;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Support\Facades\DB;

/**
 * Subscription lifecycle: plan limits, feature gating, usage reporting,
 * plan changes with invoicing, and platform-wide revenue metrics.
 */
class BillingService
{
    public const FREE_PLAN_ID = 'plan-free';

    /**
     * Whether an organization may create one more of a metered resource.
     *
     * @return array{allowed: bool, reason?: string, current: int, max: int}
     */
    public function checkLimit(string $organizationId, string $resource): array
    {
        $subscription = $this->activeSubscription($organizationId);

        if (! $subscription) {
            return [
                'allowed' => false,
                'reason' => 'No active subscription found. Please subscribe to a plan.',
                'current' => 0,
                'max' => 0,
            ];
        }

        $plan = Plan::find($subscription->plan_id);

        if (! $plan) {
            return ['allowed' => false, 'reason' => 'Plan not found.', 'current' => 0, 'max' => 0];
        }

        $counts = $this->meteredCounts($organizationId, $subscription, $plan);

        [$current, $max, $label] = match ($resource) {
            'tournaments' => [
                $counts['tournaments'],
                $plan->tournament_limit,
                $plan->id === self::FREE_PLAN_ID
                    ? 'Tournament limit reached (%d/%d): the free plan covers one tournament. Choose a paid plan to host more.'
                    : 'Tournament limit reached for this billing period (%d/%d). Upgrade your plan to host more.',
            ],
            'teams' => [
                $counts['teams'],
                $plan->team_limit,
                'Team limit reached (%d/%d). Upgrade your plan.',
            ],
            'players' => [
                $counts['players'],
                $plan->player_limit,
                'Player limit reached for this billing period (%d/%d). Upgrade your plan.',
            ],
            'ads' => [
                Advertisement::query()->where('organization_id', $organizationId)->count(),
                $plan->ad_limit,
                'Advertisement limit reached (%d/%d). Upgrade your plan.',
            ],
            // Measured in whole megabytes, which is the unit the plan sells it
            // in and the only one worth showing an organizer.
            'storage' => [
                $this->storageUsedMb($organizationId),
                $plan->storage_limit_mb,
                'Storage limit reached (%d/%d MB). Delete some images or upgrade your plan.',
            ],
            default => [0, 999, ''],
        };

        $allowed = $current < $max;

        return array_filter([
            'allowed' => $allowed,
            'reason' => $allowed || $label === '' ? null : sprintf($label, $current, $max),
            'current' => $current,
            'max' => $max,
        ], fn ($value) => $value !== null);
    }

    /**
     * The organization's current plan cap for a metered resource, or null when
     * there is no active subscription (unlimited/ungated in that case).
     */
    public function planLimitFor(string $organizationId, string $resource): ?int
    {
        $subscription = $this->activeSubscription($organizationId);
        $plan = $subscription ? Plan::find($subscription->plan_id) : null;

        if (! $plan) {
            return null;
        }

        return match ($resource) {
            'tournaments' => $plan->tournament_limit,
            'teams' => $plan->team_limit,
            'players' => $plan->player_limit,
            'ads' => $plan->ad_limit,
            'storage' => $plan->storage_limit_mb,
            default => null,
        };
    }

    /** How much of a metered plan limit is in use — the count checkLimit() compares. */
    public function usedFor(string $organizationId, string $resource): int
    {
        $subscription = $this->activeSubscription($organizationId);
        $plan = $subscription ? Plan::find($subscription->plan_id) : null;

        return (int) ($this->meteredCounts($organizationId, $subscription, $plan)[$resource] ?? 0);
    }

    public function hasFeature(string $organizationId, string $feature): bool
    {
        $subscription = $this->activeSubscription($organizationId);

        if (! $subscription) {
            return false;
        }

        $plan = Plan::find($subscription->plan_id);

        return $plan !== null && in_array($feature, $plan->features ?? [], true);
    }

    /**
     * Current consumption of every metered resource, as percentages of the plan.
     */
    public function usage(string $organizationId): array
    {
        $subscription = Subscription::query()->where('organization_id', $organizationId)->first();
        $plan = $subscription ? Plan::find($subscription->plan_id) : null;

        $counts = [
            ...$this->meteredCounts($organizationId, $subscription, $plan),
            'ads' => Advertisement::query()->where('organization_id', $organizationId)->count(),
            'storage' => $this->storageUsedMb($organizationId),
        ];

        $limits = [
            'tournaments' => $plan->tournament_limit ?? 1,
            'teams' => $plan->team_limit ?? 16,
            'players' => $plan->player_limit ?? 250,
            'ads' => $plan->ad_limit ?? 5,
            'storage' => $plan->storage_limit_mb ?? 1024,
        ];

        $usage = [];
        foreach ($counts as $key => $current) {
            $max = max(1, (int) $limits[$key]);
            $usage[$key] = [
                'current' => $current,
                'max' => (int) $limits[$key],
                'percentage' => min(100, (int) round(($current / $max) * 100)),
            ];
        }

        return [
            'subscription' => $subscription,
            'plan' => $plan,
            'usage' => $usage,
            'free_plan_used' => $this->freePlanUsed($organizationId),
        ];
    }

    /**
     * Start or change an organization's plan and raise the matching invoice.
     *
     * @param  string|null  $verifiedTransactionReference  A gateway-verified payment
     *                                                      reference (e.g. a Razorpay
     *                                                      payment id). When omitted, a
     *                                                      reference is fabricated —
     *                                                      today's simulated behavior,
     *                                                      used for free plans and while
     *                                                      no payment gateway is configured.
     * @return array{subscription: Subscription, invoice: Invoice}
     *
     * @throws \RuntimeException when the plan or organization does not exist
     */
    public function subscribePlan(string $organizationId, string $planId, string $paymentMethod = 'upi', ?string $verifiedTransactionReference = null): array
    {
        $plan = Plan::find($planId);
        $organization = Organization::find($organizationId);

        if (! $plan || ! $organization) {
            throw new \RuntimeException('Plan or Organization not found');
        }

        return DB::transaction(function () use ($plan, $organization, $organizationId, $paymentMethod, $verifiedTransactionReference) {
            $isRecurring = $plan->billing_type === 'recurring';
            $durationDays = $this->periodDays($plan);

            $now = now();
            $subscription = Subscription::query()->where('organization_id', $organizationId)->lockForUpdate()->first();

            // Renewing the plan a club is already on, before it runs out, adds a
            // period after the one paid for — the days left are theirs. A change
            // of plan starts the new plan today.
            $periodFrom = $now->copy();
            $renewing = $subscription
                && $subscription->status === 'active'
                && $subscription->plan_id === $plan->id
                && ($currentEnd = $this->periodEnd($subscription))
                && $currentEnd->isFuture();

            if ($renewing) {
                $periodFrom = $currentEnd->copy();
            }

            $endDate = $periodFrom->copy()->addDays($durationDays)->format('Y-m-d\TH:i:s.v\Z');
            // A renewal keeps its period start, so what the period's limits
            // count (meteredCounts) doesn't reset mid-period.
            $startDate = $renewing ? $subscription->start_date : $now->format('Y-m-d\TH:i:s.v\Z');

            $attributes = [
                'plan_id' => $plan->id,
                'status' => 'active',
                'start_date' => $startDate,
                'end_date' => $endDate,
                'next_billing_date' => $isRecurring ? $endDate : null,
                'auto_renew' => $isRecurring,
                'amount_paid' => $plan->price,
            ];

            if ($subscription) {
                $subscription->fill($attributes)->save();
            } else {
                $subscription = Subscription::create([
                    'id' => Ids::timestamped('sub'),
                    'organization_id' => $organizationId,
                    'currency' => $plan->currency,
                    ...$attributes,
                ]);
            }

            $invoice = Invoice::create([
                'id' => Ids::timestamped('inv'),
                'organization_id' => $organizationId,
                'subscription_id' => $subscription->id,
                'invoice_number' => 'INV-'.$now->year.'-'.random_int(1000, 9999),
                'amount' => $plan->price,
                'currency' => $plan->currency,
                'status' => 'paid',
                'payment_method' => $paymentMethod,
                'transaction_reference' => $verifiedTransactionReference ?? 'TXN-'.strtoupper(Ids::token(8)),
                'billing_name' => $organization->name,
                'billing_email' => $organization->email,
                'billing_address' => "{$organization->address}, {$organization->district}, {$organization->state}",
            ]);

            if ($organization->status === 'pending') {
                $organization->status = 'active';
                $organization->save();
            }

            Audit::log([
                'organization_id' => $organizationId,
                'user_id' => 'system',
                'user_name' => 'Platform Billing System',
                'user_role' => 'SUPER_ADMIN',
                'action' => 'SUBSCRIBED_PLAN',
                'entity_type' => 'Subscription',
                'entity_id' => $subscription->id,
                'details' => sprintf(
                    'Organization subscribed to [%s] (%s%s) via %s',
                    $plan->name,
                    $plan->currency,
                    $this->money($plan->price),
                    strtoupper($paymentMethod)
                ),
            ]);

            return ['subscription' => $subscription->fresh(), 'invoice' => $invoice];
        });
    }

    /**
     * Put a newly signed-up organization on the Free plan, so it can host its
     * first tournament without buying anything.
     *
     * Unlike subscribePlan() this raises no ₹0 invoice and leaves the
     * organization's status alone — a club awaiting admin approval stays
     * pending. The end date is left blank: the plan is free forever, and the
     * subscriptions:sweep skips a subscription with no end date.
     */
    public function startFreePlan(string $organizationId): ?Subscription
    {
        $plan = Plan::query()->where('id', self::FREE_PLAN_ID)->where('status', 'active')->first();

        if (! $plan || Subscription::query()->where('organization_id', $organizationId)->exists()) {
            return null;
        }

        return Subscription::create([
            'id' => Ids::timestamped('sub'),
            'organization_id' => $organizationId,
            'plan_id' => $plan->id,
            'status' => 'active',
            'start_date' => now()->format('Y-m-d\TH:i:s.v\Z'),
            'end_date' => '',
            'next_billing_date' => null,
            'auto_renew' => false,
            'amount_paid' => 0,
            'currency' => $plan->currency,
        ]);
    }

    /**
     * A free plan pays for a club's first tournament only. Once the club has
     * created one — cancelled ones included, or cancelling would hand the
     * free plan back — no free plan is on offer to it again.
     */
    public function freePlanUsed(string $organizationId): bool
    {
        return Tournament::query()->where('organization_id', $organizationId)->exists();
    }

    /**
     * Platform-wide revenue and activity snapshot for the super admin dashboard.
     */
    public function platformMetrics(): array
    {
        $organizationCounts = Organization::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $subscriptionCounts = Subscription::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $plans = Plan::query()->get()->keyBy('id');

        $monthlyRecurring = 0.0;
        $oneTimeRevenue = 0.0;

        foreach (Subscription::query()->where('status', 'active')->get() as $subscription) {
            $plan = $plans->get($subscription->plan_id);
            if (! $plan) {
                continue;
            }

            if ($plan->billing_type !== 'recurring') {
                $oneTimeRevenue += $plan->price;

                continue;
            }

            $monthlyRecurring += match ($plan->billing_interval) {
                'monthly' => $plan->price,
                'quarterly' => $plan->price / 3,
                'yearly' => $plan->price / 12,
                default => 0,
            };
        }

        return [
            'organizations' => [
                'total' => Organization::query()->count(),
                'active' => (int) ($organizationCounts['active'] ?? 0),
                'pending' => (int) ($organizationCounts['pending'] ?? 0),
                'suspended' => (int) ($organizationCounts['suspended'] ?? 0),
            ],
            'subscriptions' => [
                'active' => (int) ($subscriptionCounts['active'] ?? 0),
                'expired' => (int) ($subscriptionCounts['expired'] ?? 0),
                'cancelled' => (int) ($subscriptionCounts['cancelled'] ?? 0),
            ],
            'revenue' => [
                'mrr' => (int) round($monthlyRecurring),
                'arr' => (int) round($monthlyRecurring * 12),
                'oneTimeRevenue' => $this->money($oneTimeRevenue),
                'totalPlatformRevenue' => $this->money(
                    (float) Invoice::query()->where('status', 'paid')->sum('amount')
                ),
            ],
            'activity' => [
                'totalTournaments' => Tournament::query()->count(),
                'totalTeams' => Team::query()->count(),
                'totalPlayers' => Player::query()->count(),
                'liveMatches' => GameMatch::query()->where('status', 'in_progress')->count(),
            ],
        ];
    }

    /**
     * How much an organizer is storing, in whole megabytes.
     *
     * Only their own uploads count. Public registration uploads — a team's crest
     * or a player's photo, sent before anyone signed in — carry no organization
     * and belong to nobody's quota.
     */
    private function storageUsedMb(string $organizationId): int
    {
        $bytes = (int) Upload::query()->where('organization_id', $organizationId)->sum('bytes');

        return (int) floor($bytes / 1048576);
    }

    /**
     * What counts against a plan's tournament, team and player limits.
     *
     * A paid plan's limits are per billing period: the tournaments created
     * since it (re)started, not every tournament the club has ever run — that
     * used to lock out clubs with a few seasons behind them for good. The free
     * plan is one tournament for the life of the club, cancelled ones
     * included, so cancelling cannot hand its slot back.
     *
     * `teams` is the largest field among those tournaments, because the plan's
     * team limit caps each tournament's size (TournamentController::maxTeamsRule).
     *
     * @return array{tournaments: int, teams: int, players: int}
     */
    private function meteredCounts(string $organizationId, ?Subscription $subscription, ?Plan $plan): array
    {
        $query = Tournament::query()->where('organization_id', $organizationId);

        if ($plan?->id !== self::FREE_PLAN_ID) {
            $query->where('status', '!=', 'cancelled');

            if ($since = $this->periodStart($subscription, $plan)) {
                $query->where('created_at', '>=', $since);
            }
        }

        $tournamentIds = $query->pluck('id');

        $largestField = $tournamentIds->isEmpty() ? 0 : (int) Team::query()
            ->whereIn('tournament_id', $tournamentIds)
            ->holdingPlace()
            ->selectRaw('tournament_id, COUNT(*) as total')
            ->groupBy('tournament_id')
            ->pluck('total')
            ->max();

        return [
            'tournaments' => $tournamentIds->count(),
            'teams' => $largestField,
            'players' => $tournamentIds->isEmpty() ? 0 : Player::query()->whereIn('tournament_id', $tournamentIds)->count(),
        ];
    }

    private function periodEnd(Subscription $subscription): ?\Illuminate\Support\Carbon
    {
        if (! $subscription->end_date) {
            return null;
        }

        try {
            return \Illuminate\Support\Carbon::parse($subscription->end_date);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * When the period being metered began. A club that renews early has a
     * paid-up end date a period or more ahead; the period running today is the
     * one that ends at the first period boundary after now.
     */
    private function periodStart(?Subscription $subscription, ?Plan $plan = null): ?\Illuminate\Support\Carbon
    {
        if (! $subscription || ! $subscription->start_date) {
            return null;
        }

        try {
            $started = \Illuminate\Support\Carbon::parse($subscription->start_date);
        } catch (\Throwable) {
            return null;
        }

        $end = $this->periodEnd($subscription);

        if (! $end || ! $plan) {
            return $started;
        }

        $days = $this->periodDays($plan);
        $start = $end->copy()->subDays($days);

        while ($start->isFuture()) {
            $start->subDays($days);
        }

        return $start->greaterThan($started) ? $start : $started;
    }

    private function periodDays(Plan $plan): int
    {
        return match ($plan->billing_interval) {
            'yearly' => 365,
            'quarterly' => 90,
            default => 30,
        };
    }

    private function activeSubscription(string $organizationId): ?Subscription
    {
        return Subscription::query()
            ->where('organization_id', $organizationId)
            ->where('status', 'active')
            ->first();
    }

    /**
     * Money is stored as a decimal; emit whole rupees as integers so the
     * front-end formats them the way it always has.
     */
    private function money(float $amount): int|float
    {
        return fmod($amount, 1.0) === 0.0 ? (int) $amount : round($amount, 2);
    }
}
