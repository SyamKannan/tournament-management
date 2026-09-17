<?php

namespace App\Services;

use App\Models\CricketDelivery;
use App\Models\CricketMatchState;
use App\Models\FootballEvent;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\Player;
use App\Models\Standing;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\Ids;
use Illuminate\Support\Facades\DB;

/**
 * Live scoring for both supported sports.
 *
 * Football and cricket each keep a single mutable state row plus an append-only
 * log (events / deliveries). Every scoring action writes to the log, folds its
 * effect into the state row and recomputes the tournament table — so undo is
 * just "drop the last log entry and reverse its effect". Player statistics are
 * not kept here at all: PlayerStatsService reads them straight off the log.
 */
class ScoringEngine
{
    public function __construct(private readonly LineupService $lineups) {}

    /* ---------------------------------------------------------------------
     | Football
     * -------------------------------------------------------------------*/

    /** Event types that put the ball in the net, and so need a scorer on the pitch. */
    private const FOOTBALL_SCORING_EVENTS = ['goal', 'penalty_goal'];

    /** Periods the clock runs in, in the order a match moves through them. */
    public const FOOTBALL_PERIODS = ['1', '2', 'extra_1', 'extra_2', 'penalties'];

    public function footballState(string $matchId): FootballMatchState
    {
        $state = FootballMatchState::query()->where('match_id', $matchId)->first();

        if (! $state) {
            $state = FootballMatchState::create([
                'id' => Ids::unique('fb_state'),
                'match_id' => $matchId,
                'team_a_score' => 0,
                'team_b_score' => 0,
                'current_half' => '1',
                'match_minute' => 0,
                'elapsed_seconds' => 0,
                'is_timer_running' => false,
            ]);
        }

        return $state->load('events');
    }

    /**
     * @param  array{matchId: string, teamId: string, playerId: ?string, eventType: string, minute?: ?int, assistPlayerId?: ?string, subInPlayerId?: ?string, subOutPlayerId?: ?string, extraInfo?: ?string}  $params
     * @return array{state: FootballMatchState, event: FootballEvent}
     *
     * @throws \RuntimeException when the match does not exist, isn't football,
     *                            is cancelled or finished, or the event names
     *                            a team or player that can't take part in it
     */
    public function addFootballEvent(array $params): array
    {
        $match = $this->findFootballMatch($params['matchId']);

        $this->assertNotCancelled($match);
        $this->assertNotCompleted($match);

        return DB::transaction(function () use ($params, $match) {
            $state = $this->footballState($match->id);
            $params = $this->validateFootballEvent($match, $state, $params);

            // Left out, the minute is read off the clock: the minute a goal
            // goes in is the one the clock is *in*, so 0:40 is the 1st minute.
            $minute = $params['minute'] ?? intdiv($state->clock_seconds, 60) + 1;

            $event = FootballEvent::create([
                'id' => Ids::unique('ev'),
                'match_id' => $match->id,
                'sequence' => $this->nextFootballSequence($match->id),
                'team_id' => $params['teamId'],
                'player_id' => $params['playerId'] ?? '',
                'event_type' => $params['eventType'],
                'minute' => $minute,
                'assist_player_id' => $params['assistPlayerId'] ?? null,
                'sub_in_player_id' => $params['subInPlayerId'] ?? null,
                'sub_out_player_id' => $params['subOutPlayerId'] ?? null,
                'extra_info' => $params['extraInfo'] ?? null,
            ]);

            // The minute on the event is the scorer's to set, and may be typed
            // in after the fact; the clock is not moved by it.
            $this->applyGoal($state, $match, $params['eventType'], $params['teamId'], 1);
            $state->save();

            if (in_array($match->status, ['scheduled', 'toss'], true)) {
                $match->status = 'in_progress';
                $match->save();
            }

            $this->recalculateFootballStandings($match->tournament_id);

            return ['state' => $this->footballState($match->id), 'event' => $event];
        });
    }

