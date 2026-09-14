<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GameMatch;
use App\Services\LineupService;
use App\Services\RealtimeBroadcaster;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-match team sheets — who is playing, and in what order.
 *
 * Reading is public, like the toss and the scoreboard feed: the stadium
 * display and the tournament hub both render the sheet without a login.
 * Writing is limited to the organizer and the on-ground scorer.
 */
class LineupController extends Controller
{
    public function __construct(
        private readonly LineupService $lineups,
        private readonly RealtimeBroadcaster $realtime,
    ) {}

    public function show(string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return response()->json(['lineups' => $this->lineups->forMatch($match)]);
    }

    /**
     * Replace one team's sheet. Sent whole, so leaving a player out of
     * `players` is how they're dropped from the XI.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'team_id' => ['required', 'string'],
            'players' => ['present', 'array'],
            'players.*.player_id' => ['required', 'string'],
            'players.*.batting_order' => ['nullable', 'integer', 'min:1'],
            'players.*.is_playing' => ['nullable', 'boolean'],
            'players.*.is_captain' => ['nullable', 'boolean'],
            'players.*.is_wicketkeeper' => ['nullable', 'boolean'],
        ]);

        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $match->organization_id)) {
            return $denied;
        }

        try {
            $lineups = $this->lineups->save($match, $data['team_id'], $data['players']);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        // The display holds the squad reveal off this, so it has to hear about
        // a sheet edited while the reveal is already on screen.
        $this->realtime->toRoom("match:{$id}", 'LINEUP_UPDATED', ['lineups' => $lineups]);
        $this->realtime->toRoom("scoreboard:{$id}", 'LINEUP_UPDATED', ['lineups' => $lineups]);

        return response()->json(['lineups' => $lineups]);
    }
}
