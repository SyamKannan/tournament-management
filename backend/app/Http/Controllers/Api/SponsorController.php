<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Advertisement;
use App\Models\Announcement;
use App\Models\GameMatch;
use App\Models\Sponsor;
use App\Services\BillingService;
use App\Services\RealtimeBroadcaster;
use App\Services\ScoreboardDirector;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Sponsors, and the ads and announcements that belong to a single match.
 *
 * Nothing here puts anything on a stadium screen: an ad or announcement goes up
 * full screen only when someone running its match pushes it from the scorer
 * console (`POST /matches/{id}/scoreboard/stage`).
 */
class SponsorController extends Controller
{
    /** Longest on-screen time an ad or announcement may be given; 0 holds it. */
    private const MAX_DURATION_SECONDS = 3600;

    public function __construct(
        private readonly RealtimeBroadcaster $realtime,
        private readonly BillingService $billing,
        private readonly ScoreboardDirector $director,
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
        $query = $this->scopedQuery($request, Advertisement::query())->orderByDesc('created_at');

        if ($matchId = $request->query('matchId')) {
            $query->where('match_id', $matchId);
        }

        return response()->json($query->get());
    }

    public function storeAd(Request $request): JsonResponse
    {
        $data = $request->validate([
            'match_id' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'business_name' => ['required', 'string', 'max:255'],
            'media_url' => ['required', 'string'],
            'media_type' => ['nullable', 'string', 'in:image,banner,video_card,sponsor_card,full_screen'],
            'logo_url' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:64'],
            'whatsapp' => ['nullable', 'string', 'max:64'],
            'website' => ['nullable', 'string'],
            'priority' => ['nullable', 'integer'],
            'duration_seconds' => ['nullable', 'integer', 'min:0', 'max:'.self::MAX_DURATION_SECONDS],
            'status' => ['nullable', 'string', 'in:active,inactive,scheduled'],
        ], [
            'match_id.required' => 'Choose the match this ad belongs to',
            'title.required' => 'Title, business name, and media URL are required',
            'business_name.required' => 'Title, business name, and media URL are required',
            'media_url.required' => 'Title, business name, and media URL are required',
        ]);

        [$match, $denied] = $this->ownedMatch($request, $data['match_id']);

        if ($denied) {
            return $denied;
        }

        if ($limited = $this->denyOverAdLimit($match->organization_id, 1)) {
            return $limited;
        }

        $ad = Advertisement::create([
            'id' => Ids::timestamped('ad'),
            'organization_id' => $match->organization_id,
            'match_id' => $match->id,
            'title' => $data['title'],
            'business_name' => $data['business_name'],
            'media_type' => $data['media_type'] ?? 'image',
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

    /**
     * Change how long an ad stays on screen (or pause it) — done from the
     * scorer console while the match is running.
     */
    public function updateAd(Request $request, string $id): JsonResponse
    {
        $ad = Advertisement::find($id);

        if (! $ad) {
            return response()->json(['error' => 'Advertisement not found'], 404);
        }

        if ($denied = $this->denyOwnership($request, $ad->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'duration_seconds' => ['sometimes', 'integer', 'min:0', 'max:'.self::MAX_DURATION_SECONDS],
            'status' => ['sometimes', 'string', 'in:active,inactive,scheduled'],
        ]);

        $ad->fill($data)->save();
        $this->refreshScreenShowing('ad', $ad);

        return response()->json($ad);
    }

    /**
     * Copy an ad onto other matches of the same organization — a sponsor
     * running all tournament shouldn't have to be typed in match by match.
     */
    public function copyAd(Request $request, string $id): JsonResponse
    {
        $ad = Advertisement::find($id);

        if (! $ad) {
            return response()->json(['error' => 'Advertisement not found'], 404);
        }

        if ($denied = $this->denyOwnership($request, $ad->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'match_ids' => ['required', 'array', 'min:1'],
            'match_ids.*' => ['string', 'distinct'],
        ]);

        $matches = GameMatch::query()
            ->whereIn('id', $data['match_ids'])
            ->where('id', '!=', $ad->match_id)
            ->get();

        if ($matches->count() !== count(array_diff($data['match_ids'], [$ad->match_id]))
            || $matches->contains(fn ($match) => $match->organization_id !== $ad->organization_id)) {
            return response()->json(['error' => 'Ads can only be copied to other matches of the same organization'], 422);
        }

        if ($limited = $this->denyOverAdLimit($ad->organization_id, $matches->count())) {
            return $limited;
        }

        $copies = $matches->map(fn (GameMatch $match) => Advertisement::create([
            ...collect($ad->getAttributes())->except(['id', 'match_id', 'created_at'])->all(),
            'id' => Ids::unique('ad'),
            'match_id' => $match->id,
        ]))->values();

        return response()->json($copies, 201);
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
        $this->refreshScreenShowing('ad', $ad);

        return response()->json(['message' => 'Advertisement deleted']);
    }

    /* ------------------------------------------------------- Announcements */

    /**
     * Public — the tournament hub lists a tournament's announcements. A
     * signed-in organizer asking without filters gets only their own.
     */
    public function listAnnouncements(Request $request): JsonResponse
    {
        $query = Announcement::query()->orderByDesc('created_at')->orderByDesc('id');
        $user = $request->user();

        $orgId = $request->query('orgId')
            ?? ($user && $user->role !== 'SUPER_ADMIN' ? $user->organization_id : null);

        if ($orgId) {
            $query->where('organization_id', $orgId);
        }

        if ($tournamentId = $request->query('tournamentId')) {
            $query->where('tournament_id', $tournamentId);
        }

        if ($matchId = $request->query('matchId')) {
            $query->where('match_id', $matchId);
        }

        return response()->json($query->get());
    }

    public function storeAnnouncement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'match_id' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
            'type' => ['nullable', 'string', 'in:general,urgent_match_delay,venue_change,registration_alert'],
            'duration_seconds' => ['nullable', 'integer', 'min:0', 'max:'.self::MAX_DURATION_SECONDS],
        ], [
            'match_id.required' => 'Choose the match this announcement belongs to',
            'title.required' => 'Title and message are required',
            'message.required' => 'Title and message are required',
        ]);

        [$match, $denied] = $this->ownedMatch($request, $data['match_id']);

        if ($denied) {
            return $denied;
        }

        $announcement = Announcement::create([
            'id' => Ids::timestamped('ann'),
            'organization_id' => $match->organization_id,
            'tournament_id' => $match->tournament_id,
            'match_id' => $match->id,
            'title' => $data['title'],
            'message' => $data['message'],
            'type' => $data['type'] ?? 'general',
            'duration_seconds' => (int) ($data['duration_seconds'] ?? 30),
        ]);

        return response()->json($announcement, 201);
    }