    /**
     * Check an event against the match before it is written, and tidy what
     * the scorer sent: an assist only rides on an open-play goal, and a
     * substitution is logged against the player coming on.
     *
     * Rolling substitutions are common at village level and the team sheet is
     * often left at its default, so a scorer is *not* made to prove who is on
     * the pitch. What is refused is what can't have happened: a player from
     * the other side, a sent-off player scoring or coming back on, a player
     * assisting their own goal, or someone replacing themselves.
     *
     * @return array<string, mixed>
     */
    private function validateFootballEvent(GameMatch $match, FootballMatchState $state, array $params): array
    {
        $teamId = $params['teamId'];

        if (! in_array($teamId, [$match->team_a_id, $match->team_b_id], true)) {
            throw new \RuntimeException('That team is not playing in this match');
        }

        $squad = Player::query()->where('team_id', $teamId)->pluck('id')->all();
        $onSquad = fn (?string $playerId) => $playerId !== null && in_array($playerId, $squad, true);
        $sentOff = $this->sentOffPlayerIds($state);
        $type = $params['eventType'];

        foreach (['playerId', 'assistPlayerId', 'subInPlayerId', 'subOutPlayerId'] as $key) {
            $params[$key] = ! empty($params[$key]) ? $params[$key] : null;
        }

        if ($type !== 'goal') {
            $params['assistPlayerId'] = null;
        }

        if ($type === 'substitution') {
            if (! $params['subInPlayerId'] || ! $params['subOutPlayerId']) {
                throw new \RuntimeException('A substitution needs both the player coming on and the player going off');
            }
            if ($params['subInPlayerId'] === $params['subOutPlayerId']) {
                throw new \RuntimeException('A player cannot replace themselves');
            }
            if (! $onSquad($params['subInPlayerId']) || ! $onSquad($params['subOutPlayerId'])) {
                throw new \RuntimeException('Both players in a substitution must be in that team’s squad');
            }
            if (in_array($params['subInPlayerId'], $sentOff, true)) {
                throw new \RuntimeException('A sent-off player cannot come back on');
            }

            $params['playerId'] = $params['subInPlayerId'];

            return $params;
        }

        $params['subInPlayerId'] = null;
        $params['subOutPlayerId'] = null;

        if ($params['playerId'] && ! $onSquad($params['playerId'])) {
            throw new \RuntimeException('That player is not in this team’s squad');
        }

        if ($params['assistPlayerId']) {
            if (! $onSquad($params['assistPlayerId'])) {
                throw new \RuntimeException('The assisting player is not in this team’s squad');
            }
            if ($params['assistPlayerId'] === $params['playerId']) {
                throw new \RuntimeException('A player cannot assist their own goal');
            }
        }

        if (in_array($type, [...self::FOOTBALL_SCORING_EVENTS, 'penalty_missed'], true)) {
            foreach ([$params['playerId'], $params['assistPlayerId']] as $playerId) {
                if ($playerId && in_array($playerId, $sentOff, true)) {
                    throw new \RuntimeException('That player has been sent off');
                }
            }
        }

        return $params;
    }

    /**
     * Players who are off for good: shown a red, or a second yellow.
     *
     * @return array<int, string>
     */
    public function sentOffPlayerIds(FootballMatchState $state): array
    {
        $yellows = [];
        $off = [];

        foreach ($state->events as $event) {
            if (! $event->player_id) {
                continue;
            }

            if ($event->event_type === 'red_card') {
                $off[$event->player_id] = true;
            } elseif ($event->event_type === 'yellow_card') {
                $yellows[$event->player_id] = ($yellows[$event->player_id] ?? 0) + 1;
                if ($yellows[$event->player_id] >= 2) {
                    $off[$event->player_id] = true;
                }
            }
        }

        return array_keys($off);
    }

    /**
     * Take the last event back out: its goal off the scoreline and — if the
     * match has already finished — the result settled again on the corrected
     * score. Player stats are read from the log, so they follow on their own.
     *
     * A finished match stays finished. The final whistle ended it, not the
     * event being corrected; reopening play is its own action.
     */
    public function undoLastFootballEvent(string $matchId): FootballMatchState
    {
        $match = $this->findFootballMatch($matchId);

        return DB::transaction(function () use ($match) {
            $state = $this->footballState($match->id);

            $last = FootballEvent::query()
                ->where('match_id', $match->id)
                ->orderByDesc('sequence')
                ->first();

            if (! $last) {
                return $state;
            }

            $this->applyGoal($state, $match, $last->event_type, $last->team_id, -1);
            $state->save();

            $last->delete();

            if ($match->status === 'completed') {
                $this->concludeFootballMatch($match, $state);
                $match->save();
            }

            $this->recalculateFootballStandings($match->tournament_id);

            return $this->footballState($match->id);
        });
    }

    /**
     * Apply (direction = 1) or reverse (direction = -1) an event's effect on the
     * scoreline. Own goals credit the opposing side.
     */
    private function applyGoal(FootballMatchState $state, GameMatch $match, string $eventType, string $teamId, int $direction): void
    {
        $scoringEvent = in_array($eventType, ['goal', 'penalty_goal'], true);
        $ownGoal = $eventType === 'own_goal';

        if (! $scoringEvent && ! $ownGoal) {
            return;
        }

        $creditsTeamA = $scoringEvent
            ? $teamId === $match->team_a_id
            : $teamId !== $match->team_a_id;

        if ($creditsTeamA) {
            $state->team_a_score = max(0, $state->team_a_score + $direction);
        } else {
            $state->team_b_score = max(0, $state->team_b_score + $direction);
        }
    }

