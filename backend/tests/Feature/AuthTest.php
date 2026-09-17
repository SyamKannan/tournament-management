<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_login_returns_a_token_with_the_user_and_organization(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin@greenvalley.com',
            'password' => '12345678',
        ])->assertOk();

        $this->assertNotEmpty($response->json('token'));
        $this->assertSame('ORG_ADMIN', $response->json('user.role'));
        $this->assertSame('org-green-valley', $response->json('organization.id'));
        $this->assertNull($response->json('user.password_hash'), 'The password hash must never be returned.');
    }

    public function test_login_is_case_insensitive_on_the_email(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'Admin@GreenValley.com',
            'password' => '12345678',
        ])->assertOk();
    }

    public function test_a_wrong_password_is_rejected(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'admin@greenvalley.com',
            'password' => 'not-the-password',
        ])->assertUnauthorized()->assertJsonPath('error', 'Invalid email or password');
    }

    public function test_one_accounts_password_does_not_open_another_account(): void
    {
        User::query()->where('email', 'admin@malabar.com')->update([
            'password_hash' => Hash::make('a-different-secret'),
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'admin@malabar.com',
            'password' => '12345678',
        ])->assertUnauthorized();
    }

    public function test_an_unknown_email_is_rejected(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => '12345678',
        ])->assertUnauthorized();
    }

    public function test_a_bearer_token_identifies_the_caller_on_later_requests(): void
    {
        $token = $this->postJson('/api/auth/login', [
            'email' => 'admin@greenvalley.com',
            'password' => '12345678',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.email', 'admin@greenvalley.com');
    }

    public function test_a_forged_token_leaves_the_request_anonymous(): void
    {
        $this->withHeader('Authorization', 'Bearer not.a.real.token')
            ->getJson('/api/auth/me')
            ->assertUnauthorized();
    }

    public function test_the_demo_role_header_resolves_a_representative_user(): void
    {
        $this->withHeaders($this->demoHeaders('ORG_ADMIN', 'org-malabar-cricket'))
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.organization_id', 'org-malabar-cricket');
    }

    public function test_the_demo_role_header_is_ignored_when_the_switcher_is_disabled(): void
    {
        config(['app.demo_role_switcher' => false]);

        $this->withHeaders($this->demoHeaders('SUPER_ADMIN'))
            ->getJson('/api/auth/me')
            ->assertUnauthorized();

        $this->withHeaders($this->demoHeaders('SUPER_ADMIN'))
            ->getJson('/api/admin/impersonate/targets')
            ->assertUnauthorized();
    }

    public function test_me_is_unauthorized_without_a_credential(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_public_signup_creates_the_organization_admin_with_no_subscription(): void
    {
        $response = $this->postJson('/api/auth/register-org', [
            'organizationName' => 'Wayanad United Sports Club',
            'organizationType' => 'Sports Club',
            'contactPerson' => 'Anoop K',
            'phone' => '+91 90000 11111',
            'email' => 'anoop@wayanadunited.in',
            'district' => 'Wayanad',
            'password' => 'secret-password',
        ])->assertCreated();

        $organizationId = $response->json('organization.id');

        $this->assertNotEmpty($response->json('token'));
        $this->assertSame('ORG_ADMIN', $response->json('user.role'));
        $this->assertSame('active', $response->json('organization.status'));

        // Signup is free — no plan is chosen (and nothing charged) until the
        // organization tries to host a tournament.
        $this->assertFalse(
            Subscription::query()->where('organization_id', $organizationId)->exists()
        );

        // The submitted password must be stored hashed, then work for sign-in.
        $created = User::query()->where('email', 'anoop@wayanadunited.in')->first();
        $this->assertNotSame('secret-password', $created->password_hash);

        $this->postJson('/api/auth/login', [
            'email' => 'anoop@wayanadunited.in',
            'password' => 'secret-password',
        ])->assertOk();
    }

    public function test_signup_requires_the_core_organization_details(): void
    {
        $this->postJson('/api/auth/register-org', ['organizationName' => 'Nameless'])
            ->assertStatus(422);
    }

    public function test_organization_signup_requires_a_password_and_an_unused_email(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $payload = [
            'organizationName' => 'Passwordless Club',
            'contactPerson' => 'No Password',
            'email' => 'nopass@club.in',
        ];

        $this->postJson('/api/auth/register-org', $payload)->assertStatus(422);

        $this->postJson('/api/auth/register-org', [...$payload, 'password' => 'secret-password'])->assertCreated();
        $this->postJson('/api/auth/register-org', [...$payload, 'password' => 'another-password'])->assertStatus(422);
    }

    public function test_slugs_stay_unique_across_organizations_with_the_same_name(): void
    {
        $payload = [
            'organizationName' => 'Kerala Sports Club',
            'contactPerson' => 'Person One',
            'email' => 'one@ksc.in',
            'password' => 'secret-password',
        ];

        $first = $this->postJson('/api/auth/register-org', $payload)->assertCreated();
        $second = $this->postJson('/api/auth/register-org', [...$payload, 'email' => 'two@ksc.in'])->assertCreated();

        $this->assertNotSame($first->json('organization.slug'), $second->json('organization.slug'));
        $this->assertSame(2, Organization::query()->where('name', 'Kerala Sports Club')->count());
    }

    public function test_a_user_can_update_their_own_name_phone_and_avatar(): void
    {
        $this->withHeaders($this->demoHeaders('ORG_ADMIN', 'org-green-valley'))
            ->putJson('/api/auth/me', [
                'name' => 'Updated Admin Name',
                'phone' => '+91 90000 22222',
                'avatar' => 'https://example.com/avatar.png',
            ])
            ->assertOk()
            ->assertJsonPath('user.name', 'Updated Admin Name')
            ->assertJsonPath('user.phone', '+91 90000 22222')
            ->assertJsonPath('user.avatar', 'https://example.com/avatar.png');
    }

    public function test_updating_the_profile_email_rejects_an_email_already_in_use(): void
    {
        $this->withHeaders($this->demoHeaders('ORG_ADMIN', 'org-green-valley'))
            ->putJson('/api/auth/me', ['email' => 'admin@malabar.com'])
            ->assertStatus(422);
    }

    public function test_changing_password_requires_the_correct_current_password(): void
    {
        $token = $this->postJson('/api/auth/login', [
            'email' => 'admin@greenvalley.com',
            'password' => '12345678',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/auth/me', [
                'current_password' => 'wrong-password',
                'new_password' => 'a-new-secret',
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Current password is incorrect');
    }

    public function test_a_user_can_change_their_password_with_the_correct_current_password(): void
    {
        $token = $this->postJson('/api/auth/login', [
            'email' => 'admin@greenvalley.com',
            'password' => '12345678',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/auth/me', [
                'current_password' => '12345678',
                'new_password' => 'a-new-secret',
            ])
            ->assertOk();

        $this->postJson('/api/auth/login', [
            'email' => 'admin@greenvalley.com',
            'password' => 'a-new-secret',
        ])->assertOk();
    }

    public function test_profile_update_is_unauthorized_without_a_credential(): void
    {
        $this->putJson('/api/auth/me', ['name' => 'Nobody'])->assertUnauthorized();
    }

    public function test_a_suspended_organization_cannot_sign_in_or_keep_working(): void
    {
        \App\Models\Organization::query()->whereKey('org-green-valley')->update(['status' => 'suspended']);

        $this->postJson('/api/auth/login', ['email' => 'admin@greenvalley.com', 'password' => '12345678'])
            ->assertStatus(403)
            ->assertJsonPath('error', 'This organization is suspended. Please contact platform support.');

        // A token issued before the suspension stops working too.
        $this->actingAsUser('admin@greenvalley.com');
        $this->getJson('/api/tournaments')
            ->assertStatus(403)
            ->assertJsonPath('code', 'ORGANIZATION_SUSPENDED');

        // The tournament's public pages are unaffected — they belong to the
        // teams and supporters, not to the organizer's account.
        $this->getJson('/api/tournaments/public/'.\App\Models\Tournament::find('tourney-football-sevens')->slug)->assertOk();
    }

    public function test_signup_refuses_an_email_already_used_in_another_case(): void
    {
        $this->postJson('/api/auth/register-player', [
            'name' => 'Case Test',
            'email' => 'ADMIN@greenvalley.com',
            'password' => '12345678',
            'phone' => '+91 90000 12345',
        ])->assertStatus(422);
    }

    public function test_production_refuses_to_sign_tokens_with_the_public_fallback_secret(): void
    {
        $tokens = app(\App\Services\TokenService::class);
        $user = User::query()->where('email', 'admin@greenvalley.com')->firstOrFail();

        $this->app['env'] = 'production';
        config(['auth.jwt.secret' => \App\Services\TokenService::DEV_FALLBACK_SECRET]);

        try {
            $tokens->issue($user);
            $this->fail('Expected the fallback secret to be rejected in production.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('JWT_SECRET', $e->getMessage());
        }

        config(['auth.jwt.secret' => str_repeat('a', 40)]);
        $this->assertNotEmpty($tokens->issue($user));
    }
}
