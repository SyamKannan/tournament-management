<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Advertisement;
use App\Models\Announcement;
use App\Models\GameMatch;
use App\Models\Sponsor;
use App\Services\BillingService;
use App\Services\RealtimeBroadcaster;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Sponsors, advertising creative, and the live controls that push break-time
 * rotations, sponsor pop-ups and emergency announcements to stadium screens.
 */
class SponsorController extends Controller
{
    public function __construct(
        private readonly RealtimeBroadcaster $realtime,
        private readonly BillingService $billing,
    ) {}

    /* ------------------------------------------------------------ Sponsors */

    public function index(Request $request): JsonResponse
    {
        return response()->json(
            $this->scopedQuery($request, Sponsor::query())->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'logo' => ['required', 'string'],
            'website' => ['nullable', 'string'],
            'tier' => ['nullable', 'string', 'in:title,main,gold,silver,local'],
            'description' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:64'],
            'email' => ['nullable', 'string', 'max:255'],
            'organization_id' => ['nullable', 'string'],
        ], [
            'name.required' => 'Sponsor name and logo are required',
            'logo.required' => 'Sponsor name and logo are required',
        ]);

        $sponsor = Sponsor::create([
            'id' => Ids::timestamped('spon'),
            'organization_id' => $data['organization_id'] ?? $request->user()->organization_id,
            'name' => $data['name'],
            'logo' => $data['logo'],
            'website' => $data['website'] ?? null,
            'tier' => $data['tier'] ?? 'gold',
            'description' => $data['description'] ?? null,
            'phone' => $data['phone'] ?? null,
            'email' => $data['email'] ?? null,
        ]);

        return response()->json($sponsor, 201);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $sponsor = Sponsor::find($id);

        if (! $sponsor) {
            return response()->json(['error' => 'Sponsor not found'], 404);
        }

        if ($denied = $this->denyOwnership($request, $sponsor->organization_id)) {
            return $denied;
        }

        $sponsor->delete();

