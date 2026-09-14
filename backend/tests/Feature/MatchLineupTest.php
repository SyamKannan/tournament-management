<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\MatchLineup;
use App\Models\Player;
use App\Services\LineupService;
use Tests\TestCase;

/**
 * Per-match team sheets — the order the big screen announces players in and
 * the batting card the scorer works down.
 */
class MatchLineupTest extends TestCase
{
    private const MATCH_ID = 'match-crick-live-1';

    private const TEAM_A = 'team-kozhikode-kings';

    private const TEAM_B = 'team-coastal-warriors';

    private LineupService $lineups;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lineups = app(LineupService::class);
    }

    public function test_a_match_without_a_saved_sheet_still_produces_a_default_one(): void
    {
        $rows = $this->lineups->forMatch(GameMatch::find(self::MATCH_ID));

        $this->assertNotEmpty($rows);
        $this->assertDatabaseCount('match_lineups', 0);

        // Nothing is written by a read — the default is derived, so the sheet
        // only exists once an organizer actually saves one.
        $this->assertNull($rows[0]['id']);
    }

    public function test_the_default_sheet_is_in_squad_order_with_the_first_eleven_playing(): void
    {
        $rows = collect($this->lineups->forMatch(GameMatch::find(self::MATCH_ID)))
            ->where('team_id', self::TEAM_A)
            ->values();

        $jerseys = $rows->pluck('player.jersey_number')->all();
        $sorted = $jerseys;
        sort($sorted);
        $this->assertSame($sorted, $jerseys, 'The default sheet should follow jersey order.');

        $rows->take(11)->each(fn ($row) => $this->assertTrue($row['is_playing']));
        $rows->slice(11)->each(fn ($row) => $this->assertFalse($row['is_playing']));
    }

    public function test_the_reveal_order_leads_with_the_side_batting_first(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $match->batting_first_team_id = self::TEAM_B;
        $match->save();

        $rows = $this->lineups->forMatch($match->fresh());

        $this->assertSame(self::TEAM_B, $rows[0]['team_id']);

        // Both squads are present, the second one after the first in full.
        $teamsInOrder = collect($rows)->pluck('team_id')->unique()->values()->all();
        $this->assertSame([self::TEAM_B, self::TEAM_A], $teamsInOrder);
    }

    public function test_saving_a_sheet_replaces_the_previous_one_rather_than_adding_to_it(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $squad = Player::query()->where('team_id', self::TEAM_A)->pluck('id')->take(5)->values();

        $this->lineups->save($match, self::TEAM_A, $squad->map(fn ($id) => ['player_id' => $id])->all());
        $this->lineups->save($match, self::TEAM_A, $squad->take(3)->map(fn ($id) => ['player_id' => $id])->all());

        $this->assertSame(3, MatchLineup::query()->where('match_id', self::MATCH_ID)->where('team_id', self::TEAM_A)->count());
    }

    public function test_a_saved_sheet_keeps_the_order_it_was_given(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $squad = Player::query()->where('team_id', self::TEAM_A)->orderBy('id')->pluck('id')->take(4)->values();

        $this->lineups->save($match, self::TEAM_A, [
            ['player_id' => $squad[2], 'is_captain' => true],
            ['player_id' => $squad[0]],
            ['player_id' => $squad[3], 'is_wicketkeeper' => true],
            ['player_id' => $squad[1], 'is_playing' => false],
        ]);

        $rows = collect($this->lineups->forMatch($match->fresh()))->where('team_id', self::TEAM_A)->values();

        $this->assertSame([$squad[2], $squad[0], $squad[3], $squad[1]], $rows->pluck('player_id')->all());
        $this->assertSame([1, 2, 3, 4], $rows->pluck('batting_order')->all());
        $this->assertTrue($rows[0]['is_captain']);
        $this->assertTrue($rows[2]['is_wicketkeeper']);
        $this->assertFalse($rows[3]['is_playing']);
    }

    public function test_a_player_from_another_team_is_refused(): void
    {
        $match = GameMatch::find(self::MATCH_ID);
        $outsider = Player::query()->where('team_id', self::TEAM_B)->value('id');

        $this->expectException(\RuntimeException::class);
        $this->lineups->save($match, self::TEAM_A, [['player_id' => $outsider]]);
    }

    public function test_a_team_not_in_the_match_is_refused(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->lineups->save(GameMatch::find(self::MATCH_ID), 'team-green-valley-strikers', []);
    }

    /* ----------------------------------------------------------------- HTTP */

    public function test_the_sheet_is_readable_without_logging_in(): void
    {
        $this->getJson('/api/matches/'.self::MATCH_ID.'/lineup')
            ->assertOk()
            ->assertJsonStructure(['lineups' => ['*' => ['player_id', 'batting_order', 'is_playing', 'player']]]);
    }

    public function test_saving_a_sheet_requires_a_login(): void
    {
        $this->putJson('/api/matches/'.self::MATCH_ID.'/lineup', [
            'team_id' => self::TEAM_A,
            'players' => [],
        ])->assertUnauthorized();
    }

    public function test_a_team_manager_cannot_name_the_match_day_eleven(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $this->putJson('/api/matches/'.self::MATCH_ID.'/lineup', [
            'team_id' => self::TEAM_A,
            'players' => [],
        ])->assertForbidden();
    }

    public function test_another_organizers_match_cannot_be_touched(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->putJson('/api/matches/'.self::MATCH_ID.'/lineup', [
            'team_id' => self::TEAM_A,
            'players' => [],
        ])->assertForbidden();
    }

    public function test_the_organizer_saves_a_sheet_over_http(): void
    {
        $this->actingAsUser('admin@malabar.com');
        $squad = Player::query()->where('team_id', self::TEAM_A)->pluck('id')->take(2)->values();

        $this->putJson('/api/matches/'.self::MATCH_ID.'/lineup', [
            'team_id' => self::TEAM_A,
            'players' => [
                ['player_id' => $squad[1], 'is_captain' => true],
                ['player_id' => $squad[0]],
            ],
        ])->assertOk();

        $rows = collect($this->lineups->forMatch(GameMatch::find(self::MATCH_ID)))
            ->where('team_id', self::TEAM_A)
            ->values();

        $this->assertSame($squad[1], $rows[0]['player_id']);
        $this->assertTrue($rows[0]['is_captain']);
    }
}
