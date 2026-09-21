<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\GeneratePoster;
use App\Models\GameMatch;
use App\Models\Poster;
use App\Models\Tournament;
use App\Services\BillingService;
use App\Support\Ids;
use App\Support\PosterJobStatus;
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
            'poster_type' => ['required', 'string', 'in:'.implode(',', Poster::TYPES)],
            // Points table and announcement posters are tournament-wide, so a
            // tournament with no fixtures yet can still make them.
            'match_id' => ['nullable', 'string', 'required_without:tournament_id'],
            'tournament_id' => ['nullable', 'string'],
        ]);

        $needsMatch = ! in_array($data['poster_type'], ['points_table', 'tournament_announcement'], true);

        if ($needsMatch && empty($data['match_id'])) {
            return response()->json(['error' => 'Pick a match for this poster type.'], 422);
        }

        $match = empty($data['match_id']) ? null : GameMatch::find($data['match_id']);

        if (! empty($data['match_id']) && ! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        $tournament = Tournament::find($match?->tournament_id ?? $data['tournament_id']);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        if (! $this->billing->hasFeature($tournament->organization_id, 'ai_tournament_poster')) {
            return response()->json([
                'error' => 'Poster creation is not available on your current plan. Upgrade your plan to use it.',
            ], 403);
        }

        $jobId = Ids::unique('pjob');

        PosterJobStatus::put($jobId, [
            'status' => 'queued',
            'tournament_id' => $tournament->id,
            'poster_type' => $data['poster_type'],
            'attempt' => 0,
            'max_attempts' => 3,
            'created_by' => $request->user()->id,
            'started_at' => now()->toIso8601String(),
        ]);

        GeneratePoster::dispatch(
            $tournament->id,
            $needsMatch ? $match->id : null,
            $data['poster_type'],
            $request->user()->id,
            $request->headers->get('origin'),
            $jobId,
        );

        return response()->json([
            'message' => 'Poster generation started.',
            'poster_type' => $data['poster_type'],
            'job_id' => $jobId,
        ], 202);
    }

    /**
     * Progress of one "Generate" click: queued, rendering (with the attempt
     * number), done (with the poster) or failed (with a sentence to show).
     */
    public function jobStatus(Request $request, string $jobId): JsonResponse
    {
        $status = PosterJobStatus::get($jobId);

        if (! $status) {
            return response()->json([
                'error' => 'That poster request has expired. Generate it again.',
            ], 404);
        }

        $tournament = Tournament::find($status['tournament_id'] ?? '');

        if ($tournament && ($denied = $this->denyForeignTenant($request, $tournament->organization_id))) {
            return $denied;
        }

        // `queued` for a long time means nothing is picking jobs up. That is
        // an operator's problem, but the organizer still deserves an answer
        // rather than an endless spinner.
        $stalled = ($status['status'] ?? '') === 'queued'
            && isset($status['started_at'])
            && \Illuminate\Support\Carbon::parse($status['started_at'])->diffInSeconds(now()) > 180;

        return response()->json([
            ...collect($status)->except('created_by')->all(),
            'stalled' => $stalled,
        ]);
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