        return response()->json(['message' => 'Sponsor deleted']);
    }

    /* ------------------------------------------------------ Advertisements */

    public function listAds(Request $request): JsonResponse
    {
        return response()->json(
            $this->scopedQuery($request, Advertisement::query())->get()
        );
    }

    public function storeAd(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'business_name' => ['required', 'string', 'max:255'],
            'media_url' => ['required', 'string'],
            'media_type' => ['nullable', 'string', 'in:image,banner,video_card,sponsor_card,full_screen'],
            'display_placement' => ['nullable', 'string', 'in:ticker_banner,break_screen,goal_popup,all'],
            'logo_url' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:64'],
            'whatsapp' => ['nullable', 'string', 'max:64'],
            'website' => ['nullable', 'string'],
            'priority' => ['nullable', 'integer'],
            'duration_seconds' => ['nullable', 'integer', 'min:1'],
            'status' => ['nullable', 'string', 'in:active,inactive,scheduled'],
            'organization_id' => ['nullable', 'string'],
        ], [
            'title.required' => 'Title, business name, and media URL are required',
            'business_name.required' => 'Title, business name, and media URL are required',
            'media_url.required' => 'Title, business name, and media URL are required',
        ]);

        $organizationId = $data['organization_id'] ?? $request->user()->organization_id;
        $limit = $this->billing->checkLimit($organizationId, 'ads');

        if (! $limit['allowed']) {
            return response()->json([
                'error' => $limit['reason'] ?? 'Advertisement limit reached for your current subscription plan.',
                'limit' => $limit,
            ], 403);
        }

        $ad = Advertisement::create([
            'id' => Ids::timestamped('ad'),
            'organization_id' => $organizationId,
            'title' => $data['title'],
            'business_name' => $data['business_name'],
            'media_type' => $data['media_type'] ?? 'image',
            'display_placement' => $data['display_placement'] ?? 'all',
            'media_url' => $data['media_url'],
            'logo_url' => $data['logo_url'] ?? null,
            'description' => $data['description'] ?? null,
            'phone' => $data['phone'] ?? null,
            'whatsapp' => $data['whatsapp'] ?? null,
            'website' => $data['website'] ?? null,
            'priority' => (int) ($data['priority'] ?? 5),
            'duration_seconds' => (int) ($data['duration_seconds'] ?? 10),
            'status' => $data['status'] ?? 'active',
        ]);

        return response()->json($ad, 201);
    }

    public function destroyAd(Request $request, string $id): JsonResponse
    {
        $ad = Advertisement::find($id);

        if (! $ad) {
            return response()->json(['error' => 'Advertisement not found'], 404);
        }

        if ($denied = $this->denyOwnership($request, $ad->organization_id)) {
            return $denied;
        }

        $ad->delete();

        return response()->json(['message' => 'Advertisement deleted']);
    }

    /* -------------------------------------------------- Big-screen controls */

    /**
     * Start, stop or advance the break-time ad rotation on a match's screens.
     */
    public function breakMode(Request $request): JsonResponse
    {
        $data = $request->validate([
            'match_id' => ['required', 'string'],
            'action' => ['required', 'string', 'in:start,stop,next'],
            'break_title' => ['nullable', 'string', 'max:255'],
            'countdown_seconds' => ['nullable', 'integer', 'min:0'],
        ]);

        $match = GameMatch::find($data['match_id']);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        $ads = Advertisement::query()
            ->where('organization_id', $match->organization_id)
            ->where('status', 'active')
            ->get();

        $this->realtime->toRoom("scoreboard:{$match->id}", 'BREAK_AD_ROTATION', [
            'action' => $data['action'],
            'break_title' => $data['break_title'] ?? 'BREAK TIME',
            'countdown_seconds' => (int) ($data['countdown_seconds'] ?? 300),
            'ads' => $ads,
        ]);

        return response()->json([
            'message' => "Break ad mode {$data['action']} broadcasted to scoreboard",
            'adsCount' => $ads->count(),
        ]);
    }

    /**
     * Flash a single sponsor over the live scoreboard — used for goal
     * celebrations and one-off shout-outs.
     */
    public function pushPopup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'match_id' => ['required', 'string'],
            'ad_id' => ['nullable', 'string'],
            'custom_title' => ['nullable', 'string', 'max:255'],
            'custom_message' => ['nullable', 'string'],
            'duration_seconds' => ['nullable', 'integer', 'min:1'],
        ]);

        $match = GameMatch::find($data['match_id']);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        $ad = ! empty($data['ad_id']) ? Advertisement::find($data['ad_id']) : null;

        $ad ??= Advertisement::query()
            ->where('organization_id', $match->organization_id)
            ->where('status', 'active')
            ->first();

        $this->realtime->toRoom("scoreboard:{$match->id}", 'SCOREBOARD_AD_POPUP', [
            'ad' => $ad,
            'custom_title' => $data['custom_title'] ?? 'FEATURED TOURNAMENT SPONSOR',
            'custom_message' => $data['custom_message'] ?? null,
            'duration_seconds' => (int) ($data['duration_seconds'] ?? 8),
        ]);

        return response()->json(['message' => 'Sponsor pop-up broadcasted to live scoreboard', 'ad' => $ad]);
    }

    public function adSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'match_id' => ['required', 'string'],
            'live_ticker_enabled' => ['nullable', 'boolean'],
            'ticker_interval_seconds' => ['nullable', 'integer', 'min:1'],
            'goal_popup_enabled' => ['nullable', 'boolean'],
        ]);

        $match = GameMatch::find($data['match_id']);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        $this->realtime->toRoom("scoreboard:{$match->id}", 'SCOREBOARD_AD_SETTINGS_CHANGED', [
            'live_ticker_enabled' => (bool) ($data['live_ticker_enabled'] ?? true),
            'ticker_interval_seconds' => (int) ($data['ticker_interval_seconds'] ?? 12),
            'goal_popup_enabled' => (bool) ($data['goal_popup_enabled'] ?? true),
        ]);

        return response()->json(['message' => 'Scoreboard ad settings updated and broadcasted']);
    }

    /* ------------------------------------------------------- Announcements */

    public function listAnnouncements(Request $request): JsonResponse
    {
        $query = Announcement::query()->orderByDesc('created_at')->orderByDesc('id');

        if ($orgId = $request->query('orgId')) {
            $query->where('organization_id', $orgId);
        }

        if ($tournamentId = $request->query('tournamentId')) {
            $query->where(fn ($q) => $q->where('tournament_id', $tournamentId)->orWhereNull('tournament_id'));
        }

        return response()->json($query->get());
    }

    public function storeAnnouncement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
            'tournament_id' => ['nullable', 'string'],
            'type' => ['nullable', 'string', 'in:general,urgent_match_delay,venue_change,registration_alert'],
            'is_active_on_scoreboard' => ['nullable', 'boolean'],
            'organization_id' => ['nullable', 'string'],
        ], [
            'title.required' => 'Title and message are required',
            'message.required' => 'Title and message are required',
        ]);

        $announcement = Announcement::create([
            'id' => Ids::timestamped('ann'),
            'organization_id' => $data['organization_id'] ?? $request->user()->organization_id,
            'tournament_id' => $data['tournament_id'] ?? null,
            'title' => $data['title'],
            'message' => $data['message'],
            'type' => $data['type'] ?? 'general',
            'is_active_on_scoreboard' => (bool) ($data['is_active_on_scoreboard'] ?? false),
        ]);

        if ($announcement->is_active_on_scoreboard) {
            $this->realtime->toEveryone('EMERGENCY_ANNOUNCEMENT', ['announcement' => $announcement]);
        }

        return response()->json($announcement, 201);
    }

    /**
     * Pin or unpin an announcement from every live screen at once.
     */
    public function toggleAnnouncement(Request $request, string $id): JsonResponse
    {
        $announcement = Announcement::find($id);

        if (! $announcement) {
            return response()->json(['error' => 'Announcement not found'], 404);
        }

        if ($denied = $this->denyOwnership($request, $announcement->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'is_active_on_scoreboard' => ['required', 'boolean'],
        ]);

        $announcement->is_active_on_scoreboard = $data['is_active_on_scoreboard'];
        $announcement->save();

        $this->realtime->toEveryone('EMERGENCY_ANNOUNCEMENT', [
            'announcement' => $announcement->is_active_on_scoreboard ? $announcement : null,
        ]);

        return response()->json($announcement);
    }

    public function destroyAnnouncement(Request $request, string $id): JsonResponse
    {
        $announcement = Announcement::find($id);

        if (! $announcement) {
            return response()->json(['error' => 'Announcement not found'], 404);
        }

        if ($denied = $this->denyOwnership($request, $announcement->organization_id)) {
            return $denied;
        }

        $announcement->delete();

        return response()->json(['message' => 'Announcement deleted']);
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * Scope a listing to the caller's organization; super admins may target any
     * organization with `?orgId=`, or omit it to see everything.
     */
    private function scopedQuery(Request $request, $query)
    {
        $user = $request->user();
        $orgId = $user->role === 'SUPER_ADMIN' ? $request->query('orgId') : $user->organization_id;

        return $orgId ? $query->where('organization_id', $orgId) : $query;
    }

    private function denyOwnership(Request $request, ?string $organizationId): ?JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'SUPER_ADMIN' && $organizationId !== $user->organization_id) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        return null;
    }
}
