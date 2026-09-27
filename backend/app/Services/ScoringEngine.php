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
use App\Services\Fixtures\BracketService;
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
    public function __construct(
        private readonly LineupService $lineups,
        private readonly BracketService $brackets,
    ) {}

    /* ---------------------------------------------------------------------
     | Football
     * -------------------------------------------------------------------*/

    /** Event types that put the ball in the net, and so need a scorer on the pitch. */
    private const FOOTBALL_SCORING_EVENTS = ['goal', 'penalty_goal'];

    /** Every event that changes the scoreline, own goals included. */
    private const FOOTBALL_GOAL_EVENTS = ['goal', 'penalty_goal', 'own_goal'];

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

        // Nothing happens on the pitch before the kick-off. Letting an event
        // start the match put a score on the big screen next to a clock that
        // had never run, and skipped the toss entirely.
        if (in_array($match->status, ['scheduled', 'toss'], true)) {
            throw new \RuntimeException('The match has not kicked off yet. Start the clock first.');
        }

        return DB::transaction(function () use ($params, $match) {
            $this->lockMatch($match->id);

            $state = $this->footballState($match->id);

            if ($state->current_half === 'half_time' && in_array($params['eventType'], self::FOOTBALL_GOAL_EVENTS, true)) {
                throw new \RuntimeException('It is half time. Start the second half before recording a goal.');
            }

            // A shoot-out is kicks, scored or missed — nothing else is played in it.
            $shootOut = $state->current_half === 'penalties';

            if ($shootOut && ! in_array($params['eventType'], ['penalty_goal', 'penalty_missed', 'yellow_card', 'red_card'], true)) {
                throw new \RuntimeException('During the shoot-out, record each kick as a penalty scored or missed.');
            }

            $params = $this->validateFootballEvent($match, $state, $params);

            // Left out, the minute is read off the clock: the minute a goal
            // goes in is the one the clock is *in*, so 0:40 is the 1st minute.
            $minute = $params['minute'] ?? intdiv($state->clock_seconds, 60) + 1;

            $event = FootballEvent::create([
                'period' => $state->current_half,
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
            $this->applyGoal($state, $match, $event, 1);
            $state->save();

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
            $this->lockMatch($match->id);

            $state = $this->footballState($match->id);

            $last = FootballEvent::query()
                ->where('match_id', $match->id)
                ->orderByDesc('sequence')
                ->first();

            if (! $last) {
                return $state;
            }

            $this->applyGoal($state, $match, $last, -1);
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
     * scoreline. Own goals credit the opposing side. A kick scored in the
     * shoot-out goes to the shoot-out tally, never the score.
     */
    private function applyGoal(FootballMatchState $state, GameMatch $match, FootballEvent $event, int $direction): void
    {
        $eventType = $event->event_type;
        $teamId = $event->team_id;

        if ($event->period === 'penalties') {
            if ($eventType === 'penalty_goal') {
                $column = $teamId === $match->team_a_id ? 'team_a_penalties' : 'team_b_penalties';
                $state->{$column} = max(0, (int) $state->{$column} + $direction);
            }

            return;
        }

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

        // Kicking off (by `start` or straight into a period) is where the match
        // begins, and it can't begin before the toss has said who kicks off.
        if (in_array($action, ['start', 'set_half'], true) && in_array($match->status, ['scheduled', 'toss'], true)) {
            $this->assertTossDone($match);
        }

        // Ending a match that never kicked off would enter a 0-0 draw into the
        // table; a match that didn't happen is cancelled or a walkover instead.
        if (in_array($action, ['finish', 'half_time'], true) && in_array($match->status, ['scheduled', 'toss'], true)) {
            throw new \RuntimeException('The match has not kicked off yet. Start the clock first.');
        }

        return DB::transaction(function () use ($match, $action, $payload) {
            $this->lockMatch($match->id);

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

                    if ($half === 'penalties'
                        && (Tournament::find($match->tournament_id)?->settings['enable_penalty_shootout'] ?? true) === false) {
                        throw new \RuntimeException('This tournament does not settle matches with a penalty shoot-out.');
                    }

                    $this->stopClock($state);
                    $state->current_half = $half;

                    // A shoot-out has no clock, and its tally starts at nil;
                    // every other period starts with the clock set to where
                    // that period begins, and running.
                    if ($half === 'penalties') {
                        $state->team_a_penalties ??= 0;
                        $state->team_b_penalties ??= 0;
                    } else {
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
     * through here.
     *
     * `extra_time_minutes` is the whole extra-time period, matching
     * `match_duration_minutes` next to it in the settings, so one extra-time
     * half is half of it. Unset, extra-time halves fall back to a third of a
     * normal half (15 of 45).
     */
    public function footballPeriodStart(GameMatch $match, string $period): int
    {
        $settings = Tournament::find($match->tournament_id)?->settings ?? [];
        $half = (int) ($settings['half_duration_minutes'] ?? 0);

        if ($half <= 0) {
            $full = (int) ($settings['match_duration_minutes'] ?? 0);
            $half = $full > 0 ? intdiv($full, 2) : 45;
        }

        $extraTotal = (int) ($settings['extra_time_minutes'] ?? 0);
        $extra = $extraTotal > 0
            ? max(1, intdiv($extraTotal, 2))
            : max(1, (int) round($half / 3));

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
            // Level after play: a shoot-out, if one was taken, decides it.
            $penA = (int) $state->team_a_penalties;
            $penB = (int) $state->team_b_penalties;

            if ($penA !== $penB) {
                $winnerId = $penA > $penB ? $match->team_a_id : $match->team_b_id;
                $match->winner_team_id = $winnerId;
                $match->result_summary = sprintf(
                    '%s won %d - %d on penalties (%d - %d)',
                    Team::query()->whereKey($winnerId)->value('name') ?: ($penA > $penB ? 'Team A' : 'Team B'),
                    max($penA, $penB),
                    min($penA, $penB),
                    $a,
                    $b,
                );

                return;
            }

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
        $matches = $this->tableMatches(GameMatch::query()->where('tournament_id', $tournamentId)->get());
        $states = FootballMatchState::query()
            ->whereIn('match_id', $matches->pluck('id'))
            ->get()
            ->keyBy('match_id');

        [$forWin, $forDraw, $forLoss] = $this->tablePoints($tournament, 3);
        $cards = $this->disciplinaryPoints($matches->pluck('id')->all());

        foreach ($teams as $team) {
            $played = $won = $drawn = $lost = $goalsFor = $goalsAgainst = $points = 0;
            $form = [];

            foreach ($matches as $match) {
                $state = $states->get($match->id);

                if ($match->team_a_id !== $team->id && $match->team_b_id !== $team->id) {
                    continue;
                }

                // A live match counts on its current score (the table moves
                // with play); a finished one on its recorded result, which is
                // also what a walkover or an organizer's correction sets — a
                // result entered by hand has no goals on the state row to go on.
                $finished = $match->status === 'completed';

                if (! in_array($match->status, ['in_progress', 'completed', 'half_time'], true) || (! $state && ! $finished)) {
                    continue;
                }

                $played++;
                $isTeamA = $match->team_a_id === $team->id;
                $mine = $state ? ($isTeamA ? $state->team_a_score : $state->team_b_score) : 0;
                $theirs = $state ? ($isTeamA ? $state->team_b_score : $state->team_a_score) : 0;

                $goalsFor += $mine;
                $goalsAgainst += $theirs;

                if ($finished) {
                    [$mine, $theirs] = match (true) {
                        ! $match->winner_team_id => [0, 0],
                        $match->winner_team_id === $team->id => [1, 0],
                        default => [0, 1],
                    };
                }

                if ($mine > $theirs) {
                    $won++;
                    $points += $forWin;
                    $form[] = 'W';
                } elseif ($mine === $theirs) {
                    $drawn++;
                    $points += $forDraw;
                    $form[] = 'D';
                } else {
                    $lost++;
                    $points += $forLoss;
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
                'disciplinary_points' => $cards[$team->id] ?? 0,
                'form' => array_slice($form, -5),
            ]);
        }

        // Level on points and on the head-to-head mini-table: goal difference,
        // then goals scored, then the cleaner card record.
        $this->rankStandings($tournamentId, fn (Standing $s) => [
            (int) $s->goal_difference,
            (int) $s->goals_for,
        ]);
    }

    /* ---------------------------------------------------------------------
     | Cricket
     * -------------------------------------------------------------------*/

    public function cricketState(string $matchId): ?CricketMatchState
    {
        $state = CricketMatchState::query()->where('match_id', $matchId)->first();
        $match = GameMatch::find($matchId);

        if ($state) {
            // The row is made the first time anyone looks at the match — the
            // public hub, the scorer opening the console — which is usually
            // before the toss. Until a ball is bowled, who bats and how long
            // the innings is still follow the toss and the settings; otherwise
            // a side put in by the toss would be scored as the other one and
            // the result credited to the wrong team.
            if ($match && ! $state->deliveries()->exists() && (int) $state->current_innings === 1) {
                [$battingTeamId, $bowlingTeamId] = $this->firstInningsSides($match);
                $state->batting_team_id = $battingTeamId;
                $state->bowling_team_id = $bowlingTeamId;
                $state->total_overs = $this->configuredOvers($match);

                if ($state->isDirty()) {
                    $state->save();
                }
            }

            return $state->load('deliveries');
        }

        if (! $match) {
            return null;
        }

        [$battingTeamId, $bowlingTeamId] = $this->firstInningsSides($match);

        return CricketMatchState::create([
            'id' => Ids::unique('crick_state'),
            'match_id' => $matchId,
            'total_overs' => $this->configuredOvers($match),
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
     * Who bats first is decided by the pre-match coin toss (TossService,
     * recorded on `matches`); before that's set, team A, so a state row can
     * still be inspected pre-toss.
     *
     * @return array{0: string, 1: string} batting, bowling
     */
    private function firstInningsSides(GameMatch $match): array
    {
        $battingTeamId = $match->batting_first_team_id ?: $match->team_a_id;
        $bowlingTeamId = $battingTeamId === $match->team_a_id ? $match->team_b_id : $match->team_a_id;

        return [(string) $battingTeamId, (string) $bowlingTeamId];
    }

    /** A T10 village cup and a T20 league both run through here: the tournament's own innings length. */
    private function configuredOvers(GameMatch $match): int
    {
        $totalOvers = (int) (Tournament::find($match->tournament_id)?->settings['total_overs'] ?? 20);

        return $totalOvers > 0 ? $totalOvers : 20;
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

        // The first ball starts the match, and who bats is the toss's to say.
        if (in_array($match->status, ['scheduled', 'toss'], true)) {
            $this->assertTossDone($match);
        }

        return DB::transaction(function () use ($params, $match) {
            $this->lockMatch($match->id);

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

            $this->assertDismissalFitsDelivery($params, $extras);

            $isLegalBall = ! in_array($extras, ['wide', 'no_ball'], true);
            // Retiring hurt takes a batter off but is not a wicket: it doesn't
            // bring a side closer to all out.
            $fallsWicket = $params['isWicket'] && ($params['wicketType'] ?? null) !== 'retired_hurt';
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
                if ($fallsWicket) {
                    $state->team_a_wickets++;
                }
                $state->team_a_overs = $this->oversNotation($legalBallsAfter);
                $state->current_run_rate = $oversDecimal > 0 ? round($state->team_a_runs / $oversDecimal, 2) : 0;
            } else {
                $state->team_b_runs += $totalDeliveryRuns;
                if ($fallsWicket) {
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

        // The new batter takes the dismissed batter's place — which is the
        // non-striker's end when the non-striker was run out. Replacing the
        // striker every time left the run-out batter at the crease and sent
        // the batter who wasn't out back to the pavilion.
        if ($params['isWicket'] && ! empty($params['nextStrikerId'])) {
            $dismissed = $params['dismissedPlayerId'] ?? null;

            if ($dismissed && $dismissed === $state->current_non_striker_id) {
                $state->current_non_striker_id = $params['nextStrikerId'];
            } else {
                $state->current_striker_id = $params['nextStrikerId'];
            }
        }

        // Ends change at the end of the over, after the new batter is in.
        if ($isLegalBall && $legalBallsAfter % 6 === 0) {
            $swap();
        }
    }

    /**
     * Only some dismissals can happen off a wide or a no-ball: a batter can't
     * be bowled or caught off a no-ball, nor bowled off a wide.
     */
    private function assertDismissalFitsDelivery(array $params, string $extras): void
    {
        if (! $params['isWicket']) {
            return;
        }

        $allowed = match ($extras) {
            'wide' => ['stumped', 'run_out', 'hit_wicket', 'obstructing_field', 'retired_hurt'],
            'no_ball' => ['run_out', 'obstructing_field', 'retired_hurt'],
            default => null,
        };

        if ($allowed !== null && ! in_array($params['wicketType'] ?? null, $allowed, true)) {
            throw new \RuntimeException($extras === 'wide'
                ? 'Off a wide, a batter can only be stumped, run out, out hit wicket or obstructing the field.'
                : 'Off a no-ball, a batter can only be run out or out obstructing the field.');
        }
    }

    public function undoLastCricketBall(string $matchId): ?CricketMatchState
    {
        return DB::transaction(function () use ($matchId) {
            $this->lockMatch($matchId);

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
            $innings = (int) $last->innings;

            // Innings switched but the chase not started: the ball being taken
            // back is the first innings' last, so the switch is undone with it —
            // back to the first innings, sides as they were, no target. Left as
            // it was, the ball came off the total but the console stayed in the
            // second innings and refused to score the first one again.
            if ($innings === 1 && (int) $state->current_innings === 2) {
                $state->current_innings = 1;
                [$state->batting_team_id, $state->bowling_team_id] = [$state->bowling_team_id, $state->batting_team_id];
                $state->target_runs = null;
                $state->required_run_rate = 0;

                if (in_array($match->status, ['innings_break', 'completed'], true)) {
                    $match->status = 'in_progress';
                    $match->winner_team_id = null;
                    $match->result_summary = null;
                    $match->save();
                }
            }

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
                if ($last->is_wicket && $last->wicket_type !== 'retired_hurt') {
                    $state->team_a_wickets = max(0, $state->team_a_wickets - 1);
                }
                $state->team_a_overs = $this->oversNotation($legalCount);
            } else {
                $state->team_b_runs = max(0, $state->team_b_runs - $totalDeliveryRuns);
                if ($last->is_wicket && $last->wicket_type !== 'retired_hurt') {
                    $state->team_b_wickets = max(0, $state->team_b_wickets - 1);
                }
                $state->team_b_overs = $this->oversNotation($legalCount);
            }

            // The rates on screen follow the ball taken back, as they follow one bowled.
            $runs = $innings === 1 ? $state->team_a_runs : $state->team_b_runs;
            $oversDecimal = $legalCount / 6;
            $state->current_run_rate = $oversDecimal > 0 ? round($runs / $oversDecimal, 2) : 0;

            if ($innings === 2 && $state->target_runs) {
                $runsRemaining = $state->target_runs - $state->team_b_runs;
                $oversRemaining = max(0, $state->total_overs * 6 - $legalCount) / 6;
                $state->required_run_rate = ($oversRemaining > 0 && $runsRemaining > 0) ? round($runsRemaining / $oversRemaining, 2) : 0;
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
            $this->lockMatch($matchId);

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
        $matches = $this->tableMatches(GameMatch::query()->where('tournament_id', $tournamentId)->get());
        $states = CricketMatchState::query()
            ->whereIn('match_id', $matches->pluck('id'))
            ->get()
            ->keyBy('match_id');

        [$forWin, $forNoResult, $forLoss] = $this->tablePoints($tournament, 2);

        foreach ($teams as $team) {
            $played = $won = $lost = $tied = $noResult = $points = 0;
            $runsScored = $runsConceded = 0;
            $oversFaced = $oversBowled = 0.0;
            $form = [];

            foreach ($matches as $match) {
                $state = $states->get($match->id);

                if ($match->team_a_id !== $team->id && $match->team_b_id !== $team->id) {
                    continue;
                }

                // `abandoned` belongs here: the no-result branch below shares a
                // point out for a match rained off. `cancelled` stays out — a
                // match called off before a ball was bowled is not a fixture
                // either side played. A match abandoned before a ball has no
                // state row, and is still a no result.
                if (! in_array($match->status, ['in_progress', 'completed', 'innings_break', 'abandoned'], true)
                    || (! $state && $match->status !== 'abandoned')) {
                    continue;
                }

                $played++;

                if ($state) {
                    // `team_a_*` / `team_b_*` on the state row are really the
                    // first- and second-innings tallies, not team A's and team
                    // B's — which innings a side batted in is decided by the
                    // toss. Key off that, or every net run rate flips whenever
                    // the toss put team B in first.
                    $battedFirst = ($match->batting_first_team_id ?: $match->team_a_id) === $team->id;

                    $runsScored += $battedFirst ? $state->team_a_runs : $state->team_b_runs;
                    $oversFaced += $this->oversAsDecimal($battedFirst ? $state->team_a_overs : $state->team_b_overs);
                    $runsConceded += $battedFirst ? $state->team_b_runs : $state->team_a_runs;
                    $oversBowled += $this->oversAsDecimal($battedFirst ? $state->team_b_overs : $state->team_a_overs);
                }

                if ($match->winner_team_id === $team->id) {
                    $won++;
                    $points += $forWin;
                    $form[] = 'W';
                } elseif ($match->winner_team_id) {
                    $lost++;
                    $points += $forLoss;
                    $form[] = 'L';
                } elseif ($match->status === 'abandoned') {
                    $noResult++;
                    $points += $forNoResult;
                    $form[] = 'NR';
                } elseif ($match->status === 'completed') {
                    // Finished level (and no super over): a tie shares the
                    // points the same way a no result does.
                    $tied++;
                    $points += $forNoResult;
                    $form[] = 'T';
                }
            }

            $battingRate = $oversFaced > 0 ? $runsScored / $oversFaced : 0;
            $bowlingRate = $oversBowled > 0 ? $runsConceded / $oversBowled : 0;

            $this->upsertStanding($tournamentId, $team->id, 'std_crick', [
                'organization_id' => $tournament->organization_id,
                // The bracket reads a group's qualifiers off this column.
                'group_name' => $team->group_name ?: 'Group A',
                'played' => $played,
                'won' => $won,
                'drawn' => $tied,
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

        // Net run rate is cricket's separator once the head-to-head is level.
        // Scaled to an integer because the comparison is done on whole numbers.
        $this->rankStandings($tournamentId, fn (Standing $s) => [
            (int) round((float) $s->net_run_rate * 1000),
        ]);
    }

    /* ---------------------------------------------------------------------
     | Shared helpers
     * -------------------------------------------------------------------*/

    /**
     * What a win, a share and a defeat are worth in this tournament's table.
     *
     * Organizers have always been able to save `points_win` / `points_draw` /
     * `points_loss`; nothing read them, so every table ran on 3/1/0 (football)
     * and 2/1/0 (cricket) whatever was configured. The middle value is a draw
     * in football and a tie or no result in cricket.
     *
     * @return array{0: int, 1: int, 2: int}
     */
    private function tablePoints(Tournament $tournament, int $defaultWin): array
    {
        $settings = $tournament->settings ?? [];

        return [
            (int) ($settings['points_win'] ?? $defaultWin),
            (int) ($settings['points_draw'] ?? 1),
            (int) ($settings['points_loss'] ?? 0),
        ];
    }

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

    /**
     * Order the table, resolving ties the way a competition actually does.
     *
     * Points first, and then — for the teams that are level — a mini-table of
     * only the matches they played against each other, before falling back to
     * the sport's own separator (goal difference, or net run rate) and finally
     * the cleaner disciplinary record.
     *
     * Head-to-head cannot be a comparator: "A beat B" says nothing about how
     * either compares to C, so feeding it to `usort` gives an order that depends
     * on which pairs happen to get compared. It has to be applied to a group of
     * level teams as a group, which is what this does.
     *
     * @param  callable(Standing): array<int, int|float>  $separators  sport-specific, best first
     */
    private function rankStandings(string $tournamentId, callable $separators): void
    {
        // A team that was withdrawn, rejected or suspended after playing keeps
        // its row otherwise, and is ranked — and can "qualify" — as if it
        // were still in. The table is the approved teams.
        $approved = Team::query()->where('tournament_id', $tournamentId)->where('status', 'approved')->pluck('id');
        Standing::query()->where('tournament_id', $tournamentId)->whereNotIn('team_id', $approved)->delete();

        $standings = Standing::query()->where('tournament_id', $tournamentId)->get()->all();

        if (! $standings) {
            return;
        }

        $headToHead = $this->headToHeadRecords($tournamentId);

        // Points decide the groups; everything else only ever reorders within one.
        usort($standings, fn (Standing $a, Standing $b) => $b->points <=> $a->points);

        $ordered = [];

        foreach ($this->groupBy($standings, fn (Standing $s) => (string) $s->points) as $level) {
            $ordered = [...$ordered, ...$this->breakTie($level, $headToHead, $separators)];
        }

        foreach ($ordered as $index => $standing) {
            $standing->rank = $index + 1;
            $standing->save();
        }

        // Every path that changes a result ends up here — scoring, an undo, a
        // reopened match, a manually corrected winner — which makes this the one
        // place a bracket can be moved on from without a path being missed. It
        // recomputes rather than advances, so undoing a semi-final takes the
        // wrong team back out of the final. After the ranking, because a group's
        // qualifiers are read off the ranks this just wrote.
        $this->brackets->sync($tournamentId);
    }

    /**
     * Order teams that are level on points.
     *
     * @param  array<int, Standing>  $level
     * @param  array<string, array<string, array{points: int, difference: int, scored: int}>>  $headToHead
     * @return array<int, Standing>
     */
    private function breakTie(array $level, array $headToHead, callable $separators): array
    {
        if (count($level) < 2) {
            return $level;
        }

        $ids = array_map(fn (Standing $s) => (string) $s->team_id, $level);

        // The mini-table: only results between the teams that are level.
        $mini = [];

        foreach ($ids as $teamId) {
            $mini[$teamId] = ['points' => 0, 'difference' => 0, 'scored' => 0];

            foreach ($ids as $opponentId) {
                $record = $headToHead[$teamId][$opponentId] ?? null;

                if (! $record) {
                    continue;
                }

                $mini[$teamId]['points'] += $record['points'];
                $mini[$teamId]['difference'] += $record['difference'];
                $mini[$teamId]['scored'] += $record['scored'];
            }
        }

        usort($level, function (Standing $a, Standing $b) use ($mini, $separators) {
            $left = $mini[(string) $a->team_id];
            $right = $mini[(string) $b->team_id];

            return [
                $right['points'], $right['difference'], $right['scored'],
                ...$separators($b),
                // Fewest cards, so this one is ascending.
                -1 * (int) $b->disciplinary_points,
            ] <=> [
                $left['points'], $left['difference'], $left['scored'],
                ...$separators($a),
                -1 * (int) $a->disciplinary_points,
            ];
        });

        return $level;
    }

    /**
     * Fair-play points per team, off the card log.
     *
     * Derived rather than counted as it happens, for the same reason player
     * statistics are: undoing a card has to undo its effect on the table, and a
     * stored counter would have to be decremented by hand.
     *
     * @param  array<int, string>  $matchIds
     * @return array<string, int>
     */
    private function disciplinaryPoints(array $matchIds): array
    {
        if (! $matchIds) {
            return [];
        }

        // The two cards a scorer can record. A yellow is one, a sending-off
        // three — the usual weighting, and it keeps a single red above two
        // yellows, which is the comparison this exists to settle.
        $weights = ['yellow_card' => 1, 'red_card' => 3];

        $events = FootballEvent::query()
            ->whereIn('match_id', $matchIds)
            ->whereIn('event_type', array_keys($weights))
            ->get(['team_id', 'event_type']);

        $totals = [];

        foreach ($events as $event) {
            $totals[$event->team_id] = ($totals[$event->team_id] ?? 0) + $weights[$event->event_type];
        }

        return $totals;
    }

    /**
     * What each team did against each other team: points won, goal or run
     * difference, and how many they scored.
     *
     * Read once per ranking rather than per comparison — a comparator hitting
     * the database is how a table of sixteen becomes a hundred queries.
     *
     * @return array<string, array<string, array{points: int, difference: int, scored: int}>>
     */
    private function headToHeadRecords(string $tournamentId): array
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament) {
            return [];
        }

        $football = $tournament->sport_code === 'football';
        [$forWin, $forDraw, $forLoss] = $this->tablePoints($tournament, $football ? 3 : 2);

        $matches = $this->tableMatches(GameMatch::query()
            ->where('tournament_id', $tournamentId)
            ->get())
            ->whereIn('status', ['completed', 'in_progress', 'half_time', 'innings_break'])
            ->values();

        if ($matches->isEmpty()) {
            return [];
        }

        $states = $football
            ? FootballMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id')
            : CricketMatchState::query()->whereIn('match_id', $matches->pluck('id'))->get()->keyBy('match_id');

        $records = [];

        foreach ($matches as $match) {
            $state = $states->get($match->id);

            $finished = $match->status === 'completed';

            if ((! $state && ! $finished) || ! $match->team_a_id || ! $match->team_b_id) {
                continue;
            }

            [$scoreA, $scoreB] = match (true) {
                ! $state => [0, 0],
                $football => [(int) $state->team_a_score, (int) $state->team_b_score],
                default => $this->cricketScoresByTeam($match, $state),
            };

            foreach ([[$match->team_a_id, $match->team_b_id, $scoreA, $scoreB], [$match->team_b_id, $match->team_a_id, $scoreB, $scoreA]] as [$teamId, $opponentId, $mine, $theirs]) {
                $records[$teamId][$opponentId] ??= ['points' => 0, 'difference' => 0, 'scored' => 0];

                // A finished match's recorded result decides the points, as it
                // does in the table itself (walkovers, corrections, shoot-outs).
                $outcome = $finished
                    ? ($match->winner_team_id ? ($match->winner_team_id === $teamId ? 1 : -1) : 0)
                    : $mine <=> $theirs;

                $records[$teamId][$opponentId]['points'] += match ($outcome) {
                    1 => $forWin,
                    0 => $forDraw,
                    default => $forLoss,
                };
                $records[$teamId][$opponentId]['difference'] += $mine - $theirs;
                $records[$teamId][$opponentId]['scored'] += $mine;
            }
        }

        return $records;
    }

    /**
     * Runs for and against the *teams*, not the innings.
     *
     * The state row's `team_a_*` columns hold the first and second innings, and
     * which side batted first is decided by the toss — the same trap the net run
     * rate calculation has to avoid.
     *
     * @return array{0: int, 1: int}
     */
    private function cricketScoresByTeam(GameMatch $match, CricketMatchState $state): array
    {
        $aBattedFirst = ($match->batting_first_team_id ?: $match->team_a_id) === $match->team_a_id;

        return $aBattedFirst
            ? [(int) $state->team_a_runs, (int) $state->team_b_runs]
            : [(int) $state->team_b_runs, (int) $state->team_a_runs];
    }

    /**
     * @param  array<int, Standing>  $items
     * @return array<int, array<int, Standing>>
     */
    /**
     * The matches the table is made of. Once a tournament has a league or
     * group stage, its knockout rounds are played for the trophy, not for
     * points — a semi-final used to add a win to the group table. A pure
     * knockout has nothing else, so its matches stay.
     *
     * @param  \Illuminate\Support\Collection<int, GameMatch>  $matches
     * @return \Illuminate\Support\Collection<int, GameMatch>
     */
    private function tableMatches($matches)
    {
        $league = $matches->filter(fn (GameMatch $match) => $match->bracket_round === null);

        return $league->isNotEmpty() ? $league->values() : $matches;
    }

    private function groupBy(array $items, callable $key): array
    {
        $groups = [];

        foreach ($items as $item) {
            $groups[$key($item)][] = $item;
        }

        return array_values($groups);
    }

    /**
     * Cricket overs read as `overs.balls` (14.3 means fourteen overs, three balls)
     * rather than as a true decimal.
     */
    /** "12.3" overs is twelve and a half overs, not 12.3 of them. */
    private function oversAsDecimal(float|int|string|null $notation): float
    {
        $notation = (float) $notation;
        $overs = (int) floor($notation);

        return $overs + (int) round(($notation - $overs) * 10) / 6;
    }

    private function oversNotation(int $legalBalls): float
    {
        return (float) (intdiv($legalBalls, 6).'.'.($legalBalls % 6));
    }

    /**
     * Serialize every write to one match.
     *
     * Each action reads the state row and the log's last sequence, then writes
     * both back. Two consoles scoring at once (scorer and organizer, or a retry
     * after a slow answer) would otherwise read the same state: one ball's runs
     * vanish from the score while both rows stay in the log under one sequence
     * number, and undo reverses the wrong one. Called first inside the
     * transaction, so the lock is held until it commits.
     */
    private function lockMatch(string $matchId): void
    {
        GameMatch::query()->whereKey($matchId)->lockForUpdate()->first(['id']);
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

    /** A match can't begin until the toss winner has made their choice. */
    private function assertTossDone(GameMatch $match): void
    {
        if (! $match->toss_decision) {
            throw new \RuntimeException('Record the toss before the match starts.');
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