    public function updateAnnouncement(Request $request, string $id): JsonResponse
    {
        $announcement = Announcement::find($id);

        if (! $announcement) {
            return response()->json(['error' => 'Announcement not found'], 404);
        }

        if ($denied = $this->denyOwnership($request, $announcement->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'duration_seconds' => ['required', 'integer', 'min:0', 'max:'.self::MAX_DURATION_SECONDS],
        ]);

        $announcement->fill($data)->save();
        $this->refreshScreenShowing('announcement', $announcement);

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
        $this->refreshScreenShowing('announcement', $announcement);

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

    /**
     * @return array{0: ?GameMatch, 1: ?JsonResponse}
     */
    private function ownedMatch(Request $request, string $matchId): array
    {
        $match = GameMatch::find($matchId);

        if (! $match) {
            return [null, response()->json(['error' => 'Match not found'], 404)];
        }

        return [$match, $this->denyOwnership($request, $match->organization_id)];
    }

    private function denyOverAdLimit(string $organizationId, int $adding): ?JsonResponse
    {
        $limit = $this->billing->checkLimit($organizationId, 'ads');
        $fits = isset($limit['current'], $limit['max'])
            ? $limit['current'] + $adding <= $limit['max']
            : $limit['allowed'];

        if ($fits) {
            return null;
        }

        return response()->json([
            'error' => $limit['reason']
                ?? sprintf('Advertisement limit reached (%d/%d). Upgrade your plan.', $limit['current'] ?? 0, $limit['max'] ?? 0),
            'limit' => $limit,
        ], 403);
    }

    /**
     * When the item just changed or deleted is the one on its match's screen,
     * re-send the stage so the display picks up the new time or drops it.
     */
    private function refreshScreenShowing(string $stage, Advertisement|Announcement $item): void
    {
        $match = GameMatch::find($item->match_id);

        if (! $match || $match->scoreboard_stage !== $stage || $match->scoreboard_item_id !== $item->id) {
            return;
        }

        $payload = $this->director->payload($match);

        $this->realtime->toRoom("match:{$match->id}", 'SCOREBOARD_STAGE_CHANGED', $payload);
        $this->realtime->toRoom("scoreboard:{$match->id}", 'SCOREBOARD_STAGE_CHANGED', $payload);
    }
}
