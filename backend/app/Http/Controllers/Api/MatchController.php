<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\GeneratePoster;
use App\Models\Advertisement;
use App\Models\Announcement;
use App\Models\CricketMatchState;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\Player;
use App\Models\Sponsor;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\Venue;
use App\Services\RealtimeBroadcaster;
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
        ]);

        $tournament = Tournament::find($data['tournament_id']);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $teams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', 'approved')
            ->get()
            ->values();

        if ($teams->count() < 2) {
            return response()->json(['error' => 'At least 2 approved teams are required to generate fixtures'], 400);
        }

        $knockout = ($data['format'] ?? 'round_robin') === 'knockout';
        $baseDate = ! empty($data['start_date']) ? Carbon::parse($data['start_date']) : Carbon::now();
        $venueId = Venue::query()->where('organization_id', $tournament->organization_id)->value('id');
        $matchNumber = GameMatch::query()->where('tournament_id', $tournament->id)->count() + 1;

        $pairings = $knockout
            ? $this->knockoutPairings($teams)
            : $this->roundRobinPairings($teams);

        $created = DB::transaction(function () use ($pairings, $tournament, $baseDate, $venueId, $knockout, $teams, &$matchNumber) {
            $matches = [];

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

        $user = $request->user();
        Audit::log([
            'organization_id' => $tournament->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'GENERATED_FIXTURES',
            'entity_type' => 'Tournament',
            'entity_id' => $tournament->id,
            'details' => sprintf('Generated %d fixtures for tournament [%s]', count($created), $tournament->name),
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'matches' => $created,
            'message' => sprintf('Successfully generated %d fixtures!', count($created)),
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
        if (! $wasCompleted && $match->status === 'completed') {
            GeneratePoster::dispatch($match->tournament_id, $match->id, 'result', $request->user()->id);

            if ($match->man_of_the_match_player_id) {
                GeneratePoster::dispatch($match->tournament_id, $match->id, 'player_of_match', $request->user()->id);
            }
        }

        return response()->json($match);
    }

    /* ------------------------------------------------------------- Football */

    public function recordFootballEvent(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'team_id' => ['required', 'string'],
            'event_type' => ['required', 'string', 'in:goal,own_goal,penalty_goal,penalty_missed,yellow_card,red_card,substitution,injury'],
            'player_id' => ['nullable', 'string'],
            'minute' => ['nullable', 'integer'],
            'assist_player_id' => ['nullable', 'string'],
            'sub_in_player_id' => ['nullable', 'string'],
            'sub_out_player_id' => ['nullable', 'string'],
            'extra_info' => ['nullable', 'string'],
        ]);

        try {
            $result = $this->scoring->addFootballEvent([
                'matchId' => $id,
                'teamId' => $data['team_id'],
                'playerId' => $data['player_id'] ?? null,
                'eventType' => $data['event_type'],
                'minute' => (int) ($data['minute'] ?? 0),
                'assistPlayerId' => $data['assist_player_id'] ?? null,
                'subInPlayerId' => $data['sub_in_player_id'] ?? null,
                'subOutPlayerId' => $data['sub_out_player_id'] ?? null,
                'extraInfo' => $data['extra_info'] ?? null,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);

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
            'action' => ['required', 'string', 'in:start,pause,set_half,set_minute,finish'],
            'half' => ['nullable', 'string', 'in:1,2,extra_1,extra_2,penalties,full_time'],
            'minute' => ['nullable', 'integer'],
        ]);

        try {
            $state = $this->scoring->updateFootballTimer($id, $data['action'], [
                'half' => $data['half'] ?? null,
                'minute' => $data['minute'] ?? null,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);
        $this->broadcast($id, 'SCORE_UPDATED', ['match' => $match, 'state' => $state]);

        return response()->json(['state' => $state, 'match' => $match]);
    }

    public function undoFootballEvent(string $id): JsonResponse
    {
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

        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

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

        $this->broadcast($id, 'SCORE_UPDATED', [
            'match' => $match,
            'state' => $result['state'],
            'delivery' => $result['delivery'],
        ]);

        return response()->json($result);
    }

    public function undoCricketBall(string $id): JsonResponse
    {
        $state = $this->scoring->undoLastCricketBall($id);

        if (! $state) {
            return response()->json(['error' => 'Match not found'], 400);
        }

        $match = GameMatch::find($id);
        $this->broadcast($id, 'SCORE_UPDATED', ['match' => $match, 'state' => $state]);

        return response()->json(['state' => $state, 'match' => $match]);
    }

    public function switchInnings(string $id): JsonResponse
    {
        try {
            $state = $this->scoring->switchCricketInnings($id);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $match = GameMatch::find($id);
        $this->broadcast($id, 'SCORE_UPDATED', ['match' => $match, 'state' => $state]);

        return response()->json(['state' => $state, 'match' => $match]);
    }

    /* ----------------------------------------------------- Big-screen feed */

    /**
     * Everything a 16:9 stadium display renders: the match, both squads, live
     * state, active sponsor creative and any announcement pinned to the screen.
     */
    public function scoreboard(string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return response()->json([
            ...$this->matchDetail($match),
            'advertisements' => Advertisement::query()
                ->where('organization_id', $match->organization_id)
                ->where('status', 'active')
                ->get(),
            'sponsors' => Sponsor::query()->where('organization_id', $match->organization_id)->get(),
            'announcement' => Announcement::query()
                ->where('organization_id', $match->organization_id)
                ->where('is_active_on_scoreboard', true)
                ->where(fn ($query) => $query->where('tournament_id', $match->tournament_id)->orWhereNull('tournament_id'))
                ->first(),
        ]);
    }

    /* ------------------------------------------------------------- Helpers */

    private function matchDetail(GameMatch $match): array
    {
        $teamA = Team::find($match->team_a_id);
        $teamB = Team::find($match->team_b_id);

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
            'football_state' => $match->sport_code === 'football' ? $this->scoring->footballState($match->id) : null,
            'cricket_state' => $match->sport_code === 'cricket' ? $this->scoring->cricketState($match->id) : null,
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
     * Scorer consoles and stadium displays subscribe to different rooms for the
     * same match; both need every scoring update.
     */
    private function broadcast(string $matchId, string $type, array $payload): void
    {
        $this->realtime->toRoom("match:{$matchId}", $type, $payload);
        $this->realtime->toRoom("scoreboard:{$matchId}", $type, $payload);
    }
}
