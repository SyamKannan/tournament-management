<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\Standing;
use App\Models\Tournament;
use App\Services\ScoringEngine;
use Tests\TestCase;

/**
 * Tournament settings have to actually reach the scoring engine.
 *
 * A whole family of configuration was stored and then ignored: the engine read
 * an extra-time key nobody wrote, the table points were hard-coded past the
 * saved ones, cricket's no-result branch sat behind a status filter that could
 * never let it run, and a partial `PUT` replaced the settings JSON wholesale so
 * the rest silently reverted to defaults. These cover all four.
 */
class TournamentSettingsTest extends TestCase
{
    private const FOOTBALL = 'tourney-football-sevens';

    private const FOOTBALL_MATCH = 'match-fb-live-1';

    private const CRICKET = 'tourney-cricket-t20';

    private const CRICKET_MATCH = 'match-crick-live-1';

    private ScoringEngine $scoring;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scoring = app(ScoringEngine::class);
    }

    /* ------------------------------------------------------------ Extra time */

    public function test_extra_time_halves_come_from_the_tournaments_own_setting(): void
    {
        // 30-minute halves, and 24 minutes of extra time — so 12 a half.
        $this->setFootballSettings(['extra_time_minutes' => 24]);

        $match = GameMatch::find(self::FOOTBALL_MATCH);

        $this->assertSame(60 * 60, $this->scoring->footballPeriodStart($match, 'extra_1'));
        $this->assertSame((60 + 12) * 60, $this->scoring->footballPeriodStart($match, 'extra_2'));
    }

    public function test_extra_time_falls_back_to_a_third_of_a_half_when_unset(): void
    {
        $this->setFootballSettings(['extra_time_minutes' => 0]);

        $match = GameMatch::find(self::FOOTBALL_MATCH);

        // A third of a 30-minute half is 10.
        $this->assertSame((60 + 10) * 60, $this->scoring->footballPeriodStart($match, 'extra_2'));
    }

    /* ---------------------------------------------------------- Table points */

    public function test_football_standings_use_the_configured_points(): void
    {
        $this->setFootballSettings([
            'points_win' => 5,
            'points_draw' => 2,
            'points_loss' => 1,
        ]);

        $this->scoring->recalculateFootballStandings(self::FOOTBALL);

        foreach ($this->playedStandings(self::FOOTBALL) as $standing) {
            $this->assertSame(
                5 * $standing->won + 2 * $standing->drawn + 1 * $standing->lost,
                $standing->points,
                "{$standing->team_id} was not awarded the tournament's own points"
            );
        }
    }

    public function test_football_standings_still_default_to_three_one_nil(): void
    {
        $this->setFootballSettings([
            'points_win' => null,
            'points_draw' => null,
            'points_loss' => null,
        ]);

        $this->scoring->recalculateFootballStandings(self::FOOTBALL);

        foreach ($this->playedStandings(self::FOOTBALL) as $standing) {
            $this->assertSame(3 * $standing->won + $standing->drawn, $standing->points);
        }
    }

    public function test_cricket_standings_use_the_configured_points(): void
    {
        $this->setSettings(self::CRICKET, ['points_win' => 4, 'points_loss' => 1]);

        $this->scoring->recalculateCricketStandings(self::CRICKET);

        foreach ($this->playedStandings(self::CRICKET) as $standing) {
            $this->assertSame(
                4 * $standing->won + $standing->lost + $standing->no_result,
                $standing->points
            );
        }
    }

    /* ------------------------------------------------------- Cricket no result */

    public function test_an_abandoned_cricket_match_shares_a_point(): void
    {
        $match = GameMatch::find(self::CRICKET_MATCH);
        $match->status = 'abandoned';
        $match->winner_team_id = null;
        $match->save();

        $this->scoring->recalculateCricketStandings(self::CRICKET);

        foreach ([$match->team_a_id, $match->team_b_id] as $teamId) {
            $standing = $this->standing(self::CRICKET, $teamId);

            $this->assertSame(1, $standing->no_result, 'the abandoned match was not counted as a no result');
            $this->assertContains('NR', $standing->form);
            $this->assertGreaterThanOrEqual(1, $standing->points);
        }
    }

    /* --------------------------------------------------------- Partial update */

    public function test_a_partial_settings_update_keeps_the_settings_it_does_not_name(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $before = Tournament::find(self::CRICKET)->settings;

        $this->putJson('/api/tournaments/'.self::CRICKET, [
            'settings' => ['total_overs' => 15],
        ])->assertOk();

        $after = Tournament::find(self::CRICKET)->settings;

        $this->assertSame(15, $after['total_overs']);
        $this->assertSame($before['squad_max_players'], $after['squad_max_players']);
        $this->assertSame($before['powerplay_overs'], $after['powerplay_overs']);
        $this->assertSame($before['max_overs_per_bowler'], $after['max_overs_per_bowler']);
    }

    public function test_an_update_normalises_the_settings_it_stores(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->putJson('/api/tournaments/'.self::FOOTBALL, [
            'settings' => ['half_duration_minutes' => '25', 'not_a_setting' => 'ignored'],
        ])->assertOk();

        $settings = Tournament::find(self::FOOTBALL)->settings;

        $this->assertSame(25, $settings['half_duration_minutes'], 'a numeric string should be stored as an int');
        $this->assertArrayNotHasKey('not_a_setting', $settings);
        $this->assertArrayHasKey('points_win', $settings);
    }

    public function test_a_new_tournament_stores_its_table_points(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->postJson('/api/tournaments', [
            'name' => 'Points Config Cup',
            'sport_code' => 'cricket',
        ])->assertCreated();

        $settings = $response->json('tournament.settings') ?? $response->json('settings');

        // Cricket's table runs on 2 for a win, not football's 3.
        $this->assertSame(2, $settings['points_win']);
        $this->assertSame(1, $settings['points_draw']);
        $this->assertSame(0, $settings['points_loss']);
    }

    /* ------------------------------------------------------------- Helpers */

    private function setFootballSettings(array $changes): void
    {
        $this->setSettings(self::FOOTBALL, $changes);
    }

    /** Write settings straight onto the row, the way the seeder does. */
    private function setSettings(string $tournamentId, array $changes): void
    {
        $tournament = Tournament::find($tournamentId);
        $settings = $tournament->settings ?? [];

        foreach ($changes as $key => $value) {
            if ($value === null) {
                unset($settings[$key]);

                continue;
            }

            $settings[$key] = $value;
        }

        $tournament->settings = $settings;
        $tournament->save();
    }

    /** @return \Illuminate\Support\Collection<int, Standing> */
    private function playedStandings(string $tournamentId)
    {
        $standings = Standing::query()
            ->where('tournament_id', $tournamentId)
            ->where('played', '>', 0)
            ->get();

        $this->assertNotEmpty($standings, 'the seeded tournament should have played fixtures to rank');

        return $standings;
    }

    private function standing(string $tournamentId, string $teamId): Standing
    {
        return Standing::query()
            ->where('tournament_id', $tournamentId)
            ->where('team_id', $teamId)
            ->firstOrFail();
    }
}
