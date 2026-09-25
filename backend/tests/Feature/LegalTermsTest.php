<?php

namespace Tests\Feature;

use App\Models\LegalAcceptance;
use App\Models\Team;
use App\Models\User;
use App\Services\LegalService;
use App\Services\TokenService;
use Tests\TestCase;

/**
 * Every account agrees to the Terms & Conditions and Privacy Policy: at
 * signup, or — for accounts that predate them, were made by an admin, or owe
 * a new version — before the API lets them do anything else.
 */
class LegalTermsTest extends TestCase
{
    private const ADMIN = 'admin@greenvalley.com';

    private const SUPER_ADMIN = 'syamdas@gmail.com';

    private const BODY = 'These are the terms everyone agrees to before using the platform. Long enough to publish.';

    /* ---------------------------------------------------------- No documents */

    public function test_nothing_is_asked_before_any_document_is_published(): void
    {
        $token = $this->tokenFor(self::ADMIN);

        $this->getJson('/api/auth/me', $this->bearer($token))->assertOk()->assertJsonPath('user.legal_pending', []);
        $this->getJson('/api/tournaments', $this->bearer($token))->assertOk();

        $this->postJson('/api/auth/register-player', $this->playerSignup())->assertCreated();

        $this->getJson('/api/legal/terms')
            ->assertNotFound()
            ->assertJsonPath('error', 'This document has not been published yet.');
        $this->getJson('/api/legal/cookies')
            ->assertNotFound()
            ->assertJsonPath('error', 'There is no such document.');
    }

    /* ---------------------------------------------------------------- Signup */

    public function test_signup_is_refused_without_agreeing(): void
    {
        $this->publishBoth();

        $this->postJson('/api/auth/register-player', $this->playerSignup())
            ->assertStatus(422)
            ->assertJsonPath('errors.accept_terms.0', 'Please agree to the Terms & Conditions and Privacy Policy to create your account.');

        $this->postJson('/api/auth/register-org', [...$this->orgSignup(), 'accept_terms' => false])->assertStatus(422);

        $this->assertFalse(User::query()->where('email', 'new.player@example.com')->exists());
    }

    public function test_signup_records_what_was_agreed_to(): void
    {
        $this->publishBoth();

        $response = $this->postJson('/api/auth/register-org', [...$this->orgSignup(), 'accept_terms' => true])
            ->assertCreated()
            ->assertJsonPath('user.legal_pending', []);

        $user = User::find($response->json('user.id'));
        $this->assertSame(1, $user->terms_version_accepted);
        $this->assertSame(1, $user->privacy_version_accepted);

        $rows = LegalAcceptance::query()->where('user_id', $user->id)->get();
        $this->assertEqualsCanonicalizing(['terms', 'privacy'], $rows->pluck('type')->all());
        $this->assertSame(['signup'], $rows->pluck('method')->unique()->values()->all());

        // Straight into the app — nothing further to accept.
        $this->getJson('/api/tournaments', $this->bearer($response->json('token')))->assertOk();
    }

    /* ------------------------------------------------------ Existing accounts */

    public function test_an_existing_account_is_held_until_it_accepts(): void
    {
        $this->publishBoth();
        $token = $this->tokenFor(self::ADMIN);

        $this->getJson('/api/tournaments', $this->bearer($token))
            ->assertForbidden()
            ->assertJsonPath('code', 'TERMS_NOT_ACCEPTED')
            ->assertJsonPath('pending', ['terms', 'privacy']);

        // What it needs to get through stays open.
        $this->getJson('/api/auth/me', $this->bearer($token))
            ->assertOk()
            ->assertJsonPath('user.legal_pending', ['terms', 'privacy'])
            ->assertJsonPath('user.legal_accepted_before', false);
        $this->getJson('/api/legal/terms')->assertOk()->assertJsonPath('version', 1);

        $this->postJson('/api/auth/accept-terms', ['accept' => false], $this->bearer($token))->assertStatus(422);

        $this->postJson('/api/auth/accept-terms', ['accept' => true], $this->bearer($token))
            ->assertOk()
            ->assertJsonPath('user.legal_pending', []);

        $this->getJson('/api/tournaments', $this->bearer($token))->assertOk();
        $this->assertSame(2, LegalAcceptance::query()->where('method', 'prompt')->count());
    }

