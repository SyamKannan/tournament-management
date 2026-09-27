<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Auction;
use App\Models\CricketMatchState;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\Organization;
use App\Models\Player;
use App\Models\RegistrationLink;
use App\Models\RegistrationPayment;
use App\Models\RegistrationReceipt;
use App\Models\Sponsor;
use App\Models\Sport;
use App\Models\Standing;
use App\Models\Subscription;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\AuctionService;
use App\Services\BillingService;
use App\Services\Notifications\Audience;
use App\Services\Notifications\NotificationService;
use App\Services\PosterService;
use App\Services\RealtimeBroadcaster;
use App\Support\Audit;
use App\Support\Cached;
use App\Support\Ids;
use App\Support\TournamentStage;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TournamentController extends Controller
{
    public function __construct(
        private readonly BillingService $billing,
        private readonly AuctionService $auctions,
        private readonly PosterService $posters,
        private readonly RealtimeBroadcaster $realtime,
        private readonly NotificationService $notifications,
    ) {}

    /**
     * Public tournament hub: fixtures with live scores, table, squads, sponsors
     * and the open registration link. No authentication.
     */
    public function publicHub(string $slug): JsonResponse
    {
        $tournament = Tournament::query()->where('slug', $slug)->first();

        // A draft isn't published — same rule as the bracket and the stats.
        if (! $tournament || $tournament->status === 'draft') {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        $scopes = [Cached::tournament($tournament->id), Cached::org($tournament->organization_id)];

        return Cached::json($scopes, 'hub', 'hub', fn () => $this->hubPayload($tournament));
    }

    /** @return array<string, mixed> */
    private function hubPayload(Tournament $tournament): array
    {
        $matches = GameMatch::query()->where('tournament_id', $tournament->id)->get();
        $link = RegistrationLink::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', 'active')
            ->first();

        return [
            'tournament' => $tournament,
            'organization' => Organization::find($tournament->organization_id),
            'teams' => $this->withoutTeamContacts(
                Team::query()->where('tournament_id', $tournament->id)->where('status', 'approved')->get()
            ),
            'matches' => $this->withMatchContext($matches),
            'standings' => Standing::query()->where('tournament_id', $tournament->id)->get(),
            // A sponsor's phone and email are the organizer's business contacts, not the public's.
            'sponsors' => Sponsor::query()->where('organization_id', $tournament->organization_id)->get()->makeHidden(['phone', 'email']),
            'announcements' => Announcement::query()
                ->where('organization_id', $tournament->organization_id)
                ->where('tournament_id', $tournament->id)
                ->orderByDesc('created_at')
                ->get(),
            'registration_link' => $link ? [
                'token' => $link->token,
                'status' => $link->status,
                'max_teams' => $link->max_teams,
                'current_registrations' => $link->current_registrations,
                'deadline' => $link->deadline,
            ] : null,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Tournament::query();

        if ($user->role === 'SUPER_ADMIN') {
            $targetOrg = $request->query('organization_id') ?? $request->query('orgId');
            if ($targetOrg) {
                $query->where('organization_id', $targetOrg);
            }
        } else {
            $query->where('organization_id', $user->organization_id);
        }

        $tournaments = $query->get();
        $organizations = Organization::query()->get()->keyBy('id');

        $teamsByTournament = Team::query()
            ->whereIn('tournament_id', $tournaments->pluck('id'))
            ->get()
            ->groupBy('tournament_id');

        $links = RegistrationLink::query()
            ->whereIn('tournament_id', $tournaments->pluck('id'))
            ->get()
            ->keyBy('tournament_id');

        $stages = TournamentStage::forMany($tournaments);

        return response()->json($tournaments->map(function (Tournament $tournament) use ($organizations, $teamsByTournament, $links, $stages) {
            $teams = $teamsByTournament->get($tournament->id) ?? collect();
            $link = $links->get($tournament->id);

            return [
                ...$tournament->toArray(),
                'organization_name' => $organizations->get($tournament->organization_id)?->name,
                'teams_count' => $teams->whereIn('status', Team::HOLDS_PLACE)->count(),
                'approved_teams_count' => $teams->where('status', 'approved')->count(),
                'registration_link_token' => $link?->token,
                'stage' => $stages[$tournament->id],
            ];
        }));
    }

    /**
     * Create a tournament, enforcing the organizer's plan limit, and open a
     * public registration link for it. Tournaments flagged `has_auction` get
     * their auction created in the same transaction.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        // The super admin runs the platform, not tournaments. Hosting one is the
        // organizer's job; to help a club, impersonate its organizer.
        if ($user->role === 'SUPER_ADMIN') {
            return response()->json(['error' => 'Super admins manage the platform and cannot host tournaments. Sign in as the club (impersonate its organizer) to create one.'], 403);
        }

        $organizationId = $request->input('organization_id') ?: $user->organization_id;

        if (! $organizationId) {
            return response()->json(['error' => 'Organization ID is required'], 400);
        }

        // With admin approval switched on, a new club waits in `pending` — it
        // can sign in, look around and pay for a plan, but not start taking
        // entries from the public until the platform has let it in. Nothing
        // enforced that before: pending changed nothing but a label.
        $orgStatus = Organization::query()->whereKey($organizationId)->value('status');

        if (in_array($orgStatus, ['pending', 'expired'], true)) {
            return response()->json([
                'error' => $orgStatus === 'pending'
                    ? 'Your organization is waiting for platform approval. You can host tournaments once it is approved.'
                    : 'Your organization’s account has expired. Renew your plan to host tournaments again.',
                'code' => 'ORGANIZATION_'.strtoupper($orgStatus),
            ], 403);
        }

        $limit = $this->billing->checkLimit($organizationId, 'tournaments');

        if (! $limit['allowed']) {
            return response()->json([
                'error' => $limit['reason'] ?? 'Tournament creation limit reached for your current subscription plan.',
                'limit' => $limit,
            ], 403);
        }

        $teamLimit = $this->billing->planLimitFor($organizationId, 'teams');

        $activeSportCodes = Sport::query()->where('is_active', true)->pluck('code')->all();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sport_code' => ['required', 'string', 'in:'.implode(',', $activeSportCodes)],
            'sport_id' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'location' => ['nullable', 'string', 'max:255'],
            'village' => ['nullable', 'string', 'max:255'],
            'panchayat' => ['nullable', 'string', 'max:255'],
            'municipality' => ['nullable', 'string', 'max:255'],
            'district' => ['nullable', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'max:255'],
            'logo' => ['nullable', 'string'],
            'banner' => ['nullable', 'string'],
            'start_date' => ['nullable', 'date'],
            // Compared only when there is a start to compare with; with none,
            // Laravel would compare against the literal text "start_date".
            'end_date' => ['nullable', 'date', ...($request->filled('start_date') ? ['after_or_equal:start_date'] : [])],
            'registration_opening' => ['nullable', 'date'],
            'registration_closing' => ['nullable', 'date'],
            'format' => ['nullable', 'string', 'in:league,knockout,group_stage,league_knockout'],
            'max_teams' => ['nullable', 'integer', 'min:2', $this->maxTeamsRule($teamLimit)],
            'ground_fee' => ['nullable', 'numeric', 'min:0'],
            'payment_config' => ['nullable', 'array'],
            'payment_config.enabled_methods' => ['nullable', 'array'],
            'payment_config.enabled_methods.*' => ['string', 'in:'.implode(',', Tournament::PAYMENT_METHODS)],
            'prize_money' => ['nullable', 'numeric', 'min:0'],
            'runner_up_prize' => ['nullable', 'numeric', 'min:0'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'whatsapp' => ['nullable', 'string', 'max:64'],
            'settings' => ['nullable', 'array'],
            ...$this->settingsRules(),
            'has_auction' => ['nullable', 'boolean'],
        ], $this->validationMessages());

        $sportCode = $data['sport_code'];
        $football = $sportCode === 'football';
        $today = now()->format('Y-m-d');
        $slug = Ids::slug($data['name']).'-'.Ids::token(4);
        $paymentConfig = $data['payment_config'] ?? [];
        // Raw input: `validated()` keeps only keys with a rule of their own, and
        // normaliseSettings() below decides what a setting may be.
        $settings = (array) $request->input('settings', []);

        [$tournament, $link] = DB::transaction(function () use ($request, $data, $organizationId, $sportCode, $football, $today, $slug, $paymentConfig, $settings, $user) {
            // Checked again under a lock on the club's subscription: two
            // "Create" taps at once both passed the check above, and the free
            // plan's one tournament became two.
            Subscription::query()->where('organization_id', $organizationId)->lockForUpdate()->first();
            $limit = $this->billing->checkLimit($organizationId, 'tournaments');

            if (! $limit['allowed']) {
                throw new HttpResponseException(response()->json([
                    'error' => $limit['reason'] ?? 'Tournament creation limit reached for your current subscription plan.',
                    'limit' => $limit,
                ], 403));
            }

            $tournament = Tournament::create([
                'id' => Ids::timestamped('tourney'),
                'organization_id' => $organizationId,
                'sport_id' => $data['sport_id'] ?? ($football ? 'sport-football' : 'sport-cricket'),
                'sport_code' => $sportCode,
                'name' => $data['name'],
                'slug' => $slug,
                'logo' => $data['logo'] ?? ($football
                    ? 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80'
                    : 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80'),
                'banner' => $data['banner'] ?? ($football
                    ? 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&auto=format&fit=crop&q=80'
                    : 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=1200&auto=format&fit=crop&q=80'),
                'description' => $data['description'] ?? '',
                'location' => $data['location'] ?? '',
                'village' => $data['village'] ?? '',
                'panchayat' => $data['panchayat'] ?? '',
                'municipality' => $data['municipality'] ?? '',
                'district' => $data['district'] ?? '',
                'state' => $data['state'] ?? 'Kerala',
                'start_date' => $data['start_date'] ?? $today,
                // A one-day event when no end is given, never an end before the start.
                'end_date' => $data['end_date'] ?? ($data['start_date'] ?? $today),
                'registration_opening' => $data['registration_opening'] ?? $today,
                // Entries close when the organizer says, else when play starts — never
                // "today", which shut registration at midnight on the day it opened.
                'registration_closing' => $data['registration_closing'] ?? ($data['start_date'] ?? ''),
                'format' => $data['format'] ?? 'league_knockout',
                'max_teams' => (int) ($data['max_teams'] ?? 8),
                'ground_fee' => (float) ($data['ground_fee'] ?? 0),
                'payment_config' => [
                    'allow_partial' => (bool) ($paymentConfig['allow_partial'] ?? true),
                    // Part payment is always half the fee; kept for older clients.
                    'min_partial_type' => 'percentage',
                    'min_partial_value' => 50,
                    'enabled_methods' => ! empty($paymentConfig['enabled_methods'])
                        ? array_values(array_intersect($paymentConfig['enabled_methods'], Tournament::PAYMENT_METHODS))
                        : Tournament::PAYMENT_METHODS,
                ],
                'prize_money' => (float) ($data['prize_money'] ?? 0),
                'runner_up_prize' => (float) ($data['runner_up_prize'] ?? 0),
                'contact_person' => $data['contact_person'] ?? $user->name,
                'phone' => $data['phone'] ?? $user->phone,
                'whatsapp' => $data['whatsapp'] ?? $data['phone'] ?? $user->phone,
                'status' => 'registration_open',
                'settings' => $this->normaliseSettings($settings, $football),
                'has_auction' => (bool) ($data['has_auction'] ?? false),
            ]);

            if ($tournament->has_auction) {
                $auction = $this->auctions->createForTournament($tournament, $request->all());

                $tournament->forceFill([
                    'auction_id' => $auction->id,
                    'auction_status' => $auction->status,
                    'auction_start_time' => $auction->auction_start_time,
                    'auction_end_time' => $auction->auction_end_time,
                ])->save();
            }

            $link = RegistrationLink::create([
                'id' => Ids::timestamped('link'),
                'tournament_id' => $tournament->id,
                'organization_id' => $organizationId,
                'token' => $tournament->slug.'-reg',
                'status' => 'active',
                'max_teams' => $tournament->max_teams,
                'current_registrations' => 0,
                'deadline' => $tournament->registration_closing ?: null,
            ]);

            Audit::log([
                'organization_id' => $organizationId,
                'user_id' => $user->id,
                'user_name' => $user->name,
                'user_role' => $user->role,
                'action' => 'CREATED_TOURNAMENT',
                'entity_type' => 'Tournament',
                'entity_id' => $tournament->id,
                'details' => sprintf(
                    'Created tournament [%s] (%s) %s',
                    $tournament->name,
                    strtoupper($tournament->sport_code),
                    $tournament->has_auction ? 'with Player Auction' : 'with Direct Team Registration'
                ),
                'ip_address' => $request->ip(),
            ]);

            return [$tournament->fresh(), $link];
        });

        return response()->json(['tournament' => $tournament, 'registration_link' => $link], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $tournament = Tournament::find($id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        return response()->json([
            'tournament' => $tournament,
            'registration_link' => RegistrationLink::query()->where('tournament_id', $tournament->id)->first(),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $tournament = Tournament::find($id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $teamLimit = $this->billing->planLimitFor($tournament->organization_id, 'teams');

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'logo' => ['sometimes', 'string'],
            'banner' => ['sometimes', 'string'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'village' => ['sometimes', 'nullable', 'string', 'max:255'],
            'panchayat' => ['sometimes', 'nullable', 'string', 'max:255'],
            'municipality' => ['sometimes', 'nullable', 'string', 'max:255'],
            'district' => ['sometimes', 'nullable', 'string', 'max:255'],
            'state' => ['sometimes', 'nullable', 'string', 'max:255'],
            'start_date' => ['sometimes', 'nullable', 'date'],
            'end_date' => ['sometimes', 'nullable', 'date'],
            'registration_opening' => ['sometimes', 'nullable', 'date'],
            'registration_closing' => ['sometimes', 'nullable', 'date'],
            'format' => ['sometimes', 'string', 'in:league,knockout,group_stage,league_knockout'],
            'max_teams' => ['sometimes', 'integer', 'min:2', $this->maxTeamsRule($teamLimit)],
            'ground_fee' => ['sometimes', 'numeric', 'min:0'],
            'payment_config' => ['sometimes', 'array'],
            'payment_config.allow_partial' => ['sometimes', 'boolean'],
            'payment_config.enabled_methods' => ['sometimes', 'array', 'min:1'],
            'payment_config.enabled_methods.*' => ['string', 'in:'.implode(',', Tournament::PAYMENT_METHODS)],
            'prize_money' => ['sometimes', 'numeric', 'min:0'],
            'runner_up_prize' => ['sometimes', 'numeric', 'min:0'],
            'contact_person' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:64'],
            'whatsapp' => ['sometimes', 'string', 'max:64'],
            // Calling a tournament off goes through cancel(): it also stops the
            // matches, closes the link and tells the teams. A bare status
            // change here did none of that.
            'status' => ['sometimes', 'string', 'in:draft,registration_open,registration_closed,upcoming,ongoing,completed'],
            'settings' => ['sometimes', 'array'],
            ...$this->settingsRules(),
        ], $this->validationMessages());

        // A cleared date keeps the one on file rather than blanking it.
        foreach (['start_date', 'end_date', 'registration_opening'] as $dateField) {
            if (array_key_exists($dateField, $data) && $data[$dateField] === null) {
                unset($data[$dateField]);
            }
        }

        $start = $data['start_date'] ?? $tournament->start_date;
        $end = $data['end_date'] ?? $tournament->end_date;

        if ($start && $end && strtotime((string) $end) < strtotime((string) $start)) {
            return response()->json([
                'error' => 'The end date cannot be before the start date.',
                'errors' => ['end_date' => ['The end date cannot be before the start date.']],
            ], 422);
        }

        // Like `settings`, one JSON column: merge the keys sent over what is
        // stored, so a partial update cannot drop the accepted methods.
        if (array_key_exists('payment_config', $data)) {
            $merged = [...($tournament->payment_config ?? []), ...$data['payment_config']];
            $merged['enabled_methods'] = array_values(array_intersect(
                (array) ($merged['enabled_methods'] ?? Tournament::PAYMENT_METHODS),
                Tournament::PAYMENT_METHODS,
            )) ?: Tournament::PAYMENT_METHODS;
            $merged['allow_partial'] = (bool) ($merged['allow_partial'] ?? true);
            $data['payment_config'] = $merged;
        }

        // `settings` is one JSON column, so assigning it replaces the lot: a PUT
        // carrying only `total_overs` used to drop the squad sizes, the half
        // length and the table points with it, and the engine then silently ran
        // on its own defaults. Merge over what is stored, then re-normalise, so
        // a partial update changes only the keys it names.
        if ($request->has('settings')) {
            $data['settings'] = $this->normaliseSettings(
                [...($tournament->settings ?? []), ...(array) $request->input('settings', [])],
                $tournament->sport_code === 'football'
            );
        }

        $tournament->fill($data)->save();

        // The link keeps its own copy of the deadline and size, and the registration
        // page reads the link first — so a changed date must reach it too.
        if ($tournament->wasChanged(['registration_closing', 'max_teams'])) {
            RegistrationLink::query()->where('tournament_id', $tournament->id)->update([
                'deadline' => $tournament->registration_closing ?: null,
                'max_teams' => $tournament->max_teams,
            ]);
        }

        $user = $request->user();
        Audit::log([
            'organization_id' => $tournament->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'UPDATED_TOURNAMENT',
            'entity_type' => 'Tournament',
            'entity_id' => $tournament->id,
            'details' => sprintf('Updated tournament [%s]', $tournament->name),
            'ip_address' => $request->ip(),
        ]);

        return response()->json($tournament);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $tournament = Tournament::find($id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        // Money taken and matches played are history someone will ask about —
        // a refund, a result. Cancelling keeps them; deleting would not.
        $collected = RegistrationPayment::query()->where('tournament_id', $tournament->id)->where('paid_amount', '>', 0)->exists();
        $played = GameMatch::query()->where('tournament_id', $tournament->id)
            ->whereNotIn('status', ['scheduled', 'cancelled'])
            ->where(fn ($q) => $q->where('result_summary', 'not like', 'Bye%')->orWhereNull('result_summary'))
            ->exists();

        if ($collected || $played) {
            return response()->json([
                'error' => $collected
                    ? 'Teams have already paid for this tournament, so it cannot be deleted. Cancel it instead — that keeps the payment records for refunds.'
                    : 'Matches in this tournament have already been played, so it cannot be deleted. Cancel it instead.',
            ], 409);
        }

        DB::transaction(function () use ($tournament) {
            // Nothing below has a foreign key to the tournament, so each goes by
            // hand; teams, matches, links and posters cascade from the delete.
            $teamIds = Team::query()->where('tournament_id', $tournament->id)->pluck('id');

            Player::query()->where('tournament_id', $tournament->id)->orWhereIn('team_id', $teamIds)->delete();
            RegistrationReceipt::query()->where('tournament_id', $tournament->id)->delete();
            RegistrationPayment::query()->where('tournament_id', $tournament->id)->delete();
            Standing::query()->where('tournament_id', $tournament->id)->delete();
            Auction::query()->where('tournament_id', $tournament->id)->delete();
            Announcement::query()->where('tournament_id', $tournament->id)->delete();

            $tournament->delete();
        });

        // The mass deletes above fire no model events.
        Cached::flush(Cached::tournament($tournament->id), Cached::org($tournament->organization_id));

        $user = $request->user();
        Audit::log([
            'organization_id' => $tournament->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'DELETED_TOURNAMENT',
            'entity_type' => 'Tournament',
            'entity_id' => $id,
            'details' => sprintf('Deleted tournament [%s]', $tournament->name),
            'ip_address' => $request->ip(),
        ]);

        return response()->json(['message' => 'Tournament deleted successfully']);
    }

    /**
     * Call off a tournament without deleting its history: the tournament and
     * every unfinished match become cancelled, and the public registration
     * link is disabled. Completed matches keep their results.
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $tournament = Tournament::find($id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($tournament->status === 'cancelled') {
            return response()->json(['error' => 'This tournament is already cancelled'], 409);
        }

        $reason = trim((string) ($data['reason'] ?? ''));
        $summary = $reason !== '' ? "Tournament cancelled: {$reason}" : 'Tournament cancelled';

        $cancelledMatches = DB::transaction(function () use ($tournament, $summary) {
            $tournament->status = 'cancelled';
            $tournament->save();

            RegistrationLink::query()->where('tournament_id', $tournament->id)->update(['status' => 'disabled']);

            $matches = GameMatch::query()
                ->where('tournament_id', $tournament->id)
                ->whereNotIn('status', ['completed', 'cancelled'])
                ->get();

            foreach ($matches as $match) {
                $match->status = 'cancelled';
                $match->result_summary = $summary;
                $match->save();
            }

            return $matches;
        });

        foreach ($cancelledMatches as $match) {
            $this->realtime->toRoom("match:{$match->id}", 'MATCH_STATUS_CHANGED', ['match' => $match]);
            $this->realtime->toRoom("scoreboard:{$match->id}", 'MATCH_STATUS_CHANGED', ['match' => $match]);
        }

        // Everyone who entered, not only the approved teams: a side still
        // waiting on a decision has usually already paid something, and this is
        // the message that matters most of any the platform sends.
        $this->notifications->dispatch(
            'tournament_cancelled',
            Audience::tournamentManagers($tournament->id, approvedOnly: false),
            [
                'tournament' => $tournament->name,
                'reason' => $reason,
                'contact' => $tournament->phone ?: (Organization::find($tournament->organization_id)?->phone ?? ''),
            ],
            $tournament->organization_id,
            'tournament',
            $tournament->id,
            "tournament_cancelled:{$tournament->id}",
        );

        $user = $request->user();
        Audit::log([
            'organization_id' => $tournament->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'CANCELLED_TOURNAMENT',
            'entity_type' => 'Tournament',
            'entity_id' => $tournament->id,
            'details' => sprintf(
                'Cancelled tournament [%s] and %d unfinished match(es)%s',
                $tournament->name,
                $cancelledMatches->count(),
                $reason !== '' ? " ({$reason})" : '',
            ),
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'tournament' => $tournament,
            'cancelled_matches_count' => $cancelledMatches->count(),
        ]);
    }

    /**
     * Turn a tournament's player auction on or off, creating it on first enable
     * and updating its settings on subsequent saves.
     */
    public function configureAuction(Request $request, string $id): JsonResponse
    {
        $tournament = Tournament::find($id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'has_auction' => ['required', 'boolean'],
            'auction_title' => ['nullable', 'string', 'max:255'],
            'auction_start_time' => ['nullable', 'string'],
            'auction_end_time' => ['nullable', 'string'],
            'auction_status' => ['nullable', 'string', 'in:draft,upcoming,registration_open,registration_closed,live,paused,completed,cancelled'],
            'team_purse' => ['nullable', 'numeric', 'min:0'],
            'min_bid_increment' => ['nullable', 'numeric', 'min:0'],
            'max_players_per_team' => ['nullable', 'integer', 'min:1'],
            'min_players_per_team' => ['nullable', 'integer', 'min:1'],
            'base_prices' => ['nullable', 'array'],
        ]);

        $auction = DB::transaction(function () use ($tournament, $data) {
            $tournament->has_auction = (bool) $data['has_auction'];

            $auction = Auction::query()
                ->where('tournament_id', $tournament->id)
                ->orWhere('id', $tournament->auction_id)
                ->first();

            if (! $tournament->has_auction) {
                $tournament->auction_status = null;
                $tournament->save();

                return $auction;
            }

            if (! $auction) {
                $auction = $this->auctions->createForTournament($tournament, $data);
            } else {
                $auction->fill(array_filter([
                    'title' => $data['auction_title'] ?? null,
                    'status' => $data['auction_status'] ?? null,
                    'team_purse' => $data['team_purse'] ?? null,
                    'min_bid_increment' => $data['min_bid_increment'] ?? null,
                    'max_players_per_team' => $data['max_players_per_team'] ?? null,
                    'min_players_per_team' => $data['min_players_per_team'] ?? null,
                ], fn ($value) => $value !== null));

                if (! empty($data['auction_start_time'])) {
                    $auction->auction_start_time = $data['auction_start_time'];
                    $auction->auction_date = $data['auction_start_time'];
                }

                if (array_key_exists('auction_end_time', $data)) {
                    $auction->auction_end_time = $data['auction_end_time'];
                }

                if (! empty($data['base_prices'])) {
                    $auction->base_prices = $data['base_prices'];
                }

                $auction->save();
            }

            $tournament->forceFill([
                'auction_id' => $auction->id,
                'auction_status' => $auction->status,
                'auction_start_time' => $auction->auction_start_time,
                'auction_end_time' => $auction->auction_end_time,
            ])->save();

            return $auction;
        });

        return response()->json(['tournament' => $tournament->fresh(), 'auction' => $auction?->fresh()]);
    }

    /**
     * Regenerate or enable/disable the tournament's public registration link.
     */
    public function registrationLink(Request $request, string $id): JsonResponse
    {
        $tournament = Tournament::find($id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'action' => ['nullable', 'string', 'in:regenerate'],
            'status' => ['nullable', 'string', 'in:active,disabled,expired'],
            // It goes into a URL path and must name one tournament only.
            'customToken' => ['nullable', 'string', 'min:4', 'max:120', 'regex:/^[A-Za-z0-9][A-Za-z0-9_-]*$/'],
        ], [
            'customToken.regex' => 'Use only letters, numbers, dashes and underscores in the link name.',
        ]);

        $link = RegistrationLink::query()->where('tournament_id', $tournament->id)->first();

        if (($data['action'] ?? null) === 'regenerate') {
            $token = $data['customToken'] ?? $tournament->slug.'-reg-'.Ids::token(4);

            // Another tournament's link with the same name would send its teams here.
            if (RegistrationLink::query()->where('token', $token)->where('tournament_id', '!=', $tournament->id)->exists()) {
                return response()->json([
                    'error' => 'That link name is already in use. Choose another one.',
                    'errors' => ['customToken' => ['That link name is already in use.']],
                ], 422);
            }

            if ($link) {
                $link->token = $token;
                $link->status = 'active';
                $link->save();
            } else {
                $link = RegistrationLink::create([
                    'id' => Ids::timestamped('link'),
                    'tournament_id' => $tournament->id,
                    'organization_id' => $tournament->organization_id,
                    'token' => $token,
                    'status' => 'active',
                    'max_teams' => $tournament->max_teams,
                    'current_registrations' => Team::query()->where('tournament_id', $tournament->id)->holdingPlace()->count(),
                    'deadline' => $tournament->registration_closing ?: null,
                ]);
            }
        } elseif ($link && ! empty($data['status'])) {
            $link->status = $data['status'];
            $link->save();
        }

        return response()->json($link);
    }

    /**
     * Generate (or regenerate) a shareable poster for the tournament, laying
     * out the organization's logo/name and the tournament's own details onto
     * a template picked by sport. Saved on the tournament so it survives
     * without regenerating on every page view.
     */
    public function generatePoster(Request $request, string $id): JsonResponse
    {
        $tournament = Tournament::find($id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'template' => ['nullable', 'string', 'in:auto,'.implode(',', PosterService::TEMPLATES)],
            // The design already on screen ("split:ember"), so a regenerate
            // draws something the organizer can actually see is different.
            'avoid' => ['nullable', 'string', 'max:40'],
        ]);
        $useAi = $request->boolean('use_ai', true);

        // Headless Chrome plus a high-quality image model can take well over the default 30s.
        set_time_limit(240);

        $organization = Organization::find($tournament->organization_id);
        $result = $this->posters->generate(
            $tournament,
            $organization,
            $useAi,
            $request->headers->get('origin'),
            $data['template'] ?? null,
            $data['avoid'] ?? null,
        );

        $tournament->poster = $result['url'];
        $tournament->save();

        $user = $request->user();
        Audit::log([
            'organization_id' => $tournament->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'GENERATED_POSTER',
            'entity_type' => 'Tournament',
            'entity_id' => $tournament->id,
            'details' => sprintf(
                'Generated poster for tournament [%s]%s',
                $tournament->name,
                $result['used_ai'] ? ' with custom artwork' : ''
            ),
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'tournament' => $tournament,
            'poster' => $result['url'],
            'used_ai' => $result['used_ai'],
            'template' => $result['template'],
            'design' => $result['design'],
        ]);
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * Rejects a `max_teams` value above the organizer's plan cap. `$teamLimit`
     * is null when there is no active subscription, in which case this is a
     * no-op — `checkLimit('tournaments')` already blocks creation in that case.
     */
    private function maxTeamsRule(?int $teamLimit): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($teamLimit) {
            if ($teamLimit !== null && (int) $value > $teamLimit) {
                $fail("Max teams cannot exceed your plan's team limit ({$teamLimit}).");
            }
        };
    }

    /**
     * Sport-aware squad and format defaults, so a tournament created with a bare
     * payload is still fully playable.
     *
     * This is the whole of a tournament's settings: keys missing from here are
     * dropped, so anything the scoring engine reads has to be listed. The table
     * points are sport-aware — 3/1/0 is football, cricket runs 2 for a win and
     * 1 for a tie or no result.
     */
    /**
     * The settings the engine reads, each in a range a match can be played
     * with: zero overs or a one-player side made a match that could never
     * start or never end.
     *
     * @return array<string, array<int, string>>
     */
    private function settingsRules(): array
    {
        return [
            'settings.squad_min_players' => ['sometimes', 'nullable', 'integer', 'min:2', 'max:30'],
            'settings.squad_max_players' => ['sometimes', 'nullable', 'integer', 'min:2', 'max:40'],
            'settings.max_substitutes' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:20'],
            'settings.match_duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:240'],
            'settings.half_duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:120'],
            'settings.extra_time_minutes' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:60'],
            'settings.total_overs' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:50'],
            'settings.powerplay_overs' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:50'],
            'settings.max_overs_per_bowler' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:50'],
            'settings.playing_xi_count' => ['sometimes', 'nullable', 'integer', 'min:2', 'max:11'],
            'settings.points_win' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10'],
            'settings.points_draw' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10'],
            'settings.points_loss' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10'],
            'settings.google_maps_url' => ['sometimes', 'nullable', 'string', 'max:1000', 'regex:#^https?://#i'],
            'settings.latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'settings.longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
        ];
    }

    /** @return array<string, string> */
    private function validationMessages(): array
    {
        return [
            'end_date.after_or_equal' => 'The end date cannot be before the start date.',
            'settings.total_overs.min' => 'An innings needs at least one over.',
            'settings.google_maps_url.regex' => 'The map link must start with https://.',
        ];
    }

    private function normaliseSettings(array $settings, bool $football): array
    {
        return [
            'squad_min_players' => (int) ($settings['squad_min_players'] ?? ($football ? 7 : 11)),
            'squad_max_players' => (int) ($settings['squad_max_players'] ?? ($football ? 14 : 16)),
            'max_substitutes' => (int) ($settings['max_substitutes'] ?? 5),
            'require_detailed_positions' => ($settings['require_detailed_positions'] ?? true) !== false,
            'football_format' => $settings['football_format'] ?? '7-a-side',
            'match_duration_minutes' => (int) ($settings['match_duration_minutes'] ?? 60),
            'half_duration_minutes' => (int) ($settings['half_duration_minutes'] ?? 30),
            'extra_time_minutes' => (int) ($settings['extra_time_minutes'] ?? 10),
            'enable_penalty_shootout' => ($settings['enable_penalty_shootout'] ?? true) !== false,
            'cricket_format' => $settings['cricket_format'] ?? 'T20',
            'total_overs' => (int) ($settings['total_overs'] ?? 20),
            'powerplay_overs' => (int) ($settings['powerplay_overs'] ?? 6),
            'max_overs_per_bowler' => (int) ($settings['max_overs_per_bowler'] ?? 4),
            'enable_super_over' => ($settings['enable_super_over'] ?? true) !== false,
            'playing_xi_count' => (int) ($settings['playing_xi_count'] ?? 11),
            'points_win' => (int) ($settings['points_win'] ?? ($football ? 3 : 2)),
            'points_draw' => (int) ($settings['points_draw'] ?? 1),
            'points_loss' => (int) ($settings['points_loss'] ?? 0),
            'venue_name' => $settings['venue_name'] ?? '',
            'venue_address' => $settings['venue_address'] ?? '',
            'google_maps_url' => $settings['google_maps_url'] ?? '',
            'latitude' => isset($settings['latitude']) ? (float) $settings['latitude'] : null,
            'longitude' => isset($settings['longitude']) ? (float) $settings['longitude'] : null,
            // First kick-off on the start day, "HH:MM"; the fixture builder starts from it.
            'start_time' => preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) ($settings['start_time'] ?? '')) ? $settings['start_time'] : '',
        ];
    }

    /**
     * Attach teams, venue and live state to each fixture.
     *
     * @param  \Illuminate\Support\Collection<int, GameMatch>  $matches
     */
    private function withMatchContext($matches): array
    {
        $teams = Team::query()->whereIn('id', $matches->pluck('team_a_id')->merge($matches->pluck('team_b_id')))->get()->keyBy('id');
        $venues = Venue::query()->whereIn('id', $matches->pluck('venue_id')->filter())->get()->keyBy('id');
        $footballStates = FootballMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id');
        $cricketStates = CricketMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id');

        return $matches->map(fn (GameMatch $match) => [
            ...$match->toArray(),
            'team_a' => $this->withoutTeamContacts($teams->get($match->team_a_id)),
            'team_b' => $this->withoutTeamContacts($teams->get($match->team_b_id)),
            'venue' => $match->venue_id ? $venues->get($match->venue_id) : null,
            'football_state' => $match->sport_code === 'football' ? $footballStates->get($match->id) : null,
            'cricket_state' => $match->sport_code === 'cricket' ? $cricketStates->get($match->id) : null,
        ])->values()->all();
    }
}
