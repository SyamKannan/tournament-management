<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\Organization;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PlatformStatsTest extends TestCase
{
    public function test_sign_in_page_counts_come_from_the_database(): void
    {
        Cache::forget('platform-stats');

        $this->getJson('/api/platform-stats')
            ->assertOk()
            ->assertExactJson([
                'clubs' => Organization::query()->where('status', 'active')->count(),
                'tournaments' => \App\Models\Tournament::query()->where('status', '!=', 'draft')->count(),
                'teams' => \App\Models\Team::query()->whereNotIn('status', ['rejected', 'withdrawn'])->count(),
                'players' => \App\Models\Player::query()->count(),
                'matches_played' => GameMatch::query()->where('status', 'completed')->count(),
                'live_matches' => GameMatch::query()
                    ->whereIn('status', ['toss', 'in_progress', 'half_time', 'innings_break', 'drinks_break'])
                    ->count(),
            ]);
    }

    public function test_the_counts_carry_no_personal_data(): void
    {
        Cache::forget('platform-stats');

        foreach ($this->getJson('/api/platform-stats')->json() as $value) {
            $this->assertIsInt($value);
        }
    }
}
