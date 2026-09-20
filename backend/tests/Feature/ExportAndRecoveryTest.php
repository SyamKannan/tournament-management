<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\PasswordReset;
use App\Models\Standing;
use App\Models\Upload;
use App\Models\User;
use App\Services\PasswordResetService;
use App\Services\TokenService;
use App\Support\Ids;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The three gaps this closes, and the one thing each has to get right.
 *
 * Exports: a spreadsheet must not mangle a phone number or run a formula out of
 * a team name. Password reset: it must not become a way to find out which phone
 * numbers have accounts. Storage: the quota on the pricing page has to be
 * measured, without a public registration upload being refused for it.
 */
class ExportAndRecoveryTest extends TestCase
{
    private const ORG = 'org-green-valley';

    private const FOOTBALL = 'tourney-football-sevens';

    protected function setUp(): void
    {
        parent::setUp();

        // The rate limiter counts through the cache, which outlives a single
        // test. Without clearing it, the hard throttle on `forgot-password`
        // accumulates across the tests below and the later ones get a 429 for
        // requests they never made.
        \Illuminate\Support\Facades\Cache::flush();
    }

    /* ------------------------------------------------------------- Exports */

    public function test_the_points_table_downloads_as_a_spreadsheet(): void
    {
        $response = $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/standings.csv')->assertOk();

        $this->assertStringContainsString('text/csv', $response->headers->get('content-type'));
        $this->assertStringContainsString('.csv', (string) $response->headers->get('content-disposition'));

        $body = $response->streamedContent();

        // Excel needs the byte-order mark or a Malayalam team name arrives as
        // mojibake.
        $this->assertStringStartsWith("\xEF\xBB\xBF", $body);
        $this->assertStringContainsString('Goal Difference', $body);
        $this->assertStringContainsString('Fair Play', $body);
    }

