<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GameMatch;
use App\Services\RealtimeBroadcaster;
use App\Services\TossService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The pre-match coin toss. Kept separate from MatchController's scoring
 * actions because it's a one-time fact, not a ball-by-ball/event-log write.
 *
 * Broadcasts to the same `match:<id>` / `scoreboard:<id>` rooms every scoring
 * action uses, so the scorer console and big-screen display update live.
 */
class TossController extends Controller
{
    public function __construct(
        private readonly TossService $toss,
        private readonly RealtimeBroadcaster $realtime,
    ) {}

    /**
     * Public — the toss result is shown on tournament hubs and the scoreboard
     * without requiring a login.
     */
    public function show(string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return response()->json($this->tossPayload($match));
    }

    public function call(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'team_id' => ['required', 'string'],
            'call' => ['required', 'string', 'in:heads,tails'],
        ]);

        try {
            $match = $this->toss->call($id, $data['team_id'], $data['call']);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $this->broadcast($id, 'TOSS_CALLED', $this->tossPayload($match));

        return response()->json($this->tossPayload($match));
    }

    public function decision(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'string', 'in:bat,bowl'],
        ]);

        try {
            $match = $this->toss->decide($id, $data['decision']);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $this->broadcast($id, 'TOSS_DECIDED', $this->tossPayload($match));

        return response()->json($this->tossPayload($match));
    }

    public function manual(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'winner_team_id' => ['required', 'string'],
            'decision' => ['required', 'string', 'in:bat,bowl'],
        ]);

        try {
            $match = $this->toss->recordManual($id, $data['winner_team_id'], $data['decision']);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $this->broadcast($id, 'TOSS_RECORDED', $this->tossPayload($match));

        return response()->json($this->tossPayload($match));
    }

    private function tossPayload(GameMatch $match): array
    {
        return [
            'match_id' => $match->id,
            'toss_caller_team_id' => $match->toss_caller_team_id,
            'toss_call' => $match->toss_call,
            'toss_result' => $match->toss_result,
            'toss_winner_team_id' => $match->toss_winner_team_id,
            'toss_decision' => $match->toss_decision,
            'toss_method' => $match->toss_method,
            'toss_time' => $match->toss_time,
            'batting_first_team_id' => $match->batting_first_team_id,
        ];
    }

    private function broadcast(string $matchId, string $type, array $payload): void
    {
        $this->realtime->toRoom("match:{$matchId}", $type, $payload);
        $this->realtime->toRoom("scoreboard:{$matchId}", $type, $payload);
    }
}
