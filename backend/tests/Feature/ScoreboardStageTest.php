<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Services\ScoreboardDirector;
use Tests\TestCase;

/**
 * What the stadium display is showing, and the organizer's control of it from
 * the scorer console.
 */
class ScoreboardStageTest extends TestCase
{
    private const MATCH_ID = 'match-crick-live-1';

    private const TEAM_A = 'team-kozhikode-kings';

    private ScoreboardDirector $director;

    protected function setUp(): void
    {
        parent::setUp();
        $this->director = app(ScoreboardDirector::class);
    }

    /* -------------------------------------------------------------- Resolve */

    public function test_an_undirected_pre_match_display_shows_the_toss(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'scheduled';
        $match->scoreboard_stage = 'auto';

        $this->assertSame('toss', $this->director->resolve($match));
    }

    public function test_an_undirected_display_shows_the_scoreline_once_play_starts(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'in_progress';
        $match->scoreboard_stage = 'auto';

        $this->assertSame('live', $this->director->resolve($match));
    }

    public function test_a_directed_stage_wins_over_the_match_status(): void
    {
        $match = $this->director->setStage(self::MATCH_ID, 'lineups');

        $this->assertSame('lineups', $this->director->resolve($match));
        $this->assertSame('lineups', $match->scoreboard_stage);
    }

    public function test_an_unknown_stage_is_refused(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->director->setStage(self::MATCH_ID, 'half-time-show');
    }

    /* --------------------------------------------------------- Reveal cursor */

    public function test_a_stage_plays_by_default_and_is_timestamped(): void
    {
        $match = $this->director->setStage(self::MATCH_ID, 'lineups');

        $this->assertSame(-1, $match->scoreboard_cursor);
        $this->assertNotNull($match->scoreboard_stage_at);
    }

    public function test_a_held_reveal_keeps_the_position_it_was_given(): void
    {
        $match = $this->director->setStage(self::MATCH_ID, 'lineups', 4);

        $this->assertSame(4, $match->scoreboard_cursor);
        $this->assertSame(4, $this->director->payload($match)['cursor']);
    }

    public function test_the_payload_carries_the_interval_the_display_counts_with(): void
    {
        $payload = $this->director->payload(GameMatch::find(self::MATCH_ID));

        $this->assertSame(ScoreboardDirector::REVEAL_INTERVAL_SECONDS, $payload['reveal_interval_seconds']);
        $this->assertArrayHasKey('resolved_stage', $payload);
    }

    /* ------------------------------------------------------ Automatic moves */

    public function test_settling_the_toss_sends_the_display_into_the_squad_reveal(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $this->clearToss();

        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/manual', [
            'winner_team_id' => self::TEAM_A,
            'decision' => 'bat',
        ])->assertOk();

        $this->assertSame('lineups', GameMatch::find(self::MATCH_ID)->scoreboard_stage);
    }

    public function test_a_digital_toss_reveals_the_squads_only_once_the_decision_is_in(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $this->clearToss();

        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/call', [
            'team_id' => self::TEAM_A,
            'call' => 'heads',
        ])->assertOk();

        // The coin has landed but nobody has chosen to bat or bowl, so there is
        // no order to reveal the squads in yet.
        $this->assertNotSame('lineups', GameMatch::find(self::MATCH_ID)->scoreboard_stage);

        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/decision', ['decision' => 'bowl'])->assertOk();

        $this->assertSame('lineups', GameMatch::find(self::MATCH_ID)->scoreboard_stage);
    }

    public function test_the_first_ball_takes_the_display_off_the_squad_reveal(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $this->director->setStage(self::MATCH_ID, 'lineups');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/cricket/ball', [
            'innings' => 1,
            'runs_scored' => 1,
            'striker_id' => 'pl-kk-1',
            'non_striker_id' => 'pl-kk-2',
            'bowler_id' => 'pl-cw-3',
        ])->assertOk();

        $this->assertSame('auto', GameMatch::find(self::MATCH_ID)->scoreboard_stage);
    }

    public function test_a_retaken_toss_puts_the_coin_back_on_screen(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $match = GameMatch::find(self::MATCH_ID);
        $match->status = 'scheduled';
        $match->save();

        $this->director->setStage(self::MATCH_ID, 'lineups');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/toss/reset')->assertOk();

        $this->assertSame('toss', GameMatch::find(self::MATCH_ID)->scoreboard_stage);
    }

    /* ----------------------------------------------------------------- HTTP */

    public function test_directing_the_display_requires_a_login(): void
    {
        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'lineups'])
            ->assertUnauthorized();
    }

    public function test_a_team_manager_cannot_direct_the_display(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'lineups'])
            ->assertForbidden();
    }

    public function test_another_organizer_cannot_direct_this_display(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'lineups'])
            ->assertForbidden();
    }

    public function test_the_organizer_directs_the_display_over_http(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'lineups', 'cursor' => 3])
            ->assertOk()
            ->assertJsonPath('stage', 'lineups')
            ->assertJsonPath('resolved_stage', 'lineups')
            ->assertJsonPath('cursor', 3);
    }

    public function test_the_stage_survives_a_reload_of_the_display(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $this->postJson('/api/matches/'.self::MATCH_ID.'/scoreboard/stage', ['stage' => 'lineups', 'cursor' => 2]);

        // The display's own feed, fetched fresh the way a reloaded TV would.
        $this->getJson('/api/matches/scoreboard/match/'.self::MATCH_ID)
            ->assertOk()
            ->assertJsonPath('scoreboard.resolved_stage', 'lineups')
            ->assertJsonPath('scoreboard.cursor', 2);
    }

    private function clearToss(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->toss_winner_team_id = null;
        $match->toss_decision = null;
        $match->toss_method = null;
        $match->batting_first_team_id = null;
        $match->save();
    }
}
