<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\Player;
use App\Services\FootballScorecard;
use App\Services\LineupService;
use App\Services\PlayerStatsService;
use App\Services\ScoreboardDirector;
use App\Services\ScoringEngine;
use App\Services\TossService;
use Tests\TestCase;

/**
 * Football's side of everything cricket already had: the toss, a running
 * clock through halves and a break, a match card, undo that is really undone,
 * and scoring that only the match's own officials can do.
 */
class FootballMatchFlowTest extends TestCase
{
    private const LIVE = 'match-fb-live-1';

    private const SCHEDULED = 'match-fb-sched-2';

    private const HOME = 'team-malabar-blasters';

    private const AWAY = 'team-green-valley-strikers';

    private ScoringEngine $scoring;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scoring = app(ScoringEngine::class);
    }

    /* -------------------------------------------------------------- Clock */

    public function test_the_clock_runs_and_a_pause_keeps_every_second(): void
    {
        $this->travelTo(now()->startOfMinute());
        $this->scoring->updateFootballTimer(self::SCHEDULED, 'start');

        $this->travel(95)->seconds();
        $this->assertSame(95, $this->scoring->footballState(self::SCHEDULED)->clock_seconds);

        $this->scoring->updateFootballTimer(self::SCHEDULED, 'pause');
        $this->travel(10)->minutes();

        $state = $this->scoring->footballState(self::SCHEDULED);
        $this->assertFalse($state->is_timer_running);
        $this->assertSame(95, $state->clock_seconds);
        $this->assertSame(1, $state->match_minute);

        $this->scoring->updateFootballTimer(self::SCHEDULED, 'start');
        $this->travel(5)->seconds();
        $this->assertSame(100, $this->scoring->footballState(self::SCHEDULED)->clock_seconds);
        $this->assertSame('in_progress', GameMatch::find(self::SCHEDULED)->status);
    }

    public function test_starting_a_running_clock_does_not_reset_it(): void
    {
        $this->travelTo(now()->startOfMinute());
        $this->scoring->updateFootballTimer(self::SCHEDULED, 'start');
        $this->travel(30)->seconds();

        $this->scoring->updateFootballTimer(self::SCHEDULED, 'start');
        $this->travel(30)->seconds();

        $this->assertSame(60, $this->scoring->footballState(self::SCHEDULED)->clock_seconds);
    }

    public function test_half_time_puts_the_match_on_its_break_and_the_card_on_screen(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'half_time');

        $match = GameMatch::find(self::LIVE);
        $state = $this->scoring->footballState(self::LIVE);

        $this->assertSame('half_time', $match->status);
        $this->assertSame('half_time', $state->current_half);
        $this->assertFalse($state->is_timer_running);
        $this->assertSame('scorecard', app(ScoreboardDirector::class)->resolve($match));
    }

    public function test_the_second_half_kicks_off_from_the_tournaments_half_length(): void
    {
        // The seeded sevens tournament plays 30-minute halves.
        $this->scoring->updateFootballTimer(self::LIVE, 'half_time');
        $this->scoring->updateFootballTimer(self::LIVE, 'set_half', ['half' => '2']);

        $state = $this->scoring->footballState(self::LIVE);

        $this->assertSame('2', $state->current_half);
        $this->assertTrue($state->is_timer_running);
        $this->assertSame(30 * 60, $state->elapsed_seconds);
        $this->assertSame('in_progress', GameMatch::find(self::LIVE)->status);
    }

    public function test_extra_time_starts_after_both_halves(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'set_half', ['half' => 'extra_1']);

        $this->assertSame(60 * 60, $this->scoring->footballState(self::LIVE)->elapsed_seconds);
    }

    public function test_the_clock_can_be_corrected(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'set_minute', ['minute' => 40]);

        $state = $this->scoring->footballState(self::LIVE);
        $this->assertSame(2400, $state->clock_seconds);
        $this->assertSame(40, $state->match_minute);
    }

    public function test_an_event_without_a_minute_takes_it_from_the_clock(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'set_minute', ['minute' => 33]);

        $result = $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'playerId' => 'pl-mb-3',
            'eventType' => 'yellow_card',
        ]);

        $this->assertSame(34, $result['event']->minute);
    }

    /* ------------------------------------------------------- Final whistle */

    public function test_full_time_names_the_winner(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'finish');

        $match = GameMatch::find(self::LIVE);

        $this->assertSame('completed', $match->status);
        $this->assertSame(self::HOME, $match->winner_team_id);
        $this->assertSame('Malabar Blasters FC won 2 - 1', $match->result_summary);
        $this->assertSame('full_time', $this->scoring->footballState(self::LIVE)->current_half);
    }

    public function test_a_finished_match_takes_no_more_events_or_clock_changes(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'finish');

        $this->expectExceptionMessage('This match is finished');

        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'playerId' => 'pl-mb-3',
            'eventType' => 'goal',
            'minute' => 70,
        ]);
    }

    public function test_the_clock_cannot_restart_a_finished_match(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'finish');

        $this->expectExceptionMessage('This match is finished');
        $this->scoring->updateFootballTimer(self::LIVE, 'start');
    }

    public function test_reopening_a_finished_match_clears_its_result(): void
    {
        $this->scoring->updateFootballTimer(self::LIVE, 'finish');
        $this->scoring->updateFootballTimer(self::LIVE, 'reopen');

        $match = GameMatch::find(self::LIVE);

        $this->assertSame('in_progress', $match->status);
        $this->assertNull($match->winner_team_id);
        $this->assertNull($match->result_summary);
        $this->assertSame('2', $this->scoring->footballState(self::LIVE)->current_half);
    }

    public function test_only_a_finished_match_can_be_reopened(): void
    {
        $this->expectExceptionMessage('Only a finished match can be reopened');
        $this->scoring->updateFootballTimer(self::LIVE, 'reopen');
    }

    public function test_undoing_a_goal_after_full_time_settles_the_result_again(): void
    {
        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::AWAY,
            'playerId' => 'pl-gvs-2',
            'eventType' => 'goal',
            'minute' => 58,
        ]);
        $this->scoring->updateFootballTimer(self::LIVE, 'finish');
        $this->assertNull(GameMatch::find(self::LIVE)->winner_team_id);

        $this->scoring->undoLastFootballEvent(self::LIVE);

        $match = GameMatch::find(self::LIVE);
        $this->assertSame('completed', $match->status);
        $this->assertSame(self::HOME, $match->winner_team_id);
        $this->assertSame('Malabar Blasters FC won 2 - 1', $match->result_summary);
    }

    /* ----------------------------------------------------------- Player stats */

    public function test_undo_takes_the_goal_and_assist_off_the_players_records(): void
    {
        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'playerId' => 'pl-mb-3',
            'assistPlayerId' => 'pl-mb-4',
            'eventType' => 'goal',
            'minute' => 40,
        ]);

        $this->assertSame(1, $this->footballStat('pl-mb-3', 'goals'));
        $this->assertSame(1, $this->footballStat('pl-mb-4', 'assists'));

        $this->scoring->undoLastFootballEvent(self::LIVE);

        $this->assertSame(0, $this->footballStat('pl-mb-3', 'goals'));
        $this->assertSame(0, $this->footballStat('pl-mb-4', 'assists'));
    }

    public function test_an_assist_only_counts_on_an_open_play_goal(): void
    {
        $result = $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'playerId' => 'pl-mb-3',
            'assistPlayerId' => 'pl-mb-4',
            'eventType' => 'penalty_goal',
            'minute' => 40,
        ]);

        $this->assertNull($result['event']->assist_player_id);
        $this->assertSame(0, $this->footballStat('pl-mb-4', 'assists'));
    }

    /* ------------------------------------------------------------ Validation */

    public function test_an_event_for_a_team_not_in_the_match_is_refused(): void
    {
        $this->expectExceptionMessage('That team is not playing in this match');

        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => 'team-nilgiri-lions',
            'eventType' => 'goal',
            'minute' => 10,
        ]);
    }

    public function test_a_goal_credited_to_the_other_sides_player_is_refused(): void
    {
        $this->expectExceptionMessage('That player is not in this team’s squad');

        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'playerId' => 'pl-gvs-2',
            'eventType' => 'goal',
            'minute' => 10,
        ]);
    }

    public function test_a_player_cannot_assist_their_own_goal(): void
    {
        $this->expectExceptionMessage('A player cannot assist their own goal');

        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'playerId' => 'pl-mb-3',
            'assistPlayerId' => 'pl-mb-3',
            'eventType' => 'goal',
            'minute' => 10,
        ]);
    }

    public function test_a_sent_off_player_cannot_score(): void
    {
        foreach ([30, 35] as $minute) {
            $this->scoring->addFootballEvent([
                'matchId' => self::LIVE,
                'teamId' => self::HOME,
                'playerId' => 'pl-mb-3',
                'eventType' => 'yellow_card',
                'minute' => $minute,
            ]);
        }

        $this->assertContains('pl-mb-3', $this->scoring->sentOffPlayerIds($this->scoring->footballState(self::LIVE)));

        $this->expectExceptionMessage('That player has been sent off');

        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'playerId' => 'pl-mb-3',
            'eventType' => 'goal',
            'minute' => 40,
        ]);
    }

    public function test_a_red_card_can_still_follow_a_second_yellow(): void
    {
        foreach (['yellow_card', 'yellow_card', 'red_card'] as $index => $type) {
            $this->scoring->addFootballEvent([
                'matchId' => self::LIVE,
                'teamId' => self::HOME,
                'playerId' => 'pl-mb-3',
                'eventType' => $type,
                'minute' => 30 + $index,
            ]);
        }

        $this->assertCount(3, $this->scoring->footballState(self::LIVE)->events->where('player_id', 'pl-mb-3'));
    }

    public function test_a_substitution_needs_two_different_players_from_the_side(): void
    {
        $result = $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'eventType' => 'substitution',
            'subInPlayerId' => 'pl-mb-4',
            'subOutPlayerId' => 'pl-mb-3',
            'minute' => 45,
        ]);

        $this->assertSame('pl-mb-4', $result['event']->player_id);

        $this->expectExceptionMessage('A player cannot replace themselves');

        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::HOME,
            'eventType' => 'substitution',
            'subInPlayerId' => 'pl-mb-3',
            'subOutPlayerId' => 'pl-mb-3',
            'minute' => 46,
        ]);
    }

    public function test_football_scoring_refuses_a_cricket_match_and_the_reverse(): void
    {
        try {
            $this->scoring->addFootballEvent([
                'matchId' => 'match-crick-live-1',
                'teamId' => 'team-kozhikode-kings',
                'eventType' => 'goal',
                'minute' => 1,
            ]);
            $this->fail('A football event was recorded on a cricket match');
        } catch (\RuntimeException $e) {
            $this->assertSame('Football match not found', $e->getMessage());
        }

        $this->assertNull($this->scoring->undoLastCricketBall(self::LIVE));
        $this->assertDatabaseMissing('cricket_match_states', ['match_id' => self::LIVE]);
    }

    /* ------------------------------------------------------------ Match card */

    public function test_the_match_card_lists_goals_under_the_side_they_counted_for(): void
    {
        $match = GameMatch::find(self::LIVE);
        $awayCardsBefore = count(app(FootballScorecard::class)->forMatch($match, $this->scoring->footballState(self::LIVE))[1]['cards']);

        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::AWAY,
            'playerId' => 'pl-gvs-2',
            'eventType' => 'own_goal',
            'minute' => 27,
        ]);
        $this->scoring->addFootballEvent([
            'matchId' => self::LIVE,
            'teamId' => self::AWAY,
            'playerId' => 'pl-gvs-2',
            'eventType' => 'yellow_card',
            'minute' => 28,
        ]);

        [$home, $away] = app(FootballScorecard::class)->forMatch($match, $this->scoring->footballState(self::LIVE));

        $this->assertSame(self::HOME, $home['team_id']);
        $this->assertSame(3, $home['score']);
        $this->assertCount(3, $home['goals']);
        $this->assertSame('own_goal', $home['goals'][2]['type']);
        $this->assertSame('pl-mb-3', $home['goals'][0]['assist_player_id']);

        $this->assertCount(1, $away['goals']);
        $this->assertCount($awayCardsBefore + 1, $away['cards']);
    }

    public function test_the_match_payload_carries_the_card_and_the_sent_off_list(): void
    {
        $this->getJson('/api/matches/'.self::LIVE)
            ->assertOk()
            ->assertJsonStructure([
                'football_state' => ['clock_seconds', 'elapsed_seconds', 'current_half'],
                'football_scorecard' => ['*' => ['team_id', 'score', 'goals', 'cards', 'substitutions', 'missed_penalties']],
                'sent_off_player_ids',
            ]);
    }

    /* ------------------------------------------------------------------ Toss */

    public function test_the_football_toss_winner_can_take_the_kick_off(): void
    {
        $match = app(TossService::class)->recordManual(self::SCHEDULED, 'team-nilgiri-lions', 'kick_off');

        $this->assertSame('team-nilgiri-lions', $match->kick_off_team_id);
        $this->assertNull($match->batting_first_team_id);
    }

    public function test_choosing_ends_gives_the_kick_off_to_the_other_side(): void
    {
        $match = app(TossService::class)->recordManual(self::SCHEDULED, 'team-nilgiri-lions', 'ends');

        $this->assertSame('team-calicut-eagles', $match->kick_off_team_id);
    }

    public function test_a_football_toss_cannot_elect_to_bat(): void
    {
        $this->expectExceptionMessage('Decision must be kick_off or ends');
        app(TossService::class)->recordManual(self::SCHEDULED, 'team-nilgiri-lions', 'bat');
    }

    public function test_the_side_kicking_off_leads_the_squad_reveal(): void
    {
        // Team A wins and picks an end, so team B kicks off and walks out first.
        app(TossService::class)->recordManual(self::LIVE, self::HOME, 'ends');

        $lineups = app(LineupService::class)->forMatch(GameMatch::find(self::LIVE));

        $this->assertNotEmpty($lineups);
        $this->assertSame(self::AWAY, $lineups[0]['team_id']);
    }

    public function test_resetting_the_toss_clears_the_kick_off(): void
    {
        $toss = app(TossService::class);
        $toss->recordManual(self::SCHEDULED, 'team-nilgiri-lions', 'kick_off');

        $this->assertNull($toss->reset(self::SCHEDULED)->kick_off_team_id);
    }

    public function test_the_football_toss_over_http_returns_the_kick_off_side(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/'.self::SCHEDULED.'/toss/manual', [
            'winner_team_id' => 'team-calicut-eagles',
            'decision' => 'kick_off',
        ])
            ->assertOk()
            ->assertJsonPath('kick_off_team_id', 'team-calicut-eagles')
            ->assertJsonPath('toss_decision', 'kick_off');
    }

    public function test_football_scoring_does_not_wait_for_a_toss(): void
    {
        $this->actingAsUser('scorer@greenvalley.com');

        $this->postJson('/api/matches/'.self::SCHEDULED.'/football/timer', ['action' => 'start'])->assertOk();
    }

    /* --------------------------------------------------------------- Lineups */

    public function test_a_sevens_side_starts_seven_by_default(): void
    {
        $lineups = app(LineupService::class)->forMatch(GameMatch::find(self::LIVE));
        $homeStarting = array_filter($lineups, fn ($row) => $row['team_id'] === self::HOME && $row['is_playing']);
        $homeSquad = array_filter($lineups, fn ($row) => $row['team_id'] === self::HOME);

        $this->assertCount(min(7, count($homeSquad)), $homeStarting);
    }

    /* -------------------------------------------------------------- Security */

    public function test_another_organizations_admin_cannot_score_this_match(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/matches/'.self::LIVE.'/football/event', [
            'team_id' => self::HOME,
            'event_type' => 'goal',
        ])->assertForbidden();

        $this->postJson('/api/matches/'.self::LIVE.'/football/timer', ['action' => 'pause'])->assertForbidden();
        $this->postJson('/api/matches/'.self::LIVE.'/football/undo')->assertForbidden();
        $this->postJson('/api/matches/'.self::SCHEDULED.'/toss/manual', [
            'winner_team_id' => 'team-calicut-eagles',
            'decision' => 'kick_off',
        ])->assertForbidden();
    }

    public function test_a_team_manager_cannot_score_or_change_a_match(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $this->postJson('/api/matches/'.self::LIVE.'/football/event', [
            'team_id' => self::HOME,
            'event_type' => 'goal',
        ])->assertForbidden();

        $this->putJson('/api/matches/'.self::LIVE, ['status' => 'completed'])->assertForbidden();
    }

    public function test_another_organizations_admin_cannot_score_a_cricket_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/match-crick-live-1/cricket/ball', ['innings' => 1, 'runs_scored' => 4])
            ->assertForbidden();
        $this->postJson('/api/matches/match-crick-live-1/cricket/undo')->assertForbidden();
    }

    /** One of a player's football totals, as the stats service reads it off the log. */
    private function footballStat(string $playerId, string $stat): mixed
    {
        return app(PlayerStatsService::class)->forPlayer(Player::findOrFail($playerId))['football'][$stat];
    }
}
