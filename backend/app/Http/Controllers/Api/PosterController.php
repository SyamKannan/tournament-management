<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\GeneratePoster;
use App\Models\GameMatch;
use App\Models\Poster;
use App\Models\Tournament;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class PosterController extends Controller
{
    public function __construct(
        private readonly BillingService $billing,
    ) {}

    /**
     * Queues poster rendering — a full render (art director call, optional
     * AI background, headless Chrome) is too slow to hold an HTTP request
     * open for, so this returns immediately and the finished poster arrives
     * over the `tournament:<id>` realtime room as POSTER_CREATED.
     */
    public function generate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'match_id' => ['required', 'string'],
            'poster_type' => ['required', 'string', 'in:'.implode(',', Poster::TYPES)],
        ]);

        $match = GameMatch::find($data['match_id']);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $match->organization_id)) {
            return $denied;
        }

        if (! $this->billing->hasFeature($match->organization_id, 'ai_tournament_poster')) {
            return response()->json([
                'error' => 'Poster creation is not available on your current plan. Upgrade your plan to use it.',
            ], 403);
        }

        $needsMatch = $data['poster_type'] !== 'points_table' && $data['poster_type'] !== 'tournament_announcement';

        GeneratePoster::dispatch(
            $match->tournament_id,
            $needsMatch ? $match->id : null,
            $data['poster_type'],
            $request->user()->id,
        );

        return response()->json([
            'message' => 'Poster generation started.',
            'poster_type' => $data['poster_type'],
        ], 202);
    }

    /**
     * Public — posters are share-ready promotional images, same visibility
     * as the public tournament hub.
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tournament_id' => ['required', 'string'],
        ]);

        if (! Tournament::find($data['tournament_id'])) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        return response()->json(
            Poster::query()
                ->where('tournament_id', $data['tournament_id'])
                ->orderByDesc('created_at')
                ->get()
        );
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $poster = Poster::find($id);

        if (! $poster) {
            return response()->json(['error' => 'Poster not found'], 404);
        }

        $tournament = Tournament::find($poster->tournament_id);

        if ($denied = $this->denyForeignTenant($request, $tournament?->organization_id)) {
            return $denied;
        }

        $relativePath = ltrim((string) parse_url($poster->image_path, PHP_URL_PATH), '/');
        if ($relativePath) {
            File::delete(public_path($relativePath));
        }

        $poster->delete();

        return response()->json(['message' => 'Poster deleted successfully']);
    }
}
