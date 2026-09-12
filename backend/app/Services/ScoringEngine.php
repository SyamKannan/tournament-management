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

        return CricketMatchState::create([
            'id' => Ids::unique('crick_state'),
            'match_id' => $matchId,
            'total_overs' => 20,
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
                'bowler_id' => $state->current_bowler_id ?: 'bowler',
                'striker_id' => $state->current_striker_id ?: 'striker',
                'non_striker_id' => $state->current_non_striker_id ?: 'non_striker',
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

                    if ($state->team_b_runs >= $state->target_runs) {
                        $match->status = 'completed';
                        $match->winner_team_id = $state->batting_team_id;
                        $battingTeamName = Team::query()->whereKey($state->batting_team_id)->value('name') ?: 'Batting Team';
                        $match->result_summary = sprintf('%s won by %d wickets!', $battingTeamName, 10 - $state->team_b_wickets);
                    }
                }
            }

            $this->rotateStrike($state, $params, $isLegalBall, $legalBallsAfter);
            $state->save();

            $this->syncCricketPlayerStats($params, $isLegalBall, $totalDeliveryRuns);

            if (in_array($match->status, ['scheduled', 'toss'], true)) {
                $match->status = 'in_progress';
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
    private function rotateStrike(CricketMatchState $state, array $params, bool $isLegalBall, int $legalBallsAfter): void
    {
        $swap = function () use ($state) {
            [$state->current_striker_id, $state->current_non_striker_id] =
                [$state->current_non_striker_id, $state->current_striker_id];
        };

        if ($params['runsScored'] % 2 === 1 && ! $params['isWicket']) {
            $swap();
        }

        if ($isLegalBall && $legalBallsAfter % 6 === 0) {
            $swap();
        }

        if ($params['isWicket'] && ! empty($params['nextStrikerId'])) {
            $state->current_striker_id = $params['nextStrikerId'];
        }
    }

    private function syncCricketPlayerStats(array $params, bool $isLegalBall, int $totalDeliveryRuns): void
    {
        if (! empty($params['strikerId'])) {
            $stats = PlayerStat::query()->where('player_id', $params['strikerId'])->first();

            if ($stats && is_array($stats->cricket)) {
                $cricket = $stats->cricket;
                $cricket['runs_scored'] = ($cricket['runs_scored'] ?? 0) + $params['runsScored'];
                if ($isLegalBall) {
                    $cricket['balls_faced'] = ($cricket['balls_faced'] ?? 0) + 1;
                }
                if ($params['runsScored'] === 4) {
                    $cricket['fours'] = ($cricket['fours'] ?? 0) + 1;
                }
                if ($params['runsScored'] === 6) {
                    $cricket['sixes'] = ($cricket['sixes'] ?? 0) + 1;
                }
                $stats->cricket = $cricket;
                $stats->save();
            }
        }

        if (! empty($params['bowlerId'])) {
            $stats = PlayerStat::query()->where('player_id', $params['bowlerId'])->first();

            if ($stats && is_array($stats->cricket)) {
                $cricket = $stats->cricket;
                $cricket['runs_conceded'] = ($cricket['runs_conceded'] ?? 0) + $totalDeliveryRuns;
                if ($params['isWicket'] && ($params['wicketType'] ?? null) !== 'run_out') {
                    $cricket['wickets_taken'] = ($cricket['wickets_taken'] ?? 0) + 1;
                }
                $stats->cricket = $cricket;
                $stats->save();
            }
        }
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
                $isTeamA = $match->team_a_id === $team->id;

                $runsScored += $isTeamA ? $state->team_a_runs : $state->team_b_runs;
                $oversFaced += $isTeamA ? $state->team_a_overs : $state->team_b_overs;
                $runsConceded += $isTeamA ? $state->team_b_runs : $state->team_a_runs;
                $oversBowled += $isTeamA ? $state->team_b_overs : $state->team_a_overs;

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
}
