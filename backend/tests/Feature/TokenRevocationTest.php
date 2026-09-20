<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\RevokedToken;
use App\Models\User;
use App\Services\TokenService;
use Tests\TestCase;

/**
 * Bearer tokens have to be stoppable before they expire.
 *
 * They are stateless JWTs good for a week, so signing out used to mean nothing
 * more than the browser forgetting one: a copy taken in the meantime kept
 * working, a changed password ended no session, and a suspended organization
 * only took effect once everyone happened to sign out on their own.
 *
 * Two mechanisms, and both are covered here — one token by its `jti`, and
 * every token an account holds by the cut-off on the user.
 */
class TokenRevocationTest extends TestCase
{
    private const ADMIN = 'admin@greenvalley.com';

    /* ----------------------------------------------------- One session */

    public function test_signing_out_stops_the_token_it_was_called_with(): void
    {
        $token = $this->tokenFor(self::ADMIN);

        $this->getJson('/api/auth/me', $this->bearer($token))->assertOk();

        $this->postJson('/api/auth/logout', [], $this->bearer($token))->assertOk();

        $this->getJson('/api/auth/me', $this->bearer($token))
            ->assertUnauthorized()
            ->assertJsonPath('error', 'Not authenticated');
    }

    public function test_signing_out_leaves_the_accounts_other_sessions_alone(): void
    {
        $phone = $this->tokenFor(self::ADMIN);
        $laptop = $this->tokenFor(self::ADMIN);

        $this->postJson('/api/auth/logout', [], $this->bearer($phone))->assertOk();

        $this->getJson('/api/auth/me', $this->bearer($laptop))->assertOk();
    }

    public function test_signing_out_twice_is_harmless(): void
    {
        $token = $this->tokenFor(self::ADMIN);

        $this->postJson('/api/auth/logout', [], $this->bearer($token))->assertOk();
        // The second call arrives with a token the server no longer honours,
        // so it is simply not authenticated — never a 500.
        $this->postJson('/api/auth/logout', [], $this->bearer($token))->assertUnauthorized();

        $this->assertSame(1, RevokedToken::query()->count());
    }

    /* --------------------------------------------------- Every session */

    public function test_signing_out_everywhere_stops_every_token(): void
    {
        $phone = $this->tokenFor(self::ADMIN);
        $laptop = $this->tokenFor(self::ADMIN);

        $this->postJson('/api/auth/logout-everywhere', [], $this->bearer($phone))->assertOk();

        $this->getJson('/api/auth/me', $this->bearer($phone))->assertUnauthorized();
        $this->getJson('/api/auth/me', $this->bearer($laptop))->assertUnauthorized();
    }

    public function test_signing_out_everywhere_does_not_touch_another_account(): void
    {
        $mine = $this->tokenFor(self::ADMIN);
        $theirs = $this->tokenFor('admin@malabar.com');

        $this->postJson('/api/auth/logout-everywhere', [], $this->bearer($mine))->assertOk();

        $this->getJson('/api/auth/me', $this->bearer($theirs))->assertOk();
    }

    public function test_a_fresh_sign_in_works_after_signing_out_everywhere(): void
    {
        $token = $this->tokenFor(self::ADMIN);
        $this->postJson('/api/auth/logout-everywhere', [], $this->bearer($token))->assertOk();

        $new = $this->postJson('/api/auth/login', [
            'email' => self::ADMIN,
            'password' => '12345678',
        ])->assertOk()->json('token');

        $this->getJson('/api/auth/me', $this->bearer($new))->assertOk();
    }

    /* ------------------------------------------------- Password change */

    public function test_changing_a_password_ends_the_sessions_opened_with_the_old_one(): void
    {
        $phone = $this->tokenFor(self::ADMIN);
        $laptop = $this->tokenFor(self::ADMIN);

        $this->putJson('/api/auth/me', [
            'current_password' => '12345678',
            'new_password' => 'a-brand-new-secret',
        ], $this->bearer($laptop))->assertOk();

        $this->getJson('/api/auth/me', $this->bearer($phone))->assertUnauthorized();
    }

    public function test_changing_a_password_hands_back_a_token_that_works(): void
    {
        $laptop = $this->tokenFor(self::ADMIN);

        $replacement = $this->putJson('/api/auth/me', [
            'current_password' => '12345678',
            'new_password' => 'a-brand-new-secret',
        ], $this->bearer($laptop))->assertOk()->json('token');

        $this->assertNotEmpty($replacement, 'a password change must return a replacement token');
        $this->assertNotSame($laptop, $replacement);

        $this->getJson('/api/auth/me', $this->bearer($replacement))->assertOk();
    }

    public function test_an_ordinary_profile_edit_does_not_end_any_session(): void
    {
        $phone = $this->tokenFor(self::ADMIN);
        $laptop = $this->tokenFor(self::ADMIN);

        $response = $this->putJson('/api/auth/me', ['name' => 'Renamed Admin'], $this->bearer($laptop))->assertOk();

        $this->assertNull($response->json('token'), 'only a password change replaces the token');
        $this->getJson('/api/auth/me', $this->bearer($phone))->assertOk();
        $this->assertArrayHasKey('organization', $response->json());
    }

    /* ------------------------------------------------------ Suspension */

    public function test_suspending_an_organization_cuts_off_the_tokens_its_people_hold(): void
    {
        $organizer = $this->tokenFor(self::ADMIN);
        $this->getJson('/api/auth/me', $this->bearer($organizer))->assertOk();

        $this->actingAsUser('syamdas@gmail.com');
        $this->putJson('/api/admin/organizations/org-green-valley/status', ['status' => 'suspended'])->assertOk();

        $this->getJson('/api/auth/me', $this->bearer($organizer))->assertUnauthorized();
    }

