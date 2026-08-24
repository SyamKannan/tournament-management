<?php

namespace Tests;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    /**
     * Tests run against the same demo dataset the application ships with, so
     * assertions can reference known organizations, tournaments and fixtures.
     */
    protected bool $seed = true;

    protected string $seeder = DatabaseSeeder::class;

    /** The user the test is currently acting as. */
    protected ?User $actingUser = null;

    protected function actingAsUser(string $email): User
    {
        $user = User::query()->where('email', $email)->firstOrFail();
        $this->actingUser = $user;

        return tap($user, fn () => $this->actingAs($user));
    }

    /**
     * Headers for the role-switcher credential the SPA uses when no token is held.
     */
    protected function demoHeaders(string $role, ?string $organizationId = null): array
    {
        return array_filter([
            'x-demo-role' => $role,
            'x-demo-org-id' => $organizationId,
        ]);
    }
}
