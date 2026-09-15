<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\GeneratePoster;
use App\Models\CricketMatchState;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\BillingService;
use App\Services\CricketScorecard;
use App\Services\FootballScorecard;
use App\Services\LineupService;
use App\Services\RealtimeBroadcaster;
use App\Services\ScoreboardDirector;
use App\Services\ScoringEngine;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Fixtures and live scoring.
 *
 * Scoring actions push their result to the `match:<id>` and `scoreboard:<id>`
 * rooms so scorer consoles and big-screen displays update without polling.
 */
class MatchController extends Controller
{
    public function __construct(
        private readonly ScoringEngine $scoring,
        private readonly RealtimeBroadcaster $realtime,
        private readonly BillingService $billing,
        private readonly LineupService $lineups,
        private readonly CricketScorecard $scorecard,
        private readonly FootballScorecard $footballScorecard,
        private readonly ScoreboardDirector $director,
    ) {}

    /* ------------------------------------------------------------ Fixtures */

    public function forTournament(string $tournamentId): JsonResponse
    {
        $matches = GameMatch::query()->where('tournament_id', $tournamentId)->get();

        $teams = Team::query()
            ->whereIn('id', $matches->pluck('team_a_id')->merge($matches->pluck('team_b_id')))
            ->get()->keyBy('id');
        $venues = Venue::query()->whereIn('id', $matches->pluck('venue_id')->filter())->get()->keyBy('id');
        $footballStates = FootballMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id');
        $cricketStates = CricketMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id');

        return response()->json($matches->map(fn (GameMatch $match) => [
            ...$match->toArray(),
            'team_a' => $teams->get($match->team_a_id),
            'team_b' => $teams->get($match->team_b_id),
            'venue' => $match->venue_id ? $venues->get($match->venue_id) : null,
            'football_state' => $match->sport_code === 'football' ? $footballStates->get($match->id) : null,
            'cricket_state' => $match->sport_code === 'cricket' ? $cricketStates->get($match->id) : null,
        ])->values());
    }

    public function show(string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return response()->json($this->matchDetail($match));
    }