    /**
     * Drive the match clock and move the match through its periods.
     *
     * - `start` / `pause` run and stop the clock without losing a second.
     * - `half_time` stops it and puts the match on its break.
     * - `set_half` kicks off a period (1, 2, extra_1, extra_2) with the clock
     *   set to where that period begins, or goes to `penalties` (clock
     *   stopped), `half_time` or `full_time`.
     * - `set_minute` corrects the clock.
     * - `finish` is the final whistle; `reopen` takes it back.
     *
     * @param  array{half?: ?string, minute?: ?int}  $payload
     *
     * @throws \RuntimeException when the match does not exist, isn't football,
     *                            is cancelled, or is finished (for anything
     *                            but `reopen`)
     */
    public function updateFootballTimer(string $matchId, string $action, array $payload = []): FootballMatchState
    {
        $match = $this->findFootballMatch($matchId);

        $this->assertNotCancelled($match);

        if ($action === 'set_half' && ($payload['half'] ?? null) === 'full_time') {
            $action = 'finish';
        }
        if ($action === 'set_half' && ($payload['half'] ?? null) === 'half_time') {
            $action = 'half_time';
        }

        if ($action === 'reopen') {
            if ($match->status !== 'completed') {
                throw new \RuntimeException('Only a finished match can be reopened');
            }
        } else {
            $this->assertNotCompleted($match);
        }

        return DB::transaction(function () use ($match, $action, $payload) {
            $state = $this->footballState($match->id);

            switch ($action) {
                case 'start':
                    // Kicking off again after the break is the second half.
                    if ($state->current_half === 'half_time') {
                        $state->current_half = '2';
                        $state->elapsed_seconds = max($state->elapsed_seconds, $this->footballPeriodStart($match, '2'));
                    }
                    // Starting a clock that is already running used to restart
                    // its reference point and drop the time since.
                    if (! $state->is_timer_running) {
                        $this->runClock($state);
                    }
                    $match->status = 'in_progress';
                    break;

                case 'pause':
                    $this->stopClock($state);
                    break;

                case 'half_time':
                    $this->stopClock($state);
                    $state->current_half = 'half_time';
                    $match->status = 'half_time';
                    break;

                case 'set_half':
                    $half = $payload['half'] ?? null;

                    if (! in_array($half, self::FOOTBALL_PERIODS, true)) {
                        throw new \RuntimeException('Unknown period');
                    }

                    $this->stopClock($state);
                    $state->current_half = $half;

                    // A shoot-out has no clock; every other period starts
                    // with it set to where that period begins, and running.
                    if ($half !== 'penalties') {
                        $state->elapsed_seconds = $this->footballPeriodStart($match, $half);
                        $this->runClock($state);
                    }

                    $match->status = 'in_progress';
                    break;

                case 'set_minute':
                    $running = $state->is_timer_running;
                    $this->stopClock($state);
                    $state->elapsed_seconds = max(0, (int) ($payload['minute'] ?? 0)) * 60;
                    if ($running) {
                        $this->runClock($state);
                    }
                    break;

                case 'finish':
                    $this->stopClock($state);
                    $state->current_half = 'full_time';
                    $this->concludeFootballMatch($match, $state);
                    break;

                case 'reopen':
                    // Back to the second half with the clock stopped where the
                    // whistle went; the scorer moves it on to extra time if
                    // that is where the match really was.
                    $state->current_half = '2';
                    $match->status = 'in_progress';
                    $match->winner_team_id = null;
                    $match->result_summary = null;
                    break;

                default:
                    throw new \RuntimeException('Unknown clock action');
            }

            $state->match_minute = intdiv($state->clock_seconds, 60);
            $state->save();
            $match->save();

            $this->recalculateFootballStandings($match->tournament_id);

            return $this->footballState($match->id);
        });
    }

    private function runClock(FootballMatchState $state): void
    {
        $state->is_timer_running = true;
        $state->timer_started_at_epoch = now()->getTimestampMs();
    }

    /** Fold the running time into the stored clock, so a pause loses nothing. */
    private function stopClock(FootballMatchState $state): void
    {
        $state->elapsed_seconds = $state->clock_seconds;
        $state->is_timer_running = false;
        $state->timer_started_at_epoch = null;
    }

    /**
     * Where the clock stands when a period kicks off, from the tournament's own
     * half length — a 25-minute-half sevens and a 45-minute league both run
     * through here. Extra-time halves are a third of a half (15 of 45),
     * unless the tournament sets them.
     */
    public function footballPeriodStart(GameMatch $match, string $period): int
    {
        $settings = Tournament::find($match->tournament_id)?->settings ?? [];
        $half = (int) ($settings['half_duration_minutes'] ?? 0);

        if ($half <= 0) {
            $full = (int) ($settings['match_duration_minutes'] ?? 0);
            $half = $full > 0 ? intdiv($full, 2) : 45;
        }

        $extra = (int) ($settings['extra_time_half_minutes'] ?? 0);
        $extra = $extra > 0 ? $extra : max(1, (int) round($half / 3));

        return 60 * match ($period) {
            '2' => $half,
            'extra_1' => 2 * $half,
            'extra_2' => 2 * $half + $extra,
            default => 0,
        };
    }

    /** Settle the result on the score as it stands, naming the winner. */
    private function concludeFootballMatch(GameMatch $match, FootballMatchState $state): void
    {
        $match->status = 'completed';
        $a = $state->team_a_score;
        $b = $state->team_b_score;

        if ($a === $b) {
            $match->winner_team_id = null;
            $match->result_summary = "Match drawn {$a} - {$b}";

            return;
        }

        $winnerId = $a > $b ? $match->team_a_id : $match->team_b_id;
        $match->winner_team_id = $winnerId;
        $match->result_summary = sprintf(
            '%s won %d - %d',
            Team::query()->whereKey($winnerId)->value('name') ?: ($a > $b ? 'Team A' : 'Team B'),
            max($a, $b),
            min($a, $b),
        );
    }

