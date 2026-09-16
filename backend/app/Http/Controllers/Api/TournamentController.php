<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Auction;
use App\Models\CricketMatchState;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\Organization;
use App\Models\RegistrationLink;
use App\Models\Sponsor;
use App\Models\Sport;
use App\Models\Standing;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\AuctionService;
use App\Services\BillingService;
use App\Services\PosterService;
use App\Services\RealtimeBroadcaster;
use App\Support\Audit;
use App\Support\Ids;
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
    ) {}

    /**
     * Public tournament hub: fixtures with live scores, table, squads, sponsors
     * and the open registration link. No authentication.
     */
    public function publicHub(string $slug): JsonResponse
    {
        $tournament = Tournament::query()->where('slug', $slug)->first();

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        $matches = GameMatch::query()->where('tournament_id', $tournament->id)->get();
        $link = RegistrationLink::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', 'active')
            ->first();

        return response()->json([
            'tournament' => $tournament,
            'organization' => Organization::find($tournament->organization_id),
            'teams' => Team::query()->where('tournament_id', $tournament->id)->where('status', 'approved')->get(),
            'matches' => $this->withMatchContext($matches),
            'standings' => Standing::query()->where('tournament_id', $tournament->id)->get(),
            'sponsors' => Sponsor::query()->where('organization_id', $tournament->organization_id)->get(),
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
        ]);
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

        return response()->json($tournaments->map(function (Tournament $tournament) use ($organizations, $teamsByTournament, $links) {
            $teams = $teamsByTournament->get($tournament->id) ?? collect();

            return [
                ...$tournament->toArray(),
                'organization_name' => $organizations->get($tournament->organization_id)?->name,
                'teams_count' => $teams->count(),
                'approved_teams_count' => $teams->where('status', 'approved')->count(),
                'registration_link_token' => $links->get($tournament->id)?->token,
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
        $organizationId = $request->input('organization_id') ?: $user->organization_id;

        if (! $organizationId) {
            return response()->json(['error' => 'Organization ID is required'], 400);
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
            'start_date' => ['nullable', 'string'],
            'end_date' => ['nullable', 'string'],
            'registration_opening' => ['nullable', 'string'],
            'registration_closing' => ['nullable', 'string'],
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
            'has_auction' => ['nullable', 'boolean'],
        ]);

        $sportCode = $data['sport_code'];
        $football = $sportCode === 'football';
        $today = now()->format('Y-m-d');
        $slug = Ids::slug($data['name']).'-'.Ids::token(4);
        $paymentConfig = $data['payment_config'] ?? [];
        $settings = $data['settings'] ?? [];

        [$tournament, $link] = DB::transaction(function () use ($request, $data, $organizationId, $sportCode, $football, $today, $slug, $paymentConfig, $settings, $user) {
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
                'end_date' => $data['end_date'] ?? $today,
                'registration_opening' => $data['registration_opening'] ?? $today,
                'registration_closing' => $data['registration_closing'] ?? $today,
                'format' => $data['format'] ?? 'league_knockout',
                'max_teams' => (int) ($data['max_teams'] ?? 8),
                'ground_fee' => (float) ($data['ground_fee'] ?? 0),
                'payment_config' => [
                    'allow_partial' => (bool) ($paymentConfig['allow_partial'] ?? true),
                    'min_partial_type' => $paymentConfig['min_partial_type'] ?? 'percentage',
                    'min_partial_value' => (float) ($paymentConfig['min_partial_value'] ?? 50),
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
                'deadline' => $tournament->registration_closing,
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
            'start_date' => ['sometimes', 'string'],
            'end_date' => ['sometimes', 'string'],
            'registration_opening' => ['sometimes', 'string'],
            'registration_closing' => ['sometimes', 'string'],
            'format' => ['sometimes', 'string', 'in:league,knockout,group_stage,league_knockout'],
            'max_teams' => ['sometimes', 'integer', 'min:2', $this->maxTeamsRule($teamLimit)],
            'ground_fee' => ['sometimes', 'numeric', 'min:0'],
            'payment_config' => ['sometimes', 'array'],
            'prize_money' => ['sometimes', 'numeric', 'min:0'],
            'runner_up_prize' => ['sometimes', 'numeric', 'min:0'],
            'contact_person' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:64'],
            'whatsapp' => ['sometimes', 'string', 'max:64'],
            'status' => ['sometimes', 'string', 'in:draft,registration_open,registration_closed,upcoming,ongoing,completed,cancelled'],
            'settings' => ['sometimes', 'array'],
        ]);

        $tournament->fill($data)->save();

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

        $tournament->delete();

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
            'customToken' => ['nullable', 'string', 'max:255'],
        ]);

        $link = RegistrationLink::query()->where('tournament_id', $tournament->id)->first();

        if (($data['action'] ?? null) === 'regenerate') {
            $token = $data['customToken'] ?? $tournament->slug.'-reg-'.Ids::token(4);

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
                    'current_registrations' => Team::query()->where('tournament_id', $tournament->id)->count(),
                    'deadline' => $tournament->registration_closing,
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

        $useAi = $request->boolean('use_ai', true);

        $organization = Organization::find($tournament->organization_id);
        $result = $this->posters->generate($tournament, $organization, $useAi);

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
     */
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
            'venue_name' => $settings['venue_name'] ?? '',
            'venue_address' => $settings['venue_address'] ?? '',
            'google_maps_url' => $settings['google_maps_url'] ?? '',
            'latitude' => isset($settings['latitude']) ? (float) $settings['latitude'] : null,
            'longitude' => isset($settings['longitude']) ? (float) $settings['longitude'] : null,
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
            'team_a' => $teams->get($match->team_a_id),
            'team_b' => $teams->get($match->team_b_id),
            'venue' => $match->venue_id ? $venues->get($match->venue_id) : null,
            'football_state' => $match->sport_code === 'football' ? $footballStates->get($match->id) : null,
            'cricket_state' => $match->sport_code === 'cricket' ? $cricketStates->get($match->id) : null,
        ])->values()->all();
    }
}
