<?php

namespace Tests\Feature;

use App\Models\GameMatch;
use App\Models\RegistrationLink;
use App\Models\Tournament;
use App\Services\ScoringEngine;
use Tests\TestCase;

/**
 * Calling off a single match or a whole tournament: history is kept, anything
 * unfinished is frozen, and only the organizer may do it.
 */
class CancellationTest extends TestCase
{
    private const TOURNAMENT_ID = 'tourney-football-sevens';

    private const SCHEDULED_MATCH_ID = 'match-fb-sched-2';

    private const LIVE_MATCH_ID = 'match-fb-live-1';

    public function test_organizer_cancels_a_match_with_a_reason(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/'.self::SCHEDULED_MATCH_ID.'/cancel', ['reason' => 'Heavy rain'])
            ->assertOk()
            ->assertJsonPath('status', 'cancelled')
            ->assertJsonPath('result_summary', 'Match cancelled: Heavy rain');

        $this->assertSame('cancelled', GameMatch::find(self::SCHEDULED_MATCH_ID)->status);
    }

    public function test_a_cancelled_match_cannot_be_scored_or_cancelled_again(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $this->postJson('/api/matches/'.self::LIVE_MATCH_ID.'/cancel')->assertOk();

        $this->postJson('/api/matches/'.self::LIVE_MATCH_ID.'/cancel')->assertStatus(409);

        $match = GameMatch::find(self::LIVE_MATCH_ID);
        $this->expectExceptionMessage('This match has been cancelled');
        app(ScoringEngine::class)->addFootballEvent([
            'matchId' => $match->id,
            'teamId' => $match->team_a_id,
            'playerId' => 'pl-mb-3',
            'eventType' => 'goal',
            'minute' => 40,
        ]);
    }

    public function test_a_completed_match_cannot_be_cancelled(): void
    {
        GameMatch::query()->whereKey(self::SCHEDULED_MATCH_ID)->update(['status' => 'completed']);
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/'.self::SCHEDULED_MATCH_ID.'/cancel')->assertStatus(409);
    }

    public function test_cancelling_a_tournament_cancels_unfinished_matches_and_closes_registration(): void
    {
        GameMatch::query()->whereKey(self::SCHEDULED_MATCH_ID)->update(['status' => 'completed']);
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/tournaments/'.self::TOURNAMENT_ID.'/cancel', ['reason' => 'Ground unavailable'])
            ->assertOk()
            ->assertJsonPath('tournament.status', 'cancelled')
            ->assertJsonPath('cancelled_matches_count', 1);

        $this->assertSame('cancelled', Tournament::find(self::TOURNAMENT_ID)->status);
        $this->assertSame('cancelled', GameMatch::find(self::LIVE_MATCH_ID)->status);
        $this->assertSame('completed', GameMatch::find(self::SCHEDULED_MATCH_ID)->status);
        $this->assertFalse(
            RegistrationLink::query()->where('tournament_id', self::TOURNAMENT_ID)->where('status', 'active')->exists()
        );

        $this->postJson('/api/tournaments/'.self::TOURNAMENT_ID.'/cancel')->assertStatus(409);
    }

    public function test_only_the_owning_organizer_can_cancel(): void
    {
        $this->actingAsUser('scorer@greenvalley.com');
        $this->postJson('/api/matches/'.self::SCHEDULED_MATCH_ID.'/cancel')->assertForbidden();
        $this->postJson('/api/tournaments/'.self::TOURNAMENT_ID.'/cancel')->assertForbidden();

        $this->actingAsUser('admin@malabar.com');
        $this->postJson('/api/matches/'.self::SCHEDULED_MATCH_ID.'/cancel')->assertForbidden();
        $this->postJson('/api/tournaments/'.self::TOURNAMENT_ID.'/cancel')->assertForbidden();

        $this->assertSame('scheduled', GameMatch::find(self::SCHEDULED_MATCH_ID)->status);
        $this->assertNotSame('cancelled', Tournament::find(self::TOURNAMENT_ID)->status);
    }
}
