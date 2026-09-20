<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GameMatch;
use App\Models\Venue;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The grounds an organizer plays on.
 *
 * The `venues` table existed from the start with no way to write to it, so every
 * generated fixture was given whichever venue happened to be first and a club
 * with three grounds used one. FixtureBuilder spreads a round across everything
 * listed here, which is what lets eight matches happen in an afternoon.
 *
 * Reading is open — the public hub and the stadium screen both name the ground —
 * but only the organizer changes the list.
 */
class VenueController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $organizationId = $request->query('organization_id') ?: $request->user()?->organization_id;

        if (! $organizationId) {
            return response()->json(['error' => 'Organization ID is required'], 400);
        }

        $venues = Venue::query()
            ->where('organization_id', $organizationId)
            ->orderBy('name')
            ->get();

        // How busy each ground is, which is the question an organizer has when
        // deciding whether to add another.
        $fixtureCounts = GameMatch::query()
            ->whereIn('venue_id', $venues->pluck('id'))
            ->selectRaw('venue_id, count(*) as total')
            ->groupBy('venue_id')
            ->pluck('total', 'venue_id');

        return response()->json($venues->map(fn (Venue $venue) => [
            ...$venue->toArray(),
            'fixture_count' => (int) ($fixtureCounts[$venue->id] ?? 0),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $organizationId = $request->input('organization_id') ?: $user->organization_id;

        if (! $organizationId) {
            return response()->json(['error' => 'Organization ID is required'], 400);
        }

        if ($denied = $this->denyForeignTenant($request, $organizationId)) {
            return $denied;
        }

        $data = $request->validate($this->rules());

        $venue = Venue::create([
            'id' => Ids::unique('venue'),
            'organization_id' => $organizationId,
            'name' => $data['name'],
            'address' => $data['address'] ?? '',
            'village' => $data['village'] ?? '',
            'panchayat' => $data['panchayat'] ?? '',
            'district' => $data['district'] ?? '',
            'google_maps_url' => $data['google_maps_url'] ?? '',
            'created_at' => now(),
        ]);

        $this->log($request, 'CREATED_VENUE', $venue, sprintf('Added ground [%s]', $venue->name));

        return response()->json($venue, 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $venue = Venue::find($id);

        if (! $venue) {
            return response()->json(['error' => 'Ground not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $venue->organization_id)) {
            return $denied;
        }

        $venue->fill($request->validate($this->rules(creating: false)))->save();

        $this->log($request, 'UPDATED_VENUE', $venue, sprintf('Updated ground [%s]', $venue->name));

        return response()->json($venue);
    }

    /**
     * Remove a ground.
     *
     * Fixtures point at venues by id with no foreign key, so deleting one that
     * is still in use would leave matches naming a ground that no longer
     * exists. Those fixtures are released first, which shows up on screen as a
     * fixture with no ground — visible and fixable, unlike a dangling id.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $venue = Venue::find($id);

        if (! $venue) {
            return response()->json(['error' => 'Ground not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $venue->organization_id)) {
            return $denied;
        }

        $inUse = GameMatch::query()->where('venue_id', $venue->id);
        $upcoming = (clone $inUse)->where('status', 'scheduled')->count();
        $played = (clone $inUse)->whereNotIn('status', ['scheduled', 'cancelled'])->count();

        // A ground a match was actually played on is part of that match's
        // record. Losing it would rewrite history, so it stays.
        if ($played > 0) {
            return response()->json([
                'error' => sprintf(
                    '%d match(es) have already been played at %s, so it cannot be removed.',
                    $played,
                    $venue->name
                ),
                'played_count' => $played,
            ], 409);
        }

        $inUse->update(['venue_id' => null]);
        $venue->delete();

        $this->log($request, 'DELETED_VENUE', $venue, sprintf(
            'Removed ground [%s]%s',
            $venue->name,
            $upcoming > 0 ? sprintf(' and released %d scheduled fixture(s)', $upcoming) : ''
        ));

        return response()->json([
            'message' => 'Ground removed',
            'released_fixtures' => $upcoming,
        ]);
    }

    /** @return array<string, mixed> */
    private function rules(bool $creating = true): array
    {
        $presence = $creating ? 'required' : 'sometimes';

        return [
            'name' => [$presence, 'string', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'village' => ['sometimes', 'nullable', 'string', 'max:255'],
            'panchayat' => ['sometimes', 'nullable', 'string', 'max:255'],
            'district' => ['sometimes', 'nullable', 'string', 'max:255'],
            'google_maps_url' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    private function log(Request $request, string $action, Venue $venue, string $details): void
    {
        $user = $request->user();

        Audit::log([
            'organization_id' => $venue->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => $action,
            'entity_type' => 'Venue',
            'entity_id' => $venue->id,
            'details' => $details,
            'ip_address' => $request->ip(),
        ]);
    }
}
