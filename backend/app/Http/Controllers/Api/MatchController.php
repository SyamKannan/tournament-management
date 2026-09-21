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
use App\Services\Fixtures\BracketService;
use App\Services\Fixtures\FixtureBuilder;
use App\Services\FootballScorecard;
use App\Services\LineupService;
use App\Services\Notifications\Audience;
use App\Services\Notifications\NotificationService;
use App\Services\RealtimeBroadcaster;
use App\Services\ScoreboardDirector;
use App\Services\ScoringEngine;
use App\Support\Audit;
use App\Support\Cached;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Fixtures and live scoring.
 *
 * Scoring actions push their result to the `match:<id>` and `scoreboard:<id>`
 * rooms so scorer consoles and big-screen displays update without polling.
 */
class MatchController extends Controller
{
    /** Statuses of a match that is under way, breaks included. */
    private const LIVE_STATUSES = ['in_progress', 'half_time', 'innings_break', 'drinks_break'];

    public function __construct(
        private readonly ScoringEngine $scoring,
        private readonly RealtimeBroadcaster $realtime,
        private readonly BillingService $billing,
        private readonly LineupService $lineups,
        private readonly CricketScorecard $scorecard,
        private readonly FootballScorecard $footballScorecard,
        private readonly ScoreboardDirector $director,
        private readonly NotificationService $notifications,
        private readonly FixtureBuilder $fixtures,
        private readonly BracketService $brackets,
    ) {}

    /* ------------------------------------------------------------ Fixtures */

    public function forTournament(Request $request, string $tournamentId): JsonResponse
    {
        // Staff see the teams' contacts; everyone else shares one entry.
        $staff = $this->isOrganizationStaff($request, Tournament::query()->whereKey($tournamentId)->value('organization_id'));

        return Cached::json(Cached::tournament($tournamentId), $staff ? 'fixtures:staff' : 'fixtures', 'hub',
            fn () => $this->fixtureList($tournamentId, $staff));
    }

