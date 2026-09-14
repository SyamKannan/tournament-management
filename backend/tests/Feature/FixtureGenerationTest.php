<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use Tests\TestCase;

/**
 * Generating fixtures is idempotent from the organizer's point of view: a
 * tournament has exactly one schedule, so a second run must replace the first
 * rather than stack another full set of matches on top of it.
 */
class FixtureGenerationTest extends TestCase
{
    private const TOURNAMENT_ID = 'tourney-football-sevens';

    /** Four approved teams in the seed fixture → six round robin pairings. */
    private const EXPECTED_ROUND_ROBIN = 6;

    public function test_generating_again_without_replace_is_rejected(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $before = GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->count();

        $response = $this->postJson('/api/matches/auto-generate-fixtures', [
            'tournament_id' => self::TOURNAMENT_ID,
            'format' => 'round_robin',
        ]);

        $response->assertStatus(409);
        $this->assertSame($before, GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->count());
    }

    public function test_replace_swaps_the_old_schedule_for_a_new_one(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        // Nothing may have started for a replacement to be allowed.
        GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->update(['status' => 'scheduled']);
        $oldIds = GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->pluck('id')->all();

        $response = $this->postJson('/api/matches/auto-generate-fixtures', [
            'tournament_id' => self::TOURNAMENT_ID,
            'format' => 'round_robin',
            'replace' => true,
        ]);

        $response->assertStatus(201);

        $matches = GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->get();

        $this->assertCount(self::EXPECTED_ROUND_ROBIN, $matches);
        $this->assertEmpty(array_intersect($oldIds, $matches->pluck('id')->all()));
        $this->assertSame(range(1, self::EXPECTED_ROUND_ROBIN), $matches->pluck('match_number')->sort()->values()->all());
    }

    public function test_replace_is_refused_while_a_match_is_under_way(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $before = GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->pluck('id')->sort()->values()->all();

        // The seed dataset has one football match already in progress.
        $this->assertTrue(GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->where('status', 'in_progress')->exists());

        $response = $this->postJson('/api/matches/auto-generate-fixtures', [
            'tournament_id' => self::TOURNAMENT_ID,
            'format' => 'knockout',
            'replace' => true,
        ]);

        $response->assertStatus(409);
        $this->assertSame($before, GameMatch::query()->where('tournament_id', self::TOURNAMENT_ID)->pluck('id')->sort()->values()->all());
    }
}