    public function recalculateFootballStandings(string $tournamentId): void
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament || $tournament->sport_code !== 'football') {
            return;
        }

        $teams = Team::query()->where('tournament_id', $tournamentId)->where('status', 'approved')->get();
        $matches = GameMatch::query()->where('tournament_id', $tournamentId)->get();
        $states = FootballMatchState::query()
            ->whereIn('match_id', $matches->pluck('id'))
            ->get()
            ->keyBy('match_id');

        foreach ($teams as $team) {
            $played = $won = $drawn = $lost = $goalsFor = $goalsAgainst = $points = 0;
            $form = [];

            foreach ($matches as $match) {
                $state = $states->get($match->id);

                if (! $state || ($match->team_a_id !== $team->id && $match->team_b_id !== $team->id)) {
                    continue;
                }

                if (! in_array($match->status, ['in_progress', 'completed', 'half_time'], true)) {
                    continue;
                }

                $played++;
                $isTeamA = $match->team_a_id === $team->id;
                $mine = $isTeamA ? $state->team_a_score : $state->team_b_score;
                $theirs = $isTeamA ? $state->team_b_score : $state->team_a_score;

                $goalsFor += $mine;
                $goalsAgainst += $theirs;

                if ($mine > $theirs) {
                    $won++;
                    $points += 3;
                    $form[] = 'W';
                } elseif ($mine === $theirs) {
                    $drawn++;
                    $points += 1;
                    $form[] = 'D';
                } else {
                    $lost++;
                    $form[] = 'L';
                }
            }

            $this->upsertStanding($tournamentId, $team->id, 'std', [
                'organization_id' => $tournament->organization_id,
                'group_name' => $team->group_name ?: 'Group A',
                'played' => $played,
                'won' => $won,
                'drawn' => $drawn,
                'lost' => $lost,
                'goals_for' => $goalsFor,
                'goals_against' => $goalsAgainst,
                'goal_difference' => $goalsFor - $goalsAgainst,
                'points' => $points,
                'form' => array_slice($form, -5),
            ]);
        }

        $this->rankStandings($tournamentId, fn ($a, $b) => [$b->points, $b->goal_difference, $b->goals_for] <=> [$a->points, $a->goal_difference, $a->goals_for]);
    }

    /* ---------------------------------------------------------------------
     | Cricket
     * -------------------------------------------------------------------*/

    public function cricketState(string $matchId): ?CricketMatchState
    {
        $state = CricketMatchState::query()->where('match_id', $matchId)->first();

        if ($state) {
            return $state->load('deliveries');
        }

        $match = GameMatch::find($matchId);

        if (! $match) {
            return null;
        }

        // Who bats first is decided by the pre-match coin toss (TossService,
        // recorded on `matches`); before that's set, default to team A so a
        // state row can still be inspected pre-toss.
        $battingTeamId = $match->batting_first_team_id ?: $match->team_a_id;
        $bowlingTeamId = $battingTeamId === $match->team_a_id ? $match->team_b_id : $match->team_a_id;

        // A T10 village cup and a T20 league both run through here, so the
        // innings length is the tournament's own setting.
        $totalOvers = (int) (Tournament::find($match->tournament_id)?->settings['total_overs'] ?? 20);

        return CricketMatchState::create([
            'id' => Ids::unique('crick_state'),
            'match_id' => $matchId,
            'total_overs' => $totalOvers > 0 ? $totalOvers : 20,
            'current_innings' => 1,
            'batting_team_id' => $battingTeamId,
            'bowling_team_id' => $bowlingTeamId,
            'team_a_runs' => 0,
            'team_a_wickets' => 0,
            'team_a_overs' => 0,
            'team_b_runs' => 0,
            'team_b_wickets' => 0,
            'team_b_overs' => 0,
            'current_run_rate' => 0,
        ])->load('deliveries');
    }

    /**
     * @param  array{matchId: string, innings: int, runsScored: int, extras: string, extrasRuns?: ?int, isWicket: bool, wicketType?: ?string, dismissedPlayerId?: ?string, fielderId?: ?string, commentary?: ?string, nextStrikerId?: ?string, strikerId?: ?string, nonStrikerId?: ?string, bowlerId?: ?string}  $params
     * @return array{state: CricketMatchState, delivery: CricketDelivery}
     *
     * @throws \RuntimeException when the match does not exist
     */
    public function recordCricketBall(array $params): array
    {
        $match = $this->findCricketMatch($params['matchId']);

        $this->assertNotCancelled($match);
        $this->assertNotCompleted($match);

        return DB::transaction(function () use ($params, $match) {
            $state = $this->cricketState($params['matchId']);
            $innings = $params['innings'];
            $extras = $params['extras'] ?: 'none';

            // The innings being scored is the one the match is in. Trusting the
            // number sent up let a stale console add runs to a finished innings.
            if ($innings !== (int) $state->current_innings) {
                throw new \RuntimeException($innings === 1
                    ? 'The second innings is under way — the first innings is closed.'
                    : 'The first innings is still in progress. Switch innings first.');
            }

            $this->assertInningsHasBallsLeft($match, $state, $innings);

            foreach (['strikerId' => 'current_striker_id', 'nonStrikerId' => 'current_non_striker_id', 'bowlerId' => 'current_bowler_id'] as $input => $column) {
                if (! empty($params[$input])) {
                    $state->{$column} = $params[$input];
                }
            }

            $isLegalBall = ! in_array($extras, ['wide', 'no_ball'], true);
            // No extra was signalled, so nothing can be added as one.
            $extrasRuns = $extras === 'none' ? 0 : ($params['extrasRuns'] ?? 1);
            $totalDeliveryRuns = $params['runsScored'] + $extrasRuns;

            // Wides and no-balls carry a one-run penalty; anything on top of it
            // was run between the wickets, and so decides the change of ends.
            // Byes and leg-byes have no penalty — every one of those runs was
            // run. Strike therefore turns on runs run, not runs off the bat.
            $penaltyRuns = in_array($extras, ['wide', 'no_ball'], true) ? 1 : 0;
            $runsRun = $params['runsScored'] + max(0, $extrasRuns - $penaltyRuns);

            $legalBallsBefore = CricketDelivery::query()
                ->where('match_id', $params['matchId'])
                ->where('innings', $innings)
                ->whereNotIn('extras', ['wide', 'no_ball'])
                ->count();

            $delivery = CricketDelivery::create([
                'id' => Ids::unique('del'),
                'match_id' => $params['matchId'],
                'sequence' => $this->nextCricketSequence($params['matchId']),
                'innings' => $innings,
                'over_number' => intdiv($legalBallsBefore, 6),
                'ball_number' => ($legalBallsBefore % 6) + ($isLegalBall ? 1 : 0),
                // Left blank rather than filled with a placeholder name when
                // the scorer hasn't named the crease — a blank is skipped by
                // the scorecard, where 'striker' would become a phantom batter.
                'bowler_id' => $state->current_bowler_id ?: '',
                'striker_id' => $state->current_striker_id ?: '',
                'non_striker_id' => $state->current_non_striker_id ?: '',
                'runs_scored' => $params['runsScored'],
                'extras' => $extras,
                'extras_runs' => $extrasRuns,
                'is_wicket' => $params['isWicket'],
                'wicket_type' => $params['wicketType'] ?? null,
                'dismissed_player_id' => $params['dismissedPlayerId'] ?? null,
                'fielder_id' => $params['fielderId'] ?? null,
                'commentary' => $params['commentary'] ?? null,
            ]);

            $legalBallsAfter = $legalBallsBefore + ($isLegalBall ? 1 : 0);
            $oversDecimal = intdiv($legalBallsAfter, 6) + ($legalBallsAfter % 6) / 6;

            if ($innings === 1) {
                $state->team_a_runs += $totalDeliveryRuns;
                if ($params['isWicket']) {
                    $state->team_a_wickets++;
                }
                $state->team_a_overs = $this->oversNotation($legalBallsAfter);
                $state->current_run_rate = $oversDecimal > 0 ? round($state->team_a_runs / $oversDecimal, 2) : 0;
            } else {
                $state->team_b_runs += $totalDeliveryRuns;
                if ($params['isWicket']) {
                    $state->team_b_wickets++;
                }
                $state->team_b_overs = $this->oversNotation($legalBallsAfter);
                $state->current_run_rate = $oversDecimal > 0 ? round($state->team_b_runs / $oversDecimal, 2) : 0;

                if ($state->target_runs) {
                    $runsRemaining = $state->target_runs - $state->team_b_runs;
                    $ballsRemaining = max(0, $state->total_overs * 6 - $legalBallsAfter);
                    $oversRemaining = $ballsRemaining / 6;

                    $state->required_run_rate = ($oversRemaining > 0 && $runsRemaining > 0)
                        ? round($runsRemaining / $oversRemaining, 2)
                        : 0;
                }
            }

            $this->rotateStrike($state, $params, $isLegalBall, $legalBallsAfter, $runsRun);
            $state->save();

            // The first ball of either innings puts the match in play. Leaving
            // `innings_break` out of this kept a match on its break for the
            // whole of the second innings.
            if (in_array($match->status, ['scheduled', 'toss', 'innings_break'], true)) {
                $match->status = 'in_progress';
            }

            if ($innings === 2) {
                $this->concludeChaseIfDecided($match, $state, $legalBallsAfter);
            }

            $match->save();

            $this->recalculateCricketStandings($match->tournament_id);

            return ['state' => $this->cricketState($params['matchId']), 'delivery' => $delivery];
        });
    }

    /**
     * An innings is over when its overs are bowled or its last wicket falls.
     * Without this the console could keep adding balls to a closed innings —
     * a 21st over in a T20, or an eleventh wicket.
     *
     * @throws \RuntimeException when the innings has already finished
     */
    private function assertInningsHasBallsLeft(GameMatch $match, CricketMatchState $state, int $innings): void
    {
        $legalBalls = CricketDelivery::query()
            ->where('match_id', $match->id)
            ->where('innings', $innings)
            ->whereNotIn('extras', ['wide', 'no_ball'])
            ->count();

        if ($legalBalls >= $state->total_overs * 6) {
            throw new \RuntimeException(sprintf(
                'All %d overs of this innings have been bowled.%s',
                $state->total_overs,
                $innings === 1 ? ' Switch innings to start the chase.' : ''
            ));
        }

        $wickets = (int) ($innings === 1 ? $state->team_a_wickets : $state->team_b_wickets);

        if ($wickets >= $this->wicketsToBowlOut($match, $state->batting_team_id)) {
            throw new \RuntimeException($innings === 1
                ? 'The batting side is all out. Switch innings to start the chase.'
                : 'The chasing side is all out — the match is over.');
        }
    }

    /**
     * Strike changes on odd runs, at the end of every completed over, and when a
     * replacement batter is named after a wicket.
     */
    private function rotateStrike(CricketMatchState $state, array $params, bool $isLegalBall, int $legalBallsAfter, int $runsRun): void
    {
        $swap = function () use ($state) {
            [$state->current_striker_id, $state->current_non_striker_id] =
                [$state->current_non_striker_id, $state->current_striker_id];
        };

        if ($runsRun % 2 === 1 && ! $params['isWicket']) {
            $swap();
        }

        if ($isLegalBall && $legalBallsAfter % 6 === 0) {
            $swap();
        }

        if ($params['isWicket'] && ! empty($params['nextStrikerId'])) {
            $state->current_striker_id = $params['nextStrikerId'];
        }
    }

    public function undoLastCricketBall(string $matchId): ?CricketMatchState
    {
        return DB::transaction(function () use ($matchId) {
            $match = GameMatch::find($matchId);

            // Reading the state would create a cricket row for a football match.
            if (! $match || $match->sport_code !== 'cricket') {
                return null;
            }

            $state = $this->cricketState($matchId);

            if (! $state) {
                return null;
            }

            $last = CricketDelivery::query()
                ->where('match_id', $matchId)
                ->orderByDesc('sequence')
                ->first();

            if (! $last) {
                return $state;
            }

            $totalDeliveryRuns = $last->runs_scored + $last->extras_runs;
            $innings = $last->innings;

            // The delivery row records who was where when it was bowled, so
            // undoing it restores exactly that — otherwise the next ball would
            // be credited to whoever the rotation had moved on to.
            if ($last->striker_id) {
                $state->current_striker_id = $last->striker_id;
                $state->current_non_striker_id = $last->non_striker_id ?: null;
            }
            if ($last->bowler_id) {
                $state->current_bowler_id = $last->bowler_id;
            }

            $last->delete();

            $legalCount = CricketDelivery::query()
                ->where('match_id', $matchId)
                ->where('innings', $innings)
                ->whereNotIn('extras', ['wide', 'no_ball'])
                ->count();

            if ($innings === 1) {
                $state->team_a_runs = max(0, $state->team_a_runs - $totalDeliveryRuns);
                if ($last->is_wicket) {
                    $state->team_a_wickets = max(0, $state->team_a_wickets - 1);
                }
                $state->team_a_overs = $this->oversNotation($legalCount);
            } else {
                $state->team_b_runs = max(0, $state->team_b_runs - $totalDeliveryRuns);
                if ($last->is_wicket) {
                    $state->team_b_wickets = max(0, $state->team_b_wickets - 1);
                }
                $state->team_b_overs = $this->oversNotation($legalCount);
            }

            $state->save();

            // A result settled by the ball being undone no longer stands, and
            // undoing the only ball of the second innings puts the match back
            // on its break. Otherwise a scorer's slip on the last ball would
            // lock the match as finished.
            if ($match && $innings === 2) {
                if ($match->status === 'completed') {
                    $match->status = 'in_progress';
                    $match->winner_team_id = null;
                    $match->result_summary = null;
                }

                $secondInningsBalls = CricketDelivery::query()
                    ->where('match_id', $matchId)
                    ->where('innings', 2)
                    ->count();

                if ($secondInningsBalls === 0) {
                    $match->status = 'innings_break';
                }

                $match->save();
            }

            if ($match) {
                $this->recalculateCricketStandings($match->tournament_id);
            }

            return $this->cricketState($matchId);
        });
    }

    /**
     * @throws \RuntimeException when the match does not exist
     */
    public function switchCricketInnings(string $matchId): CricketMatchState
    {
        $match = $this->findCricketMatch($matchId);

        $this->assertNotCancelled($match);

        return DB::transaction(function () use ($matchId, $match) {
            $state = $this->cricketState($matchId);

            if ($state->current_innings === 2) {
                throw new \RuntimeException('The second innings is already under way');
            }

            $state->current_innings = 2;
            $state->target_runs = $state->team_a_runs + 1;
            [$state->batting_team_id, $state->bowling_team_id] = [$state->bowling_team_id, $state->batting_team_id];
            $state->current_striker_id = null;
            $state->current_non_striker_id = null;
            $state->current_bowler_id = null;
            $state->save();

            $match->status = 'innings_break';
            $match->save();

            return $this->cricketState($matchId);
        });
    }

    /**
     * Finish the match on the scorer's word: the chasing side has declared,
     * rain has stopped play for good, or the scorer knows it is over before
     * the engine can tell.
     *
     * Only from the second innings. Finishing during the first would compare a
     * completed total against a chase that never started; an abandoned match is
     * recorded through the match status instead.
     *
     * @throws \RuntimeException when the match doesn't exist, isn't cricket,
     *                            is already finished, or is still in the
     *                            first innings
     */
    public function finishCricketMatch(string $matchId): GameMatch
    {
        return DB::transaction(function () use ($matchId) {
            $match = GameMatch::query()->whereKey($matchId)->lockForUpdate()->first();

            if (! $match || $match->sport_code !== 'cricket') {
                throw new \RuntimeException('Match not found');
            }

            if ($match->status === 'completed') {
                throw new \RuntimeException('This match is already finished');
            }

            $state = $this->cricketState($matchId);

            if ($state->current_innings !== 2) {
                throw new \RuntimeException('Start the second innings before finishing the match');
            }

            $this->settleCricketResult($match, $state);
            $match->save();

            $this->recalculateCricketStandings($match->tournament_id);

            return $match;
        });
    }

    /**
     * End the match once the chase is decided: the target reached, the chasing
     * side all out, or their overs used up. Before this only a successful chase
     * ever finished a match, so a defended total left it open for good.
     */
    private function concludeChaseIfDecided(GameMatch $match, CricketMatchState $state, int $legalBallsAfter): void
    {
        if (! $state->target_runs || $match->status === 'completed') {
            return;
        }

        $chased = $state->team_b_runs >= $state->target_runs;
        $allOut = $state->team_b_wickets >= $this->wicketsToBowlOut($match, $state->batting_team_id);
        $oversUsed = $legalBallsAfter >= $state->total_overs * 6;

        if ($chased || $allOut || $oversUsed) {
            $this->settleCricketResult($match, $state);
        }
    }

    /**
     * Write the result onto the match. Only called during the second innings,
     * so the side batting is the one chasing and the side bowling set the
     * target.
     */
    private function settleCricketResult(GameMatch $match, CricketMatchState $state): void
    {
        $firstInnings = $state->team_a_runs;
        $secondInnings = $state->team_b_runs;
        $chasingId = $state->batting_team_id;
        $defendingId = $state->bowling_team_id;

        $match->status = 'completed';

        if ($secondInnings > $firstInnings) {
            $margin = max(0, $this->wicketsToBowlOut($match, $chasingId) - $state->team_b_wickets);
            $match->winner_team_id = $chasingId;
            $match->result_summary = sprintf(
                '%s won by %d %s',
                Team::query()->whereKey($chasingId)->value('name') ?: 'Chasing side',
                $margin,
                $margin === 1 ? 'wicket' : 'wickets',
            );
        } elseif ($secondInnings < $firstInnings) {
            $margin = $firstInnings - $secondInnings;
            $match->winner_team_id = $defendingId;
            $match->result_summary = sprintf(
                '%s won by %d %s',
                Team::query()->whereKey($defendingId)->value('name') ?: 'Defending side',
                $margin,
                $margin === 1 ? 'run' : 'runs',
            );
        } else {
            $match->winner_team_id = null;
            $match->result_summary = 'Match tied';
        }
    }

    /**
     * Wickets that end an innings: one fewer than the players in the side's
     * match-day sheet. A village side fielding eight is all out at seven, not
     * at the ten a full eleven would need.
     */
    private function wicketsToBowlOut(GameMatch $match, ?string $teamId): int
    {
        $playing = $teamId ? count($this->lineups->playingFor($match, $teamId)) : 0;

        return $playing > 1 ? $playing - 1 : 10;
    }

    public function recalculateCricketStandings(string $tournamentId): void
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament || $tournament->sport_code !== 'cricket') {
            return;
        }

        $teams = Team::query()->where('tournament_id', $tournamentId)->where('status', 'approved')->get();
        $matches = GameMatch::query()->where('tournament_id', $tournamentId)->get();
        $states = CricketMatchState::query()
            ->whereIn('match_id', $matches->pluck('id'))
            ->get()
            ->keyBy('match_id');

        foreach ($teams as $team) {
            $played = $won = $lost = $noResult = $points = 0;
            $runsScored = $runsConceded = 0;
            $oversFaced = $oversBowled = 0.0;
            $form = [];

            foreach ($matches as $match) {
                $state = $states->get($match->id);

                if (! $state || ($match->team_a_id !== $team->id && $match->team_b_id !== $team->id)) {
                    continue;
                }

                if (! in_array($match->status, ['in_progress', 'completed', 'innings_break'], true)) {
                    continue;
                }

                $played++;

                // `team_a_*` / `team_b_*` on the state row are really the
                // first- and second-innings tallies, not team A's and team B's
                // — which innings a side batted in is decided by the toss. Key
                // off that, or every net run rate flips whenever the toss put
                // team B in first.
                $battedFirst = ($match->batting_first_team_id ?: $match->team_a_id) === $team->id;

                $runsScored += $battedFirst ? $state->team_a_runs : $state->team_b_runs;
                $oversFaced += $battedFirst ? $state->team_a_overs : $state->team_b_overs;
                $runsConceded += $battedFirst ? $state->team_b_runs : $state->team_a_runs;
                $oversBowled += $battedFirst ? $state->team_b_overs : $state->team_a_overs;

                if ($match->winner_team_id === $team->id) {
                    $won++;
                    $points += 2;
                    $form[] = 'W';
                } elseif ($match->winner_team_id) {
                    $lost++;
                    $form[] = 'L';
                } elseif (in_array($match->status, ['abandoned', 'cancelled'], true)) {
                    $noResult++;
                    $points += 1;
                    $form[] = 'NR';
                }
            }

            $battingRate = $oversFaced > 0 ? $runsScored / $oversFaced : 0;
            $bowlingRate = $oversBowled > 0 ? $runsConceded / $oversBowled : 0;

            $this->upsertStanding($tournamentId, $team->id, 'std_crick', [
                'organization_id' => $tournament->organization_id,
                'played' => $played,
                'won' => $won,
                'drawn' => 0,
                'lost' => $lost,
                'no_result' => $noResult,
                'runs_scored' => $runsScored,
                'overs_faced' => $oversFaced,
                'runs_conceded' => $runsConceded,
                'overs_bowled' => $oversBowled,
                'net_run_rate' => round($battingRate - $bowlingRate, 3),
                'points' => $points,
                'form' => array_slice($form, -5),
            ]);
        }

        $this->rankStandings($tournamentId, fn ($a, $b) => [$b->points, $b->net_run_rate] <=> [$a->points, $a->net_run_rate]);
    }

    /* ---------------------------------------------------------------------
     | Shared helpers
     * -------------------------------------------------------------------*/

    /**
     * Insert or refresh a team's row in the tournament table, keeping the
     * identifier stable once assigned.
     */
    private function upsertStanding(string $tournamentId, string $teamId, string $idPrefix, array $values): void
    {
        $standing = Standing::query()->firstOrNew([
            'tournament_id' => $tournamentId,
            'team_id' => $teamId,
        ]);

        if (! $standing->exists) {
            $standing->id = Ids::unique($idPrefix);
        }

        $standing->fill($values)->save();
    }

    private function rankStandings(string $tournamentId, callable $comparator): void
    {
        $standings = Standing::query()->where('tournament_id', $tournamentId)->get()->all();
        usort($standings, $comparator);

        foreach ($standings as $index => $standing) {
            $standing->rank = $index + 1;
            $standing->save();
        }
    }

    /**
     * Cricket overs read as `overs.balls` (14.3 means fourteen overs, three balls)
     * rather than as a true decimal.
     */
    private function oversNotation(int $legalBalls): float
    {
        return (float) (intdiv($legalBalls, 6).'.'.($legalBalls % 6));
    }

    private function nextFootballSequence(string $matchId): int
    {
        return ((int) FootballEvent::query()->where('match_id', $matchId)->max('sequence')) + 1;
    }

    private function nextCricketSequence(string $matchId): int
    {
        return ((int) CricketDelivery::query()->where('match_id', $matchId)->max('sequence')) + 1;
    }

    /**
     * A cancelled match is frozen: scoring into it would silently flip it back
     * to in_progress through the scheduled→in_progress promotion above.
     */
    private function assertNotCancelled(GameMatch $match): void
    {
        if ($match->status === 'cancelled') {
            throw new \RuntimeException('This match has been cancelled');
        }
    }

    /**
     * A finished match takes no more play: a goal or a ball recorded after the
     * result would change the score under a result that no longer matches it.
     * Corrections go through undo (and, for football, reopening the match).
     */
    private function assertNotCompleted(GameMatch $match): void
    {
        if ($match->status === 'completed') {
            throw new \RuntimeException('This match is finished. Undo the last entry or reopen the match to change it.');
        }
    }

    /**
     * @throws \RuntimeException when there is no such match, or it is cricket —
     *                            a football event on a cricket match would
     *                            quietly create a scoreline nobody can see
     */
    private function findFootballMatch(string $matchId): GameMatch
    {
        $match = GameMatch::find($matchId);

        if (! $match || $match->sport_code !== 'football') {
            throw new \RuntimeException('Football match not found');
        }

        return $match;
    }

    /** @throws \RuntimeException when there is no such match, or it is football */
    private function findCricketMatch(string $matchId): GameMatch
    {
        $match = GameMatch::find($matchId);

        if (! $match || $match->sport_code !== 'cricket') {
            throw new \RuntimeException('Cricket match not found');
        }

        return $match;
    }
}