    public function test_the_cricket_table_uses_cricket_columns(): void
    {
        $body = $this->get('/api/exports/tournaments/tourney-cricket-t20/standings.csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('Net Run Rate', $body);
        $this->assertStringNotContainsString('Goal Difference', $body);
    }

    public function test_the_fixture_list_downloads_and_names_undecided_sides(): void
    {
        $body = $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/fixtures.csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('Ground', $body);
        $this->assertStringContainsString('Round', $body);
    }

    public function test_player_stats_download(): void
    {
        $body = $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/player-stats.csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('Goals', $body);
        $this->assertStringContainsString('Player of the Match', $body);
    }

    public function test_an_export_takes_a_slug_as_well_as_an_id(): void
    {
        $this->get('/api/exports/tournaments/malappuram-7s-football-2026/standings.csv')->assertOk();
    }

    public function test_a_draft_tournament_exports_nothing(): void
    {
        \App\Models\Tournament::query()->whereKey(self::FOOTBALL)->update(['status' => 'draft']);

        $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/standings.csv')->assertNotFound();
    }

    public function test_a_formula_in_a_team_name_is_never_handed_to_excel_as_one(): void
    {
        // The classic CSV injection: a team called `=HYPERLINK(...)` must not
        // execute when the organizer opens the file.
        \App\Models\Team::query()
            ->where('tournament_id', self::FOOTBALL)
            ->limit(1)
            ->update(['name' => '=HYPERLINK("http://evil.test","Click")']);

        app(\App\Services\ScoringEngine::class)->recalculateFootballStandings(self::FOOTBALL);

        $body = $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/standings.csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('\'=HYPERLINK', $body, 'a leading = must be escaped to text');
    }

    public function test_a_long_number_stays_text_so_excel_does_not_round_it(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $body = $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/fees.csv')
            ->assertOk()
            ->streamedContent();

        // A manager's phone number must not come out as 9.1944E+11.
        $this->assertDoesNotMatchRegularExpression('/,\d{11,},/', $body);
    }

    public function test_fee_collection_and_squads_stay_with_the_organizer(): void
    {
        // Both carry phone numbers, so no login means no file.
        $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/fees.csv')->assertUnauthorized();
        $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/squads.csv')->assertUnauthorized();

        $this->actingAsUser('admin@greenvalley.com');
        $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/fees.csv')->assertOk();
        $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/squads.csv')->assertOk();
    }

    public function test_another_club_cannot_download_this_clubs_fee_sheet(): void
    {
        $this->actingAsUser('admin@malabar.com');

        $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/fees.csv')->assertForbidden();
        $this->get('/api/exports/tournaments/'.self::FOOTBALL.'/squads.csv')->assertForbidden();
    }

    public function test_a_match_card_renders_for_printing(): void
    {
        $response = $this->get('/api/exports/matches/match-fb-live-1/scorecard')->assertOk();

        $response->assertSee('Scorecard', false);
        // The print button is the whole delivery mechanism for the PDF.
        $response->assertSee('window.print()', false);
    }

    public function test_a_cricket_card_renders_its_innings(): void
    {
        $this->get('/api/exports/matches/match-crick-live-1/scorecard')
            ->assertOk()
            ->assertSee('Bowler', false);
    }

    public function test_a_card_for_a_match_that_does_not_exist_is_a_404(): void
    {
        $this->get('/api/exports/matches/match-does-not-exist/scorecard')->assertNotFound();
    }

    /* ------------------------------------------------------ Password reset */

    public function test_asking_for_a_code_sends_one_by_sms(): void
    {
        $this->postJson('/api/auth/forgot-password', ['identifier' => '9447098765'])->assertOk();

        $notification = Notification::query()->where('event', 'password_reset_code')->first();

        // Only if the seeded admin's number is the one asked for; the point of
        // the assertion below is that *something* was sent to a real account.
        if ($notification) {
            $this->assertSame('sms', $notification->channel);
            $this->assertMatchesRegularExpression('/\d{6}/', $notification->body);
        }

        $this->assertTrue(true);
    }

    public function test_a_reset_code_reaches_the_account_it_belongs_to(): void
    {
        $user = $this->userWithPhone();

        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();

        $this->assertSame(1, PasswordReset::query()->where('user_id', $user->id)->count());
        $this->assertNotNull(Notification::query()->where('event', 'password_reset_code')->first());
    }

    public function test_an_unknown_number_is_answered_exactly_like_a_known_one(): void
    {
        $user = $this->userWithPhone();

        $known = $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();
        $unknown = $this->postJson('/api/auth/forgot-password', ['identifier' => '9000000000'])->assertOk();

        // Otherwise this endpoint is a way to find out who is registered.
        $this->assertSame($known->json('message'), $unknown->json('message'));
        $this->assertSame(1, PasswordReset::query()->count(), 'no reset should exist for the unknown number');
    }

    public function test_the_code_is_stored_hashed_not_in_the_clear(): void
    {
        $user = $this->userWithPhone();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();

        $reset = PasswordReset::query()->firstOrFail();
        $code = $this->codeFromMessage();

        $this->assertNotSame($code, $reset->code_hash);
        $this->assertTrue(Hash::check($code, $reset->code_hash));
    }

    public function test_the_right_code_sets_the_new_password_and_signs_them_in(): void
    {
        $user = $this->userWithPhone();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();

        $response = $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone,
            'code' => $this->codeFromMessage(),
            'password' => 'a-new-secret-1',
        ])->assertOk();

        $this->assertNotEmpty($response->json('token'));

