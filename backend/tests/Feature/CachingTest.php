<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\Organization;
use App\Models\Plan;
use App\Models\Tournament;
use App\Services\ScoringEngine;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The public read cache: what it serves from memory, and that every kind of
 * write — scoring, an organizer's edit, a platform change — shows up on the
 * next read. Runs on the array store; one test points a real Redis client at
 * a dead port, another runs against a live Redis when one is reachable.
 */
class CachingTest extends TestCase
{
    private const TOURNAMENT = 'tourney-football-sevens';

    private const SLUG = 'malappuram-7s-football-2026';

    private const ORG = 'org-green-valley';

    private const MATCH = 'match-fb-live-1';

    private const SCORER = 'pl-mb-3';

    protected function setUp(): void
    {
        parent::setUp();
        config(['caching.enabled' => true]);
        Cache::flush();
    }

    public function test_the_hub_is_served_from_cache_until_a_write_invalidates_it(): void
    {
        $original = Tournament::find(self::TOURNAMENT)->name;
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', $original);

        // Behind Eloquent's back: no event, so the cached hub stands.
        DB::table('tournaments')->where('id', self::TOURNAMENT)->update(['name' => 'Changed quietly']);
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', $original);

        Tournament::find(self::TOURNAMENT)->update(['name' => 'Renamed']);
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', 'Renamed');
    }

    public function test_an_organization_edit_refreshes_the_hub(): void
    {
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertOk();

        Organization::find(self::ORG)->update(['name' => 'Green Valley FC']);

        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('organization.name', 'Green Valley FC');
    }

    public function test_scoring_and_undo_show_up_in_cached_player_stats(): void
    {
        $before = $this->goalsOf(self::SCORER);
        $scoring = app(ScoringEngine::class);

        $scoring->addFootballEvent([
            'matchId' => self::MATCH,
            'teamId' => GameMatch::find(self::MATCH)->team_a_id,
            'playerId' => self::SCORER,
            'eventType' => 'goal',
            'minute' => 35,
        ]);
        $this->assertSame($before + 1, $this->goalsOf(self::SCORER));

        $scoring->undoLastFootballEvent(self::MATCH);
        $this->assertSame($before, $this->goalsOf(self::SCORER));
    }

    public function test_a_goal_refreshes_the_cached_fixture_list(): void
    {
        $score = fn () => collect($this->getJson('/api/matches/tournament/'.self::TOURNAMENT)->json())
            ->firstWhere('id', self::MATCH)['football_state']['team_a_score'];
        $before = $score();

        app(ScoringEngine::class)->addFootballEvent([
            'matchId' => self::MATCH,
            'teamId' => GameMatch::find(self::MATCH)->team_a_id,
            'playerId' => self::SCORER,
            'eventType' => 'goal',
            'minute' => 50,
        ]);

        $this->assertSame($before + 1, $score());
    }

    public function test_staff_and_public_fixture_lists_never_share_an_entry(): void
    {
        // Staff first, so a shared entry would hand the contacts to everyone.
        $staff = $this->getJson('/api/matches/tournament/'.self::TOURNAMENT, $this->demoHeaders('ORG_ADMIN', self::ORG))->json();
        $this->assertArrayHasKey('manager_phone', $staff[0]['team_a']);

        // The guard would otherwise remember the staff caller within this test.
        $this->app['auth']->forgetGuards();

        $public = $this->getJson('/api/matches/tournament/'.self::TOURNAMENT)->json();
        $this->assertArrayNotHasKey('manager_phone', $public[0]['team_a']);
    }

    public function test_a_write_inside_a_transaction_is_visible_once_committed(): void
    {
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertOk();

        DB::transaction(fn () => Tournament::find(self::TOURNAMENT)->update(['name' => 'Committed']));

        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', 'Committed');
    }

    public function test_platform_catalogue_follows_plan_edits_and_reordering(): void
    {
        $this->getJson('/api/plans')->assertOk();

        $plan = Plan::query()->where('status', 'active')->firstOrFail();
        $plan->update(['name' => 'Club Pro']);
        $this->assertContains('Club Pro', collect($this->getJson('/api/plans')->json())->pluck('name'));

        $reversed = Plan::query()->ordered()->pluck('id')->reverse()->values()->all();
        $this->postJson('/api/admin/plans/reorder', ['ids' => $reversed], $this->demoHeaders('SUPER_ADMIN'))->assertOk();

        $active = array_values(array_intersect($reversed, Plan::query()->where('status', 'active')->pluck('id')->all()));
        $this->assertSame($active, collect($this->getJson('/api/plans')->json())->pluck('id')->all());
    }

    public function test_a_cached_response_is_byte_for_byte_the_uncached_one(): void
    {
        config(['caching.enabled' => false]);
        $fresh = $this->get('/api/tournaments/public/'.self::SLUG)->getContent();

        config(['caching.enabled' => true]);
        $this->get('/api/tournaments/public/'.self::SLUG);
        $this->assertSame($fresh, $this->get('/api/tournaments/public/'.self::SLUG)->getContent());
    }

    public function test_an_unreachable_redis_degrades_to_uncached_reads_and_writes(): void
    {
        $this->useRedis('127.0.0.1', 1);

        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertOk()->assertJsonPath('tournament.id', self::TOURNAMENT);

        // Saving still succeeds; the failed flush is only logged.
        Tournament::find(self::TOURNAMENT)->update(['name' => 'Still saves']);
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', 'Still saves');
    }

    public function test_against_a_live_redis(): void
    {
        $host = env('REDIS_TEST_HOST', '127.0.0.1');
        $port = (int) env('REDIS_TEST_PORT', 6379);

        if (! @fsockopen($host, $port, $errno, $errstr, 0.2)) {
            $this->markTestSkipped("No Redis at $host:$port");
        }

        $this->useRedis($host, $port);
        Cache::flush();

        $original = Tournament::find(self::TOURNAMENT)->name;
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', $original);

        DB::table('tournaments')->where('id', self::TOURNAMENT)->update(['name' => 'Changed quietly']);
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', $original);

        Tournament::find(self::TOURNAMENT)->update(['name' => 'Renamed']);
        $this->getJson('/api/tournaments/public/'.self::SLUG)->assertJsonPath('tournament.name', 'Renamed');

        Cache::flush();
    }

    private function goalsOf(string $playerId): int
    {
        $row = collect($this->getJson('/api/players/tournament/'.self::TOURNAMENT.'/stats?per_page=100')->assertOk()->json('data'))
            ->firstWhere('player_id', $playerId);

        return (int) $row['stats']['goals'];
    }

    private function useRedis(string $host, int $port): void
    {
        config([
            'cache.default' => 'redis',
            'database.redis.client' => 'predis',
            'database.redis.cache.host' => $host,
            'database.redis.cache.port' => $port,
            'database.redis.cache.database' => 15,
            'database.redis.cache.url' => null,
        ]);
        $this->app->forgetInstance('redis');
        Cache::forgetDriver('redis');
    }
}