    private function fixtureList(string $tournamentId, bool $staff): Collection
    {
        $matches = GameMatch::query()->where('tournament_id', $tournamentId)->get();

        $teams = Team::query()
            ->whereIn('id', $matches->pluck('team_a_id')->merge($matches->pluck('team_b_id')))
            ->get()->keyBy('id');

        if (! $staff) {
            $this->withoutTeamContacts($teams);
        }
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
        ])->values();
    }

    /**
     * The home-page ticker: matches being played right now across every
     * public tournament, then the next few coming up and the latest results so
     * the strip is never empty. Only what a ticker shows — team names and
     * logos, the score and the status — none of the team managers' contacts.
     */
    public function current(): JsonResponse
    {
        $base = fn () => GameMatch::query()
            ->select('matches.*')
            ->join('tournaments', 'tournaments.id', '=', 'matches.tournament_id')
            ->where('tournaments.status', '!=', 'draft');

        $live = $base()->whereIn('matches.status', self::LIVE_STATUSES)->orderBy('matches.scheduled_at')->limit(20)->get();
        $upcoming = $base()->whereIn('matches.status', ['scheduled', 'toss', 'delayed'])->orderBy('matches.scheduled_at')->limit(6)->get();
        $recent = $base()->where('matches.status', 'completed')->orderByDesc('matches.updated_at')->limit(6)->get();

        $matches = $live->concat($upcoming)->concat($recent);

        $teams = Team::query()
            ->whereIn('id', $matches->pluck('team_a_id')->merge($matches->pluck('team_b_id'))->unique())
            ->get(['id', 'name', 'short_name', 'logo'])
            ->keyBy('id');
        $tournaments = Tournament::query()->whereIn('id', $matches->pluck('tournament_id')->unique())->get(['id', 'name', 'slug'])->keyBy('id');
        $footballStates = FootballMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id');
        $cricketStates = CricketMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id');

        $team = fn (string $id) => ($found = $teams->get($id))
            ? ['id' => $found->id, 'name' => $found->name, 'short_name' => $found->short_name, 'logo' => $found->logo]
            : ['id' => $id, 'name' => 'TBD', 'short_name' => 'TBD', 'logo' => null];

        return response()->json($matches->map(function (GameMatch $match) use ($team, $tournaments, $footballStates, $cricketStates) {
            $football = $footballStates->get($match->id);
            $cricket = $cricketStates->get($match->id);
            $battingFirst = $match->batting_first_team_id ?: $match->team_a_id;

            return [
                'id' => $match->id,
                'sport_code' => $match->sport_code,
                'status' => $match->status,
                'is_live' => in_array($match->status, self::LIVE_STATUSES, true),
                'round_name' => $match->round_name,
                'scheduled_at' => $match->scheduled_at,
                'result_summary' => $match->result_summary,
                'tournament' => ($t = $tournaments->get($match->tournament_id)) ? ['id' => $t->id, 'name' => $t->name, 'slug' => $t->slug] : null,
                'team_a' => $team($match->team_a_id),
                'team_b' => $team($match->team_b_id),
                // Football: goals and the clock. Cricket: each side's innings,
                // keyed by team (the state row keys them by innings).
                'football' => $match->sport_code === 'football' && $football ? [
                    'team_a_score' => (int) $football->team_a_score,
                    'team_b_score' => (int) $football->team_b_score,
                    'current_half' => $football->current_half,
                ] : null,
                'cricket' => $match->sport_code === 'cricket' && $cricket ? [
                    'current_innings' => (int) $cricket->current_innings,
                    'target_runs' => $cricket->target_runs,
                    'innings' => [
                        ['team_id' => $battingFirst, 'runs' => (int) $cricket->team_a_runs, 'wickets' => (int) $cricket->team_a_wickets, 'overs' => (float) $cricket->team_a_overs],
                        ['team_id' => $battingFirst === $match->team_a_id ? $match->team_b_id : $match->team_a_id, 'runs' => (int) $cricket->team_b_runs, 'wickets' => (int) $cricket->team_b_wickets, 'overs' => (float) $cricket->team_b_overs],
                    ],
                ] : null,
            ];
        })->values());
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return response()->json($this->matchDetail($match, $request));
    }

    /**
     * Build the fixture list for a tournament from its approved teams — either a
     * full round robin or a single-elimination bracket.
     */
    public function generateFixtures(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tournament_id' => ['required', 'string'],
            // `round_robin` is what this endpoint used to call a league; kept so
            // an older client keeps working.
            'format' => ['nullable', 'string', 'in:round_robin,league,knockout,group_stage,league_knockout'],
            'start_date' => ['nullable', 'string'],
            'replace' => ['nullable', 'boolean'],
            // A league played twice, home and away.
            'double_round' => ['nullable', 'boolean'],
            // How many groups to split into; left out, it is chosen from the
            // number of teams.
            'groups' => ['nullable', 'integer', 'min:1', 'max:16'],
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

        $removed = $existing->count();

        $created = DB::transaction(function () use ($data, $tournament, $teams, $existing) {
            if ($existing->isNotEmpty()) {
                // States, event logs and posters hang off the match rows with
                // cascading foreign keys, so they go with them.
                GameMatch::query()->whereIn('id', $existing->pluck('id'))->delete();
            }

            // A group stage also writes each team's group onto the team, so the
            // tournament table can be read a group at a time.
            return $this->fixtures->build($tournament, $teams, $data);
        });

        // Byes are written as completed matches, and a group table starts empty,
        // so the table and the bracket both need settling once before anyone
        // looks at them.
        // This also clears standing rows the deleted fixtures left behind.
        $this->recalculateStandings($tournament);

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

        $this->announceFixtures($tournament, $created);

        return response()->json([
            'matches' => $created,
            'replaced_count' => $removed,
            'message' => $removed > 0
                ? sprintf('Replaced the old schedule with %d new fixtures!', count($created))
                : sprintf('Successfully generated %d fixtures!', count($created)),
        ], 201);
    }

    /**
     * Tell every approved team's manager that the schedule is out, and when
     * their own first match is.
     *
     * Each manager gets their own team's fixtures, not the whole list: what a
     * village side needs from this message is the date they have to field
     * eleven players, and a shared list makes them hunt for it.
     *
     * @param  array<int, GameMatch>  $matches
     */
    private function announceFixtures(Tournament $tournament, array $matches): void
    {
        if (! $matches) {
            return;
        }

        $teams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', 'approved')
            ->get();

        $byTeam = [];

        foreach ($matches as $match) {
            $byTeam[$match->team_a_id][] = $match;
            $byTeam[$match->team_b_id][] = $match;
        }

        $names = $teams->pluck('name', 'id');

        foreach ($teams as $team) {
            $own = $byTeam[$team->id] ?? [];

            if (! $own) {
                continue;
            }

            usort($own, fn (GameMatch $a, GameMatch $b) => $a->match_number <=> $b->match_number);
            $first = $own[0];
            $opponent = $first->team_a_id === $team->id ? $first->team_b_id : $first->team_a_id;

            $this->notifications->dispatch(
                'fixtures_published',
                Audience::teamManager($team),
                [
                    'tournament' => $tournament->name,
                    'team' => $team->name,
                    'match_count' => (string) count($own),
                    'first_match' => trim(sprintf(
                        'vs %s, %s',
                        $names[$opponent] ?? 'TBC',
                        $this->kickoffLabel($first->scheduled_at)
                    ), ' ,'),
                    'link' => $this->publicHubUrl($tournament),
                ],
                $tournament->organization_id,
                'tournament',
                $tournament->id,
                // One announcement per published schedule. Regenerating the
                // fixtures is a new schedule, so the count keeps it distinct.
                sprintf('fixtures_published:%s:%d', $tournament->id, count($matches)),
            );
        }
    }

    private function kickoffLabel(?string $scheduledAt): string
    {
        if (! $scheduledAt) {
            return '';
        }

        try {
            return Carbon::parse($scheduledAt)->format('D j M, g:ia');
        } catch (\Throwable) {
            return '';
        }
    }

    private function publicHubUrl(Tournament $tournament): string
    {
        $base = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        return $base ? $base.'/t/'.$tournament->slug : '';
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

        // A result typed in by hand still has to name one of the two sides.
        if (! empty($data['winner_team_id']) && ! in_array($data['winner_team_id'], [$match->team_a_id, $match->team_b_id], true)) {
            return response()->json(['error' => 'The winner must be one of the two teams in this match.'], 422);
        }

        if (! empty($data['man_of_the_match_player_id'])) {
            $inMatch = Player::query()
                ->whereKey($data['man_of_the_match_player_id'])
                ->whereIn('team_id', [$match->team_a_id, $match->team_b_id])
                ->exists();

            if (! $inMatch) {
                return response()->json(['error' => 'Player of the match must be a player from one of the two teams.'], 422);
            }
        }

        if (! empty($data['venue_id']) && ! Venue::query()->whereKey($data['venue_id'])->where('organization_id', $match->organization_id)->exists()) {
            return response()->json(['error' => 'That venue belongs to another organization.'], 422);
        }

        $previousStatus = $match->status;
        $previousWinner = $match->winner_team_id;
        $wasCompleted = $previousStatus === 'completed';

        $match->fill($data)->save();

        // The table counts wins, draws and no-results, so a status or winner
        // edited here has to be folded back into it.
        if ($match->status !== $previousStatus || $match->winner_team_id !== $previousWinner) {
            $this->recalculateStandings($match);
        }

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

    /**
     * The knockout bracket for a tournament, round by round.
     *
     * Public, for the same reason the fixture list and the tournament table are:
     * the hub and the stadium screen both show the bracket, and nobody signs in
     * to look at one. A draft tournament has nothing to show yet.
     */
    public function bracket(string $tournamentId): JsonResponse
    {
        $tournament = Tournament::query()
            ->where('id', $tournamentId)
            ->orWhere('slug', $tournamentId)
            ->first();

        if (! $tournament || $tournament->status === 'draft') {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        return Cached::json(Cached::tournament($tournament->id), 'bracket', 'hub',
            fn () => $this->brackets->forTournament($tournament));
    }

    /** Takes a fixture or the whole tournament; both know the sport and the id. */
    private function recalculateStandings(GameMatch|Tournament $subject): void
    {
        [$sportCode, $tournamentId] = $subject instanceof Tournament
            ? [$subject->sport_code, $subject->id]
            : [$subject->sport_code, $subject->tournament_id];

        if ($sportCode === 'football') {
            $this->scoring->recalculateFootballStandings($tournamentId);
        } else {
            $this->scoring->recalculateCricketStandings($tournamentId);
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
    public function scoreboard(Request $request, string $id): JsonResponse
    {
        $match = GameMatch::find($id);

        if (! $match) {
            return response()->json(['error' => 'Match not found'], 404);
        }

        return response()->json($this->matchDetail($match, $request));
    }

    /* ------------------------------------------------------------- Helpers */

    private function matchDetail(GameMatch $match, Request $request): array
    {
        $teamA = Team::find($match->team_a_id);
        $teamB = Team::find($match->team_b_id);
        $playersA = Player::query()->where('team_id', $match->team_a_id)->get();
        $playersB = Player::query()->where('team_id', $match->team_b_id)->get();

        if (! $this->isOrganizationStaff($request, $match->organization_id)) {
            $this->withoutTeamContacts($teamA);
            $this->withoutTeamContacts($teamB);
            $this->withoutPlayerContacts($playersA);
            $this->withoutPlayerContacts($playersB);
        }
        $cricketState = $match->sport_code === 'cricket' ? $this->scoring->cricketState($match->id) : null;
        $footballState = $match->sport_code === 'football' ? $this->scoring->footballState($match->id) : null;

        return [
            'match' => $match,
            'tournament' => Tournament::find($match->tournament_id),
            'team_a' => [
                ...($teamA?->toArray() ?? []),
                'players' => $playersA,
            ],
            'team_b' => [
                ...($teamB?->toArray() ?? []),
                'players' => $playersB,
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
