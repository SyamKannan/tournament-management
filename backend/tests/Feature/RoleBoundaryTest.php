<?php

namespace Tests\Feature;

use App\Models\Tournament;
use Tests\TestCase;

/**
 * Belonging to an organization is not the same as running it.
 *
 * A team manager's account carries the organizer's `organization_id`, so the
 * tenant check passes for them on every one of these routes — the role is what
 * keeps them out. Without it a manager could delete the tournament they had
 * entered, read every rival's manager phone number and fee balance, or change
 * the organizer's plan.
 */
class RoleBoundaryTest extends TestCase
{
    private const TOURNAMENT = 'tourney-football-sevens';

    public function test_a_team_manager_cannot_run_the_organizers_tournament(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $this->putJson('/api/tournaments/'.self::TOURNAMENT, ['name' => 'Renamed Cup'])->assertForbidden();
        $this->deleteJson('/api/tournaments/'.self::TOURNAMENT)->assertForbidden();
        $this->postJson('/api/tournaments/'.self::TOURNAMENT.'/cancel', ['reason' => 'no'])->assertForbidden();
        $this->postJson('/api/tournaments/'.self::TOURNAMENT.'/registration-link')->assertForbidden();
        $this->postJson('/api/matches/auto-generate-fixtures', ['tournament_id' => self::TOURNAMENT])->assertForbidden();

        $this->assertNotNull(Tournament::find(self::TOURNAMENT), 'The tournament must survive a manager trying to delete it.');
    }

    public function test_a_team_manager_cannot_read_the_organizers_books(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $this->getJson('/api/reports/financials/'.self::TOURNAMENT)->assertForbidden();
        $this->getJson('/api/reports/teams-roster/'.self::TOURNAMENT)->assertForbidden();
        $this->getJson('/api/teams/tournament/'.self::TOURNAMENT)->assertForbidden();
        $this->getJson('/api/organizations/org-green-valley/usage')->assertForbidden();
    }

    public function test_a_team_manager_cannot_change_the_organizers_account_or_plan(): void
    {
        $this->actingAsUser('manager@malabarblasters.com');

        $this->putJson('/api/organizations/org-green-valley', ['name' => 'Hijacked Sports'])->assertForbidden();
        $this->postJson('/api/organizations/org-green-valley/subscribe', ['plan_id' => 'plan-free'])->assertForbidden();
        $this->postJson('/api/sponsors', ['name' => 'Rogue Sponsor'])->assertForbidden();
    }

    public function test_a_scorer_keeps_what_the_match_day_needs(): void
    {
        $this->actingAsUser('scorer@greenvalley.com');

        // Reading the fixtures, the squads and the screen queue.
        $this->getJson('/api/tournaments')->assertOk();
        $this->getJson('/api/tournaments/'.self::TOURNAMENT)->assertOk();
        $this->getJson('/api/teams/tournament/'.self::TOURNAMENT)->assertOk();
        $this->getJson('/api/sponsors/ads?matchId=match-fb-live-1')->assertOk();
        $this->getJson('/api/organizations/org-green-valley')->assertOk();

        // But not the organizer's own decisions.
        $this->deleteJson('/api/tournaments/'.self::TOURNAMENT)->assertForbidden();
        $this->getJson('/api/reports/financials/'.self::TOURNAMENT)->assertForbidden();
    }
}