    /**
     * Build the fixture list for a tournament from its approved teams — either a
     * full round robin or a single-elimination bracket.
     */
    public function generateFixtures(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tournament_id' => ['required', 'string'],
            'format' => ['nullable', 'string', 'in:round_robin,knockout'],
            'start_date' => ['nullable', 'string'],
            'replace' => ['nullable', 'boolean'],
        ]);

        $tournament = Tournament::find($data['tournament_id']);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        if ($tournament->status === 'cancelled') {
            return response()->json(['error' => 'This tournament has been cancelled'], 409);
        }

        $teams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', 'approved')
            ->get()
            ->values();

        if ($teams->count() < 2) {
            return response()->json(['error' => 'At least 2 approved teams are required to generate fixtures'], 400);
        }

        // Generating twice used to silently append a second full schedule on top
        // of the first. A tournament has exactly one fixture list, so the second
        // call has to say explicitly that it is replacing the existing one.
        $existing = GameMatch::query()->where('tournament_id', $tournament->id)->get();
        $replace = (bool) ($data['replace'] ?? false);

        if ($existing->isNotEmpty() && ! $replace) {
            return response()->json([
                'error' => 'Fixtures already exist for this tournament. Regenerate to replace them.',
                'existing_count' => $existing->count(),
            ], 409);
        }

        // Never throw away a match that has been played or is being played —
        // deleting it would cascade its event log, scores and posters away.
        $played = $existing->reject(fn (GameMatch $match) => in_array($match->status, ['scheduled', 'cancelled'], true));

        if ($replace && $played->isNotEmpty()) {
            return response()->json([
                'error' => sprintf(
                    '%d match(es) have already started or finished. Delete or cancel them before regenerating the fixtures.',
                    $played->count()
                ),
                'blocking_count' => $played->count(),
            ], 409);
        }

        $knockout = ($data['format'] ?? 'round_robin') === 'knockout';
        $baseDate = ! empty($data['start_date']) ? Carbon::parse($data['start_date']) : Carbon::now();
        $venueId = Venue::query()->where('organization_id', $tournament->organization_id)->value('id');
        $matchNumber = 1;

        $pairings = $knockout
            ? $this->knockoutPairings($teams)
            : $this->roundRobinPairings($teams);

        $removed = $existing->count();

        $created = DB::transaction(function () use ($pairings, $tournament, $baseDate, $venueId, $knockout, $teams, $existing, &$matchNumber) {
            $matches = [];

            if ($existing->isNotEmpty()) {
                // States, event logs and posters hang off the match rows with
                // cascading foreign keys, so they go with them.
                GameMatch::query()->whereIn('id', $existing->pluck('id'))->delete();
            }

            foreach ($pairings as $index => [$teamA, $teamB]) {
                $hoursOffset = $knockout ? $index * 2 : $index * 3;

                $matches[] = GameMatch::create([
                    'id' => Ids::unique('match'),
                    'tournament_id' => $tournament->id,
                    'organization_id' => $tournament->organization_id,
                    'sport_code' => $tournament->sport_code,
                    'match_number' => $matchNumber++,
                    'round_name' => $knockout
                        ? ($teams->count() <= 4 ? 'Semi-Final' : 'Quarter-Final')
                        : 'Group Stage - Match '.($index + 1),
                    'team_a_id' => $teamA->id,
                    'team_b_id' => $teamB->id,
                    'venue_id' => $venueId,
                    'scheduled_at' => $baseDate->copy()->addHours($hoursOffset)->format('Y-m-d\TH:i:s.v\Z'),
                    'status' => 'scheduled',
                ]);
            }

            return $matches;
        });

        if ($removed > 0) {
            // The deleted fixtures may have left standing rows behind.
            if ($tournament->sport_code === 'football') {
                $this->scoring->recalculateFootballStandings($tournament->id);
            } else {
                $this->scoring->recalculateCricketStandings($tournament->id);
            }
        }

        $user = $request->user();
        Audit::log([
            'organization_id' => $tournament->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'GENERATED_FIXTURES',
            'entity_type' => 'Tournament',
            'entity_id' => $tournament->id,
            'details' => $removed > 0
                ? sprintf('Replaced %d fixtures with %d new fixtures for tournament [%s]', $removed, count($created), $tournament->name)
                : sprintf('Generated %d fixtures for tournament [%s]', count($created), $tournament->name),
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'matches' => $created,
            'replaced_count' => $removed,
            'message' => $removed > 0
                ? sprintf('Replaced the old schedule with %d new fixtures!', count($created))
                : sprintf('Successfully generated %d fixtures!', count($created)),
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $match->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'scheduled_at' => ['sometimes', 'string'],
            'status' => ['sometimes', 'string', 'in:scheduled,toss,in_progress,half_time,innings_break,drinks_break,delayed,completed,abandoned,cancelled'],
            'delay_reason' => ['sometimes', 'nullable', 'string'],
            'round_name' => ['sometimes', 'string', 'max:255'],
            'venue_id' => ['sometimes', 'nullable', 'string'],
            'winner_team_id' => ['sometimes', 'nullable', 'string'],
            'result_summary' => ['sometimes', 'nullable', 'string'],
            'man_of_the_match_player_id' => ['sometimes', 'nullable', 'string'],
        ]);

        $wasCompleted = $match->status === 'completed';

        $match->fill($data)->save();

        $this->broadcast($match->id, 'MATCH_STATUS_CHANGED', ['match' => $match]);

        // Auto-generate the result (and player-of-match, if recorded) poster
        // the moment a match is marked completed — not on every subsequent
        // edit to an already-completed match.
        if (! $wasCompleted && $match->status === 'completed' && $this->billing->hasFeature($match->organization_id, 'ai_tournament_poster')) {
            GeneratePoster::dispatch($match->tournament_id, $match->id, 'result', $request->user()->id);

            if ($match->man_of_the_match_player_id) {
                GeneratePoster::dispatch($match->tournament_id, $match->id, 'player_of_match', $request->user()->id);
            }
        }

        return response()->json($match);
    }

    /**
     * Call off a single fixture. A finished match keeps its result; anything
     * else (scheduled, mid-toss, even live) is frozen as cancelled and the
     * table is recomputed, since cricket counts a cancelled match as no result.
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $match->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($match->status === 'completed') {
            return response()->json(['error' => 'A completed match cannot be cancelled'], 409);
        }

        if ($match->status === 'cancelled') {
            return response()->json(['error' => 'This match is already cancelled'], 409);
        }

        $reason = trim((string) ($data['reason'] ?? ''));
        $match->status = 'cancelled';
        $match->result_summary = $reason !== '' ? "Match cancelled: {$reason}" : 'Match cancelled';
        $match->save();

        $this->recalculateStandings($match);
        $this->broadcast($match->id, 'MATCH_STATUS_CHANGED', ['match' => $match]);

        $user = $request->user();
        Audit::log([
            'organization_id' => $match->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'CANCELLED_MATCH',
            'entity_type' => 'Match',
            'entity_id' => $match->id,
            'details' => sprintf('Cancelled match #%s%s', $match->match_number, $reason !== '' ? " ({$reason})" : ''),
            'ip_address' => $request->ip(),
        ]);

        return response()->json($match);
    }

    private function recalculateStandings(GameMatch $match): void
    {
        if ($match->sport_code === 'football') {
            $this->scoring->recalculateFootballStandings($match->tournament_id);
        } else {
            $this->scoring->recalculateCricketStandings($match->tournament_id);
        }
    }

    /* ------------------------------------------------------------- Football */

    public function recordFootballEvent(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'team_id' => ['required', 'string'],
            'event_type' => ['required', 'string', 'in:goal,own_goal,penalty_goal,penalty_missed,yellow_card,red_card,substitution,injury'],
            'player_id' => ['nullable', 'string'],
            // Left out, the minute comes off the match clock.
            'minute' => ['nullable', 'integer', 'min:0', 'max:200'],
            'assist_player_id' => ['nullable', 'string'],
            'sub_in_player_id' => ['nullable', 'string'],
            'sub_out_player_id' => ['nullable', 'string'],
            'extra_info' => ['nullable', 'string', 'max:500'],
        ]);

        if ($denied = $this->denyScoring($request, $id)) {
            return $denied;
        }

        try {
            $result = $this->scoring->addFootballEvent([
                'matchId' => $id,
                'teamId' => $data['team_id'],
                'playerId' => $data['player_id'] ?? null,
                'eventType' => $data['event_type'],
                'minute' => isset($data['minute']) ? (int) $data['minute'] : null,
                'assistPlayerId' => $data['assist_player_id'] ?? null,
                'subInPlayerId' => $data['sub_in_player_id'] ?? null,
                'subOutPlayerId' => $data['sub_out_player_id'] ?? null,
                'extraInfo' => $data['extra_info'] ?? null,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);
        $match = $this->handOverToLiveScreen($match);

        $this->broadcast($id, 'SCORE_UPDATED', [
            'match' => $match,
            'state' => $result['state'],
            'event' => $result['event'],
        ]);

        return response()->json($result);
    }

    public function controlFootballTimer(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'string', 'in:start,pause,half_time,set_half,set_minute,finish,reopen'],
            'half' => ['nullable', 'required_if:action,set_half', 'string', 'in:1,2,extra_1,extra_2,penalties,half_time,full_time'],
            'minute' => ['nullable', 'required_if:action,set_minute', 'integer', 'min:0', 'max:200'],
        ]);

        if ($denied = $this->denyScoring($request, $id)) {
            return $denied;
        }

        try {
            $state = $this->scoring->updateFootballTimer($id, $data['action'], [
                'half' => $data['half'] ?? null,
                'minute' => $data['minute'] ?? null,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);

        // Kick-off takes the screen off the toss or the walk-out, and the
        // break or the final whistle brings the card up — unless the organizer
        // is holding the screen on the live score. A pause or a clock
        // correction leaves it alone.
        if (! in_array($data['action'], ['pause', 'set_minute'], true)) {
            $match = $this->handOverToLiveScreen($match);
        }

        $this->broadcast($id, 'SCORE_UPDATED', ['match' => $match, 'state' => $state]);

        return response()->json(['state' => $state, 'match' => $match]);
    }

    public function undoFootballEvent(Request $request, string $id): JsonResponse
    {
        if ($denied = $this->denyScoring($request, $id)) {
            return $denied;
        }

        try {
            $state = $this->scoring->undoLastFootballEvent($id);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);
        $this->broadcast($id, 'SCORE_UPDATED', ['match' => $match, 'state' => $state]);

        return response()->json(['state' => $state, 'match' => $match]);
    }

    /* -------------------------------------------------------------- Cricket */

    public function recordCricketBall(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'innings' => ['required', 'integer', 'in:1,2'],
            'runs_scored' => ['nullable', 'integer', 'min:0'],
            'extras' => ['nullable', 'string', 'in:wide,no_ball,bye,leg_bye,none'],
            'extras_runs' => ['nullable', 'integer', 'min:0'],
            'is_wicket' => ['nullable', 'boolean'],
            'wicket_type' => ['nullable', 'string', 'in:bowled,caught,lbw,run_out,stumped,hit_wicket,caught_and_bowled,retired_hurt,obstructing_field'],
            'dismissed_player_id' => ['nullable', 'string'],
            'fielder_id' => ['nullable', 'string'],
            'commentary' => ['nullable', 'string'],
            'next_striker_id' => ['nullable', 'string'],
            'striker_id' => ['nullable', 'string'],
            'non_striker_id' => ['nullable', 'string'],
            'bowler_id' => ['nullable', 'string'],
        ]);

        if ($denied = $this->denyScoring($request, $id)) {
            return $denied;
        }

        $match = GameMatch::find($id);

        // The batting order depends on who won the toss, so scoring stays
        // locked until the toss (digital call+decision, or a manual entry)
        // has been recorded.
        if (! $match->toss_decision) {
            return response()->json(['error' => 'Record the coin toss before scoring can start'], 422);
        }

        try {
            $result = $this->scoring->recordCricketBall([
                'matchId' => $id,
                'innings' => (int) $data['innings'],
                'runsScored' => (int) ($data['runs_scored'] ?? 0),
                'extras' => $data['extras'] ?? 'none',
                'extrasRuns' => isset($data['extras_runs']) ? (int) $data['extras_runs'] : null,
                'isWicket' => (bool) ($data['is_wicket'] ?? false),
                'wicketType' => $data['wicket_type'] ?? null,
                'dismissedPlayerId' => $data['dismissed_player_id'] ?? null,
                'fielderId' => $data['fielder_id'] ?? null,
                'commentary' => $data['commentary'] ?? null,
                'nextStrikerId' => $data['next_striker_id'] ?? null,
                'strikerId' => $data['striker_id'] ?? null,
                'nonStrikerId' => $data['non_striker_id'] ?? null,
                'bowlerId' => $data['bowler_id'] ?? null,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);
        $match = $this->handOverToLiveScreen($match);

        $this->broadcast($id, 'SCORE_UPDATED', [
            'match' => $match,
            'state' => $result['state'],
            'delivery' => $result['delivery'],
        ]);

        return response()->json($result);
    }

    public function undoCricketBall(Request $request, string $id): JsonResponse
    {
        if ($denied = $this->denyScoring($request, $id)) {
            return $denied;
        }

        $state = $this->scoring->undoLastCricketBall($id);

        if (! $state) {
            return response()->json(['error' => 'Match not found'], 400);
        }

        $match = GameMatch::find($id);
        $this->broadcast($id, 'SCORE_UPDATED', ['match' => $match, 'state' => $state]);

        return response()->json(['state' => $state, 'match' => $match]);
    }

    public function switchInnings(Request $request, string $id): JsonResponse
    {
        if ($denied = $this->denyScoring($request, $id)) {
            return $denied;
        }

        try {
            $state = $this->scoring->switchCricketInnings($id);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);
        $this->broadcast($id, 'SCORE_UPDATED', ['match' => $match, 'state' => $state]);

        return response()->json(['state' => $state, 'match' => $match]);
    }

    /* ------------------------------------------------ Big-screen direction */

    /**
     * Point the stadium display at a segment — the toss replay, the squad
     * reveal, or the live scoreline — from the scorer console.
     *
     * The choice is saved on the match as well as broadcast, so a display that
     * reloads mid-reveal comes back to the same segment instead of falling
     * back to whatever `match.status` implies.
     */
    public function setScoreboardStage(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'stage' => ['required', 'string', 'in:'.implode(',', ScoreboardDirector::STAGES)],
            // Reveal position: omit or -1 to play, or a count of players to
            // hold the reveal on.
            'cursor' => ['nullable', 'integer', 'min:-1'],
            // The ad or announcement to show, for those two stages.
            'item_id' => ['nullable', 'string'],
        ]);

        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $match->organization_id)) {
            return $denied;
        }

        try {
            $match = $this->director->setStage($id, $data['stage'], $data['cursor'] ?? null, $data['item_id'] ?? null);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $payload = $this->director->payload($match);

        $this->broadcast($id, 'SCOREBOARD_STAGE_CHANGED', $payload);

        return response()->json($payload);
    }

    /**
     * End the match on the scorer's word during the second innings. A chase
     * that is reached, bowled out or runs out of overs finishes on its own; this
     * covers everything the engine can't see, like a declaration or bad light.
     */
    public function finishCricketMatch(Request $request, string $id): JsonResponse
    {
        $existing = GameMatch::find($id);

        if (! $existing) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $existing->organization_id)) {
            return $denied;
        }

        try {
            $match = $this->scoring->finishCricketMatch($id);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $this->broadcast($id, 'MATCH_STATUS_CHANGED', ['match' => $match]);

        return response()->json(['match' => $match]);
    }

    /* ----------------------------------------------------- Big-screen feed */

    /**
     * Everything a 16:9 stadium display renders: the match, both squads and
     * live state. An ad or announcement the organizer has put on screen rides
     * in `scoreboard.item`, so nothing else about sponsors is sent.
     */
    public function scoreboard(string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return response()->json($this->matchDetail($match));
    }

    /* ------------------------------------------------------------- Helpers */

    private function matchDetail(GameMatch $match): array
    {
        $teamA = Team::find($match->team_a_id);
        $teamB = Team::find($match->team_b_id);
        $cricketState = $match->sport_code === 'cricket' ? $this->scoring->cricketState($match->id) : null;
        $footballState = $match->sport_code === 'football' ? $this->scoring->footballState($match->id) : null;

        return [
            'match' => $match,
            'tournament' => Tournament::find($match->tournament_id),
            'team_a' => [
                ...($teamA?->toArray() ?? []),
                'players' => Player::query()->where('team_id', $match->team_a_id)->get(),
            ],
            'team_b' => [
                ...($teamB?->toArray() ?? []),
                'players' => Player::query()->where('team_id', $match->team_b_id)->get(),
            ],
            'venue' => $match->venue_id ? Venue::find($match->venue_id) : null,
            'football_state' => $footballState,
            'cricket_state' => $cricketState,
            // Team sheets in reveal order, and the card derived from each
            // sport's log — the scorer console picks players from the first,
            // the big screen renders both.
            'lineups' => $this->lineups->forMatch($match),
            'scorecard' => $match->sport_code === 'cricket' ? $this->scorecard->forMatch($match, $cricketState) : [],
            'football_scorecard' => $footballState ? $this->footballScorecard->forMatch($match, $footballState) : null,
            // Players off for good (a red, or a second yellow), so neither the
            // console nor the display offers them for a goal or a return.
            'sent_off_player_ids' => $footballState ? $this->scoring->sentOffPlayerIds($footballState) : [],
            'scoreboard' => $this->director->payload($match),
        ];
    }

    /**
     * @return array<int, array{0: Team, 1: Team}>
     */
    private function roundRobinPairings($teams): array
    {
        $pairings = [];

        for ($i = 0; $i < $teams->count(); $i++) {
            for ($j = $i + 1; $j < $teams->count(); $j++) {
                $pairings[] = [$teams[$i], $teams[$j]];
            }
        }

        return $pairings;
    }

    /**
     * @return array<int, array{0: Team, 1: Team}>
     */
    private function knockoutPairings($teams): array
    {
        $pairings = [];

        for ($i = 0; $i + 1 < $teams->count(); $i += 2) {
            $pairings[] = [$teams[$i], $teams[$i + 1]];
        }

        return $pairings;
    }

    /**
     * Scoring belongs to the match's own organization. The role check lives on
     * the route; this is the tenant half, so a scorer from one club can't
     * change another club's match.
     */
    private function denyScoring(Request $request, string $matchId): ?JsonResponse
    {
        $match = GameMatch::find($matchId);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return $this->denyForeignTenant($request, $match->organization_id);
    }

    /**
     * The first scoring action ends the pre-match build-up: if the display is
     * still on the toss or the squad reveal, put it back on the scoreline and
     * tell it so.
     */
    private function handOverToLiveScreen(?GameMatch $match): ?GameMatch
    {
        if (! $match) {
            return $match;
        }

        $moved = $this->director->returnToLive($match);

        if ($moved) {
            $this->broadcast($match->id, 'SCOREBOARD_STAGE_CHANGED', $this->director->payload($moved));
        }

        return $moved ?: $match;
    }

    /**
     * Scorer consoles and stadium displays subscribe to different rooms for the
     * same match; both need every scoring update.
     */
    private function broadcast(string $matchId, string $type, array $payload): void
    {
        $this->realtime->toRoom("match:{$matchId}", $type, $payload);
        $this->realtime->toRoom("scoreboard:{$matchId}", $type, $payload);
    }
}
