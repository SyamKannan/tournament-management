<?php

namespace App\Services;

use App\Models\CricketDelivery;
use App\Models\CricketMatchState;
use App\Models\FootballEvent;
use App\Models\FootballMatchState;
use App\Models\GameMatch;
use App\Models\PlayerStat;
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
 * effect into the state row, syncs the players' career statistics, and
 * recomputes the tournament table — so undo is just "drop the last log entry and
 * reverse its effect".
 */
class ScoringEngine
{
    public function __construct(private readonly LineupService $lineups) {}

    /* ---------------------------------------------------------------------
     | Football
     * -------------------------------------------------------------------*/

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
                'is_timer_running' => false,
            ]);
        }

        return $state->load('events');
    }

    /**
     * @param  array{matchId: string, teamId: string, playerId: ?string, eventType: string, minute: int, assistPlayerId?: ?string, subInPlayerId?: ?string, subOutPlayerId?: ?string, extraInfo?: ?string}  $params
     * @return array{state: FootballMatchState, event: FootballEvent}
     *
     * @throws \RuntimeException when the match does not exist
     */
    public function addFootballEvent(array $params): array
    {
        $match = GameMatch::find($params['matchId']);

        if (! $match) {
            throw new \RuntimeException('Match not found');
        }

        $this->assertNotCancelled($match);

        return DB::transaction(function () use ($params, $match) {
            $state = $this->footballState($params['matchId']);

            $event = FootballEvent::create([
                'id' => Ids::unique('ev'),
                'match_id' => $params['matchId'],
                'sequence' => $this->nextFootballSequence($params['matchId']),
                'team_id' => $params['teamId'],
                'player_id' => $params['playerId'] ?? '',
                'event_type' => $params['eventType'],
                'minute' => $params['minute'],
                'assist_player_id' => $params['assistPlayerId'] ?? null,
                'sub_in_player_id' => $params['subInPlayerId'] ?? null,
                'sub_out_player_id' => $params['subOutPlayerId'] ?? null,
                'extra_info' => $params['extraInfo'] ?? null,
            ]);

            $state->match_minute = $params['minute'];
            $this->applyGoal($state, $match, $params['eventType'], $params['teamId'], 1);
            $state->save();

            if (in_array($match->status, ['scheduled', 'toss'], true)) {
                $match->status = 'in_progress';
                $match->save();
            }

            $this->syncFootballPlayerStats($params);
            $this->recalculateFootballStandings($match->tournament_id);

            return ['state' => $this->footballState($params['matchId']), 'event' => $event];
        });
    }

    public function undoLastFootballEvent(string $matchId): FootballMatchState
    {
        return DB::transaction(function () use ($matchId) {
            $match = GameMatch::find($matchId);
            $state = $this->footballState($matchId);

            $last = FootballEvent::query()
                ->where('match_id', $matchId)
                ->orderByDesc('sequence')
                ->first();

            if (! $last) {
                return $state;
            }

            if ($match) {
                $this->applyGoal($state, $match, $last->event_type, $last->team_id, -1);
                $state->save();
            }

            $last->delete();

            if ($match) {
                $this->recalculateFootballStandings($match->tournament_id);
            }

            return $this->footballState($matchId);
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
     * @param  array{half?: ?string, minute?: ?int}  $payload
     *
     * @throws \RuntimeException when the match does not exist
     */
    public function updateFootballTimer(string $matchId, string $action, array $payload = []): FootballMatchState
    {
        return DB::transaction(function () use ($matchId, $action, $payload) {
            $match = GameMatch::find($matchId);
            $state = $this->footballState($matchId);

            switch ($action) {
                case 'start':
                    $state->is_timer_running = true;
                    $state->timer_started_at_epoch = Ids::millis();
                    if ($match && $match->status !== 'in_progress') {
                        $match->status = 'in_progress';
                    }
                    break;

                case 'pause':
                    $state->is_timer_running = false;
                    $state->timer_started_at_epoch = null;
                    break;

                case 'set_half':
                    $state->current_half = $payload['half'] ?? $state->current_half;
                    if (($payload['half'] ?? null) === 'full_time' && $match) {
                        $state->is_timer_running = false;
                        $this->concludeFootballMatch($match, $state, withSummary: true);
                    }
                    break;

                case 'set_minute':
                    $state->match_minute = (int) ($payload['minute'] ?? $state->match_minute);
                    break;

                case 'finish':
                    if ($match) {
                        $state->is_timer_running = false;
                        $state->current_half = 'full_time';
                        $this->concludeFootballMatch($match, $state, withSummary: false);
                    }
                    break;
            }

            $state->save();
            $match?->save();

            if ($match) {
                $this->recalculateFootballStandings($match->tournament_id);
            }

            return $this->footballState($matchId);
        });
    }

    private function concludeFootballMatch(GameMatch $match, FootballMatchState $state, bool $withSummary): void
    {
        $match->status = 'completed';

        if ($state->team_a_score > $state->team_b_score) {
            $match->winner_team_id = $match->team_a_id;
            $summary = "Team A won {$state->team_a_score} - {$state->team_b_score}";
        } elseif ($state->team_b_score > $state->team_a_score) {
            $match->winner_team_id = $match->team_b_id;
            $summary = "Team B won {$state->team_b_score} - {$state->team_a_score}";
        } else {
            $match->winner_team_id = null;
            $summary = "Match Drawn {$state->team_a_score} - {$state->team_b_score}";
        }

        if ($withSummary) {
            $match->result_summary = $summary;
        }
    }

    private function syncFootballPlayerStats(array $params): void
    {
        if (! empty($params['playerId'])) {
            $stats = PlayerStat::query()->where('player_id', $params['playerId'])->first();

            if ($stats && is_array($stats->football)) {
                $football = $stats->football;
                $football = match ($params['eventType']) {
                    'goal', 'penalty_goal' => [...$football, 'goals' => ($football['goals'] ?? 0) + 1],
                    'yellow_card' => [...$football, 'yellow_cards' => ($football['yellow_cards'] ?? 0) + 1],
                    'red_card' => [...$football, 'red_cards' => ($football['red_cards'] ?? 0) + 1],
                    default => $football,
                };
                $stats->football = $football;
                $stats->save();
            }
        }

        if (! empty($params['assistPlayerId'])) {
            $assistStats = PlayerStat::query()->where('player_id', $params['assistPlayerId'])->first();

            if ($assistStats && is_array($assistStats->football)) {
                $football = $assistStats->football;
                $football['assists'] = ($football['assists'] ?? 0) + 1;
                $assistStats->football = $football;
                $assistStats->save();
            }
        }
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
        $match = GameMatch::find($params['matchId']);

        if (! $match) {
            throw new \RuntimeException('Match not found');
        }

        $this->assertNotCancelled($match);

        return DB::transaction(function () use ($params, $match) {
            $state = $this->cricketState($params['matchId']);
            $innings = $params['innings'];
            $extras = $params['extras'] ?: 'none';

            foreach (['strikerId' => 'current_striker_id', 'nonStrikerId' => 'current_non_striker_id', 'bowlerId' => 'current_bowler_id'] as $input => $column) {
                if (! empty($params[$input])) {
                    $state->{$column} = $params[$input];
                }
            }

            $isLegalBall = ! in_array($extras, ['wide', 'no_ball'], true);
            $extrasRuns = $params['extrasRuns'] ?? ($extras !== 'none' ? 1 : 0);
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

            $this->applyCricketPlayerStats([
                'strikerId' => $delivery->striker_id,
                'bowlerId' => $delivery->bowler_id,
                'runsScored' => $params['runsScored'],
                'extras' => $extras,
                'extrasRuns' => $extrasRuns,
                'isWicket' => $params['isWicket'],
                'wicketType' => $params['wicketType'] ?? null,
            ], 1);

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

    /**
     * Dismissals that aren't the bowler's to claim, so they never count toward
     * a bowling figure.
     */
    private const UNBOWLED_DISMISSALS = ['run_out', 'retired_hurt', 'obstructing_field'];

    /**
     * Fold one delivery into the two players' career totals, or peel it back
     * out again with `$direction = -1` when the ball is undone.
     *
     * Undo has to reverse these as precisely as it reverses the scoreline —
     * now that real player ids reach this method on every ball, a delivery
     * undone without it would leave runs and wickets credited for a ball that
     * no longer exists.
     *
     * @param  array{strikerId?: ?string, bowlerId?: ?string, runsScored: int, extras: string, extrasRuns: int, isWicket: bool, wicketType?: ?string}  $ball
     */
    private function applyCricketPlayerStats(array $ball, int $direction): void
    {
        $extras = $ball['extras'] ?: 'none';

        if (! empty($ball['strikerId'])) {
            $stats = PlayerStat::query()->where('player_id', $ball['strikerId'])->first();

            if ($stats && is_array($stats->cricket)) {
                $cricket = $stats->cricket;
                $cricket['runs_scored'] = max(0, ($cricket['runs_scored'] ?? 0) + $direction * $ball['runsScored']);

                // A wide is never a ball faced; a no-ball is — the striker had
                // to play at it, and it counts against their strike rate.
                if ($extras !== 'wide') {
                    $cricket['balls_faced'] = max(0, ($cricket['balls_faced'] ?? 0) + $direction);
                }
                if ($ball['runsScored'] === 4) {
                    $cricket['fours'] = max(0, ($cricket['fours'] ?? 0) + $direction);
                }
                if ($ball['runsScored'] === 6) {
                    $cricket['sixes'] = max(0, ($cricket['sixes'] ?? 0) + $direction);
                }
                $stats->cricket = $cricket;
                $stats->save();
            }
        }

        if (! empty($ball['bowlerId'])) {
            $stats = PlayerStat::query()->where('player_id', $ball['bowlerId'])->first();

            if ($stats && is_array($stats->cricket)) {
                $cricket = $stats->cricket;
                $cricket['runs_conceded'] = max(0, ($cricket['runs_conceded'] ?? 0) + $direction * $this->runsChargedToBowler($ball));

                if ($ball['isWicket'] && ! in_array($ball['wicketType'] ?? '', self::UNBOWLED_DISMISSALS, true)) {
                    $cricket['wickets_taken'] = max(0, ($cricket['wickets_taken'] ?? 0) + $direction);
                }
                $stats->cricket = $cricket;
                $stats->save();
            }
        }
    }

    /**
     * Byes and leg-byes go to the team but never onto the bowler's analysis;
     * wides and no-balls do.
     *
     * @param  array{runsScored: int, extras: string, extrasRuns: int}  $ball
     */
    private function runsChargedToBowler(array $ball): int
    {
        $extras = $ball['extras'] ?: 'none';
        $chargeable = in_array($extras, ['bye', 'leg_bye'], true) ? 0 : $ball['extrasRuns'];

        return $ball['runsScored'] + $chargeable;
    }

    public function undoLastCricketBall(string $matchId): ?CricketMatchState
    {
        return DB::transaction(function () use ($matchId) {
            $match = GameMatch::find($matchId);
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

            $this->applyCricketPlayerStats([
                'strikerId' => $last->striker_id,
                'bowlerId' => $last->bowler_id,
                'runsScored' => $last->runs_scored,
                'extras' => $last->extras,
                'extrasRuns' => $last->extras_runs,
                'isWicket' => (bool) $last->is_wicket,
                'wicketType' => $last->wicket_type,
            ], -1);

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
        $match = GameMatch::find($matchId);

        if (! $match) {
            throw new \RuntimeException('Match not found');
        }

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
}
