<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Team;
use App\Models\User;
use Tests\TestCase;

class TenantIsolationTest extends TestCase
{
    public function test_organization_admin_belongs_to_their_organization(): void
    {
        $admin = User::query()->where('email', 'admin@greenvalley.com')->first();

        $this->assertSame('org-green-valley', $admin->organization_id);
    }

    public function test_each_organizations_teams_stay_within_that_organization(): void
    {
        $greenValley = Team::query()->where('organization_id', 'org-green-valley')->get();
        $malabar = Team::query()->where('organization_id', 'org-malabar-cricket')->get();

        $this->assertNotEmpty($greenValley);
        $this->assertNotEmpty($malabar);
        $this->assertEmpty($greenValley->where('organization_id', 'org-malabar-cricket'));
    }

    public function test_tournament_listing_is_scoped_to_the_callers_organization(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->getJson('/api/tournaments')->assertOk();

        $this->assertNotEmpty($response->json());

        foreach ($response->json() as $tournament) {
            $this->assertSame('org-green-valley', $tournament['organization_id']);
        }
    }

    public function test_reading_another_organizations_profile_is_refused_and_audited(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/organizations/org-malabar-cricket')
            ->assertForbidden()
            ->assertJsonPath('code', 'TENANT_ISOLATION_VIOLATION');

        $this->assertTrue(
            AuditLog::query()->where('action', 'SECURITY_TENANT_VIOLATION_BLOCKED')->exists(),
            'A blocked cross-tenant access should be recorded in the audit trail.'
        );
    }

    public function test_reading_another_organizations_tournament_is_refused(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/tournaments/tourney-cricket-t20')
            ->assertForbidden()
            ->assertJsonPath('error', 'You do not have access to this organization.');
    }

    public function test_super_admin_reaches_every_organization(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $this->getJson('/api/organizations/org-malabar-cricket')->assertOk();
        $this->getJson('/api/tournaments/tourney-cricket-t20')->assertOk();
    }

    public function test_organization_admin_cannot_reach_the_super_admin_console(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/admin/metrics')->assertForbidden();
    }
}