    public function test_public_pages_stay_open_to_everyone(): void
    {
        $this->publishBoth();

        $this->getJson('/api/plans')->assertOk();
        $this->getJson('/api/matches/match-fb-live-1')->assertOk();
    }

    /* -------------------------------------------------------------- Versions */

    public function test_a_minor_version_asks_nothing_and_a_major_one_asks_again(): void
    {
        $this->publishBoth();
        $user = User::query()->where('email', self::ADMIN)->firstOrFail();
        app(LegalService::class)->accept($user, request(), 'prompt');
        $token = $this->tokenFor(self::ADMIN);

        $this->publish('terms', ['requires_reacceptance' => false, 'summary_of_changes' => 'Fixed a typo.']);

        $this->getJson('/api/legal/terms')->assertOk()->assertJsonPath('version', 2);
        $this->getJson('/api/tournaments', $this->bearer($token))->assertOk();

        $this->publish('terms', ['requires_reacceptance' => true, 'summary_of_changes' => 'New refund rules.']);

        $this->getJson('/api/tournaments', $this->bearer($token))
            ->assertForbidden()
            ->assertJsonPath('pending', ['terms']);
        // A returning account, so the client words it as an update.
        $this->getJson('/api/auth/me', $this->bearer($token))->assertJsonPath('user.legal_accepted_before', true);

        $this->postJson('/api/auth/accept-terms', ['accept' => true], $this->bearer($token))->assertOk();
        $this->assertSame(3, $user->fresh()->terms_version_accepted);

        // Every earlier version is still readable, exactly as published.
        $this->getJson('/api/legal/terms/versions/1')->assertOk()->assertJsonPath('body', self::BODY);
        $this->getJson('/api/legal/terms/versions/9')->assertNotFound();
    }

    public function test_the_first_version_always_requires_acceptance(): void
    {
        $this->publish('terms', ['requires_reacceptance' => false]);

        $this->getJson('/api/legal/terms')->assertJsonPath('requires_reacceptance', true);
    }

    /* ------------------------------------------------------------ Exemptions */

    public function test_super_admins_and_impersonation_are_not_held(): void
    {
        $this->publishBoth();
        $superToken = $this->tokenFor(self::SUPER_ADMIN);

        $this->getJson('/api/admin/metrics', $this->bearer($superToken))->assertOk();

        $borrowed = $this->postJson(
            '/api/admin/impersonate',
            ['user_id' => User::query()->where('email', self::ADMIN)->value('id')],
            $this->bearer($superToken)
        )->assertOk()->json('token');

        // The admin can look around the club's account…
        $this->getJson('/api/tournaments', $this->bearer($borrowed))->assertOk();

        // …but cannot agree to the terms on the organizer's behalf.
        $this->postJson('/api/auth/accept-terms', ['accept' => true], $this->bearer($borrowed))->assertForbidden();
        $this->assertNull(User::query()->where('email', self::ADMIN)->value('terms_version_accepted'));
    }

    public function test_the_dev_role_switcher_is_not_held(): void
    {
        $this->publishBoth();

        // It has no sign-in and so nowhere to show the prompt.
        $this->getJson('/api/tournaments', $this->demoHeaders('ORG_ADMIN', 'org-green-valley'))->assertOk();
    }

    /* -------------------------------------------------------- Team entries */