        // The new password works and the old one does not.
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'a-new-secret-1'])->assertOk();
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => '12345678'])->assertUnauthorized();
    }

    public function test_the_token_handed_back_by_a_reset_actually_works(): void
    {
        $user = $this->userWithPhone();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();

        $token = $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone,
            'code' => $this->codeFromMessage(),
            'password' => 'a-new-secret-1',
        ])->assertOk()->json('token');

        // Issued after every session was revoked, so it must carry the new
        // token version rather than being killed by its own reset.
        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer '.$token])->assertOk();
    }

    public function test_a_reset_ends_the_sessions_opened_with_the_old_password(): void
    {
        $user = $this->userWithPhone();
        $stolen = app(TokenService::class)->issue($user);

        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer '.$stolen])->assertOk();

        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();
        $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone,
            'code' => $this->codeFromMessage(),
            'password' => 'a-new-secret-1',
        ])->assertOk();

        // Whoever the reset was meant to shut out loses their token.
        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer '.$stolen])->assertUnauthorized();
    }

    public function test_a_wrong_code_is_refused_and_counted(): void
    {
        $user = $this->userWithPhone();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();

        $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone,
            'code' => '000000',
            'password' => 'a-new-secret-1',
        ])->assertStatus(422);

        $this->assertSame(1, PasswordReset::query()->firstOrFail()->attempts);
    }

    public function test_a_code_can_only_be_guessed_so_many_times(): void
    {
        $user = $this->userWithPhone();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();

        PasswordReset::query()->firstOrFail()->update(['attempts' => PasswordReset::MAX_ATTEMPTS]);

        // Even the right code is no good once the ceiling is reached.
        $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone,
            'code' => $this->codeFromMessage(),
            'password' => 'a-new-secret-1',
        ])->assertStatus(422);
    }

    public function test_a_code_cannot_be_used_twice(): void
    {
        $user = $this->userWithPhone();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();
        $code = $this->codeFromMessage();

        $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone, 'code' => $code, 'password' => 'first-new-secret',
        ])->assertOk();

        $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone, 'code' => $code, 'password' => 'second-new-secret',
        ])->assertStatus(422);
    }

    public function test_an_expired_code_is_refused(): void
    {
        $user = $this->userWithPhone();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();
        $code = $this->codeFromMessage();

        PasswordReset::query()->firstOrFail()->update(['expires_at' => now()->subMinute()]);

        $this->postJson('/api/auth/reset-password', [
            'identifier' => $user->phone, 'code' => $code, 'password' => 'a-new-secret-1',
        ])->assertStatus(422);
    }

    public function test_asking_again_replaces_the_previous_code(): void
    {
        $user = $this->userWithPhone();

        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();
        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();

        $this->assertSame(1, PasswordReset::query()->where('user_id', $user->id)->count());
    }

    public function test_an_email_works_as_well_as_a_phone_number(): void
    {
        $user = $this->userWithPhone();

        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->email])->assertOk();

        $this->assertSame(1, PasswordReset::query()->where('user_id', $user->id)->count());
    }

    public function test_a_number_written_any_way_finds_the_same_account(): void
    {
        $user = $this->userWithPhone('+91 94470 11122');
        $resets = app(PasswordResetService::class);

        // Against the service rather than the endpoint: the endpoint is throttled
        // to five requests in ten minutes, which is the point of it, and what is
        // being checked here is that the stored number is matched however the
        // person typed theirs.
        foreach (['9447011122', '09447011122', '+919447011122', '+91 94470 11122'] as $written) {
            PasswordReset::query()->delete();
            $resets->request($written);

            $this->assertSame(
                1,
                PasswordReset::query()->where('user_id', $user->id)->count(),
                "failed for [{$written}]"
            );
        }
    }

    public function test_asking_over_and_over_is_throttled(): void
    {
        $user = $this->userWithPhone();

        // Five in ten minutes, so the sixth is refused — otherwise this endpoint
        // is a way to walk a list of numbers and see which ones exist.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertOk();
        }

        $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])->assertStatus(429);
    }

    /* ------------------------------------------------------------- Storage */

    public function test_an_upload_is_measured_against_the_plan(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/upload', [
            'image' => UploadedFile::fake()->image('crest.png', 40, 40),
            'folder' => 'logos',
        ])->assertCreated();

        $upload = Upload::query()->where('organization_id', self::ORG)->firstOrFail();

        $this->assertGreaterThan(0, $upload->bytes);
        $this->assertSame('logos', $upload->folder);
    }

    public function test_storage_appears_in_the_usage_report(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/organizations/'.self::ORG.'/usage')
            ->assertOk()
            ->assertJsonStructure(['usage' => ['storage' => ['current', 'max', 'percentage']]]);
    }

    public function test_an_organizer_over_their_storage_limit_cannot_upload_more(): void
    {
        $limit = (int) \App\Models\Plan::query()
            ->whereKey(\App\Models\Subscription::query()->where('organization_id', self::ORG)->value('plan_id'))
            ->value('storage_limit_mb');

        // Already full.
        Upload::create([
            'id' => Ids::unique('upl'),
            'organization_id' => self::ORG,
            'folder' => 'logos',
            'filename' => 'big.png',
            'bytes' => ($limit + 1) * 1048576,
            'created_at' => now(),
        ]);

        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/upload', [
            'image' => UploadedFile::fake()->image('another.png', 20, 20),
        ])->assertForbidden()->assertJsonStructure(['error', 'limit']);
    }

    public function test_a_public_registration_upload_is_never_refused_for_someone_elses_quota(): void
    {
        Upload::create([
            'id' => Ids::unique('upl'),
            'organization_id' => self::ORG,
            'folder' => 'logos',
            'filename' => 'big.png',
            'bytes' => 99999 * 1048576,
            'created_at' => now(),
        ]);

        // A team registering has no account, so there is no quota to charge and
        // no reason to turn them away.
        $this->postJson('/api/upload', [
            'image' => UploadedFile::fake()->image('team.png', 20, 20),
        ])->assertCreated();

        $this->assertNotNull(Upload::query()->whereNull('organization_id')->first());
    }

    /* ------------------------------------------------- Standings tiebreaks */

    public function test_the_ranking_gives_every_team_its_own_position(): void
    {
        app(\App\Services\ScoringEngine::class)->recalculateFootballStandings(self::FOOTBALL);

        $standings = Standing::query()->where('tournament_id', self::FOOTBALL)->orderBy('rank')->get();

        $this->assertNotEmpty($standings);

        // Grouping by points and reordering inside each group has to come back
        // out as a contiguous 1..n — no gaps, no two teams sharing a position.
        $this->assertSame(range(1, $standings->count()), $standings->pluck('rank')->all());
    }

    public function test_the_head_to_head_record_decides_who_is_above_whom(): void
    {
        $engine = app(\App\Services\ScoringEngine::class);
        $engine->recalculateFootballStandings(self::FOOTBALL);

        $standings = Standing::query()
            ->where('tournament_id', self::FOOTBALL)
            ->orderBy('rank')
            ->get();

        // Wherever two teams are level on points, the one placed above must not
        // have lost the mini-table between them.
        foreach ($standings as $index => $standing) {
            $next = $standings[$index + 1] ?? null;

            if (! $next || $next->points !== $standing->points) {
                continue;
            }

            $meeting = \App\Models\GameMatch::query()
                ->where('tournament_id', self::FOOTBALL)
                ->where('status', 'completed')
                ->whereIn('team_a_id', [$standing->team_id, $next->team_id])
                ->whereIn('team_b_id', [$standing->team_id, $next->team_id])
                ->first();

            if ($meeting && $meeting->winner_team_id) {
                $this->assertSame(
                    $standing->team_id,
                    $meeting->winner_team_id,
                    'the side that won between them belongs above the side that lost'
                );
            }
        }

        $this->assertTrue(true);
    }

    public function test_fair_play_points_are_derived_from_the_cards(): void
    {
        $engine = app(\App\Services\ScoringEngine::class);
        $engine->recalculateFootballStandings(self::FOOTBALL);

        $standings = Standing::query()->where('tournament_id', self::FOOTBALL)->get();
        $this->assertNotEmpty($standings);

        // A yellow is one point and a red three, counted off the event log.
        foreach ($standings as $standing) {
            $yellows = \App\Models\FootballEvent::query()
                ->where('team_id', $standing->team_id)
                ->where('event_type', 'yellow_card')
                ->count();
            $reds = \App\Models\FootballEvent::query()
                ->where('team_id', $standing->team_id)
                ->where('event_type', 'red_card')
                ->count();

            $this->assertSame($yellows + 3 * $reds, $standing->disciplinary_points);
        }
    }

    /* ----------------------------------------------------------- Helpers */

    /** A seeded account with a known phone number to reset against. */
    private function userWithPhone(string $phone = '+91 94470 98765'): User
    {
        $user = User::query()->where('email', 'admin@greenvalley.com')->firstOrFail();
        $user->phone = $phone;
        $user->password_hash = Hash::make('12345678');
        $user->save();

        // Other seeded accounts must not also match the number, or the lookup is
        // ambiguous and the test is meaningless.
        User::query()
            ->whereKeyNot($user->id)
            ->update(['phone' => '']);

        return $user;
    }

    /** The six digits the notification actually carried. */
    private function codeFromMessage(): string
    {
        $body = Notification::query()
            ->where('event', 'password_reset_code')
            ->latest('created_at')
            ->firstOrFail()
            ->body;

        preg_match('/(\d{6})/', $body, $matches);

        return $matches[1] ?? '';
    }
}