    public function test_reactivating_an_organization_leaves_its_people_signed_out(): void
    {
        $organizer = $this->tokenFor(self::ADMIN);

        $this->actingAsUser('syamdas@gmail.com');
        $this->putJson('/api/admin/organizations/org-green-valley/status', ['status' => 'suspended'])->assertOk();
        $this->putJson('/api/admin/organizations/org-green-valley/status', ['status' => 'active'])->assertOk();

        // Lifting a suspension does not hand the old tokens back; signing in
        // again does, which is the point at which the account is checked over.
        $this->getJson('/api/auth/me', $this->bearer($organizer))->assertUnauthorized();

        Organization::query()->whereKey('org-green-valley')->update(['status' => 'active']);

        $fresh = $this->postJson('/api/auth/login', [
            'email' => self::ADMIN,
            'password' => '12345678',
        ])->assertOk()->json('token');

        $this->getJson('/api/auth/me', $this->bearer($fresh))->assertOk();
    }

    /* --------------------------------------------------- Impersonation */

    public function test_ending_an_impersonation_kills_only_the_borrowed_token(): void
    {
        $superAdminToken = $this->tokenFor('syamdas@gmail.com');

        $borrowed = $this->postJson(
            '/api/admin/impersonate',
            ['user_id' => $this->userId(self::ADMIN)],
            $this->bearer($superAdminToken)
        )->assertOk()->json('token');

        // The client signs the borrowed token out before putting its own back.
        $this->postJson('/api/auth/logout', [], $this->bearer($borrowed))->assertOk();

        $this->getJson('/api/auth/me', $this->bearer($borrowed))->assertUnauthorized();
        $this->getJson('/api/auth/me', $this->bearer($superAdminToken))
            ->assertOk()
            ->assertJsonPath('user.role', 'SUPER_ADMIN');

        // And the impersonated organizer's own sessions were never involved.
        $this->getJson('/api/auth/me', $this->bearer($this->tokenFor(self::ADMIN)))->assertOk();
    }

    /* -------------------------------------------------------- Mechanics */

    public function test_a_revoked_token_is_refused_on_every_route_not_just_auth(): void
    {
        $token = $this->tokenFor(self::ADMIN);
        $this->getJson('/api/tournaments', $this->bearer($token))->assertOk();

        $this->postJson('/api/auth/logout', [], $this->bearer($token))->assertOk();

        $this->getJson('/api/tournaments', $this->bearer($token))->assertUnauthorized();
    }

    public function test_a_revoked_token_leaves_a_public_route_readable(): void
    {
        $token = $this->tokenFor(self::ADMIN);
        $this->postJson('/api/auth/logout', [], $this->bearer($token))->assertOk();

        // ResolveApiUser never rejects: a dead credential just makes the
        // caller anonymous, and the public hub stays open as it must.
        $this->getJson('/api/tournaments/public/malappuram-7s-football-2026', $this->bearer($token))->assertOk();
    }

    public function test_a_token_issued_before_revocation_existed_is_still_accepted(): void
    {
        // Pre-upgrade tokens carry no `jti`. They cannot be denylisted one by
        // one, but they are ours — the signature says so — and the cut-off on
        // the user still covers them, so they are not thrown out on deploy.
        $token = $this->legacyTokenFor(self::ADMIN);

        $this->getJson('/api/auth/me', $this->bearer($token))->assertOk();
    }

    public function test_the_cut_off_reaches_a_token_that_has_no_jti(): void
    {
        $token = $this->legacyTokenFor(self::ADMIN);

        app(TokenService::class)->revokeAllFor(User::query()->where('email', self::ADMIN)->firstOrFail());

        $this->getJson('/api/auth/me', $this->bearer($token))->assertUnauthorized();
    }

    public function test_spent_denylist_rows_are_cleared_out(): void
    {
        RevokedToken::create([
            'jti' => 'tok_expired_one',
            'user_id' => $this->userId(self::ADMIN),
            'expires_at' => time() - 60,
            'created_at' => now(),
        ]);

        // Revoking anything prunes what can no longer matter, so the table
        // does not grow forever without a scheduler to sweep it.
        $this->postJson('/api/auth/logout', [], $this->bearer($this->tokenFor(self::ADMIN)))->assertOk();

        $this->assertFalse(RevokedToken::query()->whereKey('tok_expired_one')->exists());
        $this->assertSame(1, RevokedToken::query()->count());
    }

    public function test_signing_out_needs_a_credential(): void
    {
        $this->postJson('/api/auth/logout')->assertUnauthorized();
        $this->postJson('/api/auth/logout-everywhere')->assertUnauthorized();
    }

    /* ---------------------------------------------------------- Helpers */

    /**
     * Per-request, deliberately: `withToken()` would leave the header on every
     * later call in the test, so a request meant to be made as somebody else
     * would still carry this one.
     *
     * @return array<string, string>
     */
    private function bearer(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    private function tokenFor(string $email): string
    {
        return app(TokenService::class)->issue(
            User::query()->where('email', $email)->firstOrFail()
        );
    }

    /** A token shaped the way they were before `jti` was added. */
    private function legacyTokenFor(string $email): string
    {
        $user = User::query()->where('email', $email)->firstOrFail();
        $issuedAt = time();

        return \Firebase\JWT\JWT::encode([
            'id' => $user->id,
            'role' => $user->role,
            'email' => $user->email,
            'iat' => $issuedAt,
            'exp' => $issuedAt + (int) config('auth.jwt.ttl'),
        ], (string) config('auth.jwt.secret'), 'HS256');
    }

    private function userId(string $email): string
    {
        return User::query()->where('email', $email)->firstOrFail()->id;
    }
}