    public function test_a_team_registration_link_needs_the_box_ticked_before_checkout(): void
    {
        $this->publishBoth();
        $token = $this->openDirectRegistration();
        $entry = [
            'team_name' => 'Terms FC',
            'manager_name' => 'Terms Manager',
            'manager_phone' => '+91 90000 77777',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "Player {$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'pay_at_ground',
        ];

        // Refused at the pre-payment check, so nobody pays first.
        $this->postJson("/api/teams/public/registration/{$token}/validate", $entry)
            ->assertStatus(422)
            ->assertJsonPath('errors.accept_terms.0', 'Please agree to the Terms & Conditions and Privacy Policy to register your team.');

        $team = $this->postJson("/api/teams/public/registration/{$token}", [...$entry, 'accept_terms' => true])
            ->assertCreated()
            ->json('team');

        $this->assertArrayNotHasKey('legal_accepted', $team);
        $record = Team::find($team['id'])->legal_accepted;
        $this->assertSame(1, $record['terms']);
        $this->assertSame(1, $record['privacy']);
    }

    /* ----------------------------------------------------------- Admin side */

    public function test_only_the_super_admin_publishes_and_sees_who_accepted(): void
    {
        $this->actingAsUser(self::ADMIN);
        $this->postJson('/api/admin/legal/terms', ['title' => 'T', 'body' => self::BODY])->assertForbidden();

        $this->publishBoth();
        $user = User::query()->where('email', self::ADMIN)->firstOrFail();
        app(LegalService::class)->accept($user, request(), 'prompt');

        $this->actingAsUser(self::SUPER_ADMIN);

        $this->postJson('/api/admin/legal/terms', ['title' => 'Terms', 'body' => 'too short'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('body');
        $this->postJson('/api/admin/legal/cookies', ['title' => 'Cookies', 'body' => self::BODY])->assertNotFound();
        $this->postJson('/api/admin/legal/privacy', [
            'title' => 'Privacy Policy',
            'body' => self::BODY,
            'requires_reacceptance' => false,
        ])->assertCreated()->assertJsonPath('version', 2);

        $index = $this->getJson('/api/admin/legal')->assertOk();
        $this->assertSame(1, $index->json('documents.terms.required_version'));
        $this->assertSame(1, $index->json('documents.terms.coverage.accepted'));
        $this->assertSame(1, $index->json('documents.terms.versions.0.acceptances'));

        $this->getJson('/api/admin/legal/terms/versions/1/acceptances')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.email', self::ADMIN);
        $this->getJson('/api/admin/legal/terms/versions/1/acceptances?search=GREENVALLEY')->assertJsonPath('total', 1);
        $this->getJson('/api/admin/legal/terms/versions/1/acceptances?search=nobody-here')->assertJsonPath('total', 0);

        $this->assertDatabaseHas('audit_logs', ['action' => 'LEGAL_DOCUMENT_PUBLISHED']);
    }

    /* --------------------------------------------------------------- Helpers */

    private function publishBoth(): void
    {
        $this->publish('terms');
        $this->publish('privacy');
    }

    private function publish(string $type, array $overrides = []): void
    {
        $admin = User::query()->where('email', self::SUPER_ADMIN)->firstOrFail();

        app(LegalService::class)->publish($type, [
            'title' => $type === 'terms' ? 'Terms & Conditions' : 'Privacy Policy',
            'body' => self::BODY,
            ...$overrides,
        ], $admin);
    }

    private function openDirectRegistration(): string
    {
        $this->actingAsUser(self::ADMIN);
        app(LegalService::class)->accept($this->actingUser, request(), 'prompt');

        $this->putJson('/api/tournaments/tourney-highland-7s/auction', ['has_auction' => false])->assertOk();
        $token = $this->getJson('/api/tournaments/tourney-highland-7s')->json('registration_link.token');

        // The rest happens as an anonymous visitor on the shared link.
        auth()->forgetUser();

        return $token;
    }

    private function playerSignup(): array
    {
        return [
            'name' => 'New Player',
            'email' => 'new.player@example.com',
            'password' => 'secret-password',
            'phone' => '+91 90000 44444',
        ];
    }

    private function orgSignup(): array
    {
        return [
            'organizationName' => 'Terms Sports Club',
            'contactPerson' => 'Terms Person',
            'phone' => '+91 90000 66666',
            'email' => 'terms@club.example',
            'password' => 'secret-password',
        ];
    }

    private function bearer(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    private function tokenFor(string $email): string
    {
        return app(TokenService::class)->issue(User::query()->where('email', $email)->firstOrFail());
    }
}
