<?php

namespace Tests\Feature;

use App\Models\Auction;
use App\Models\AuctionPlayer;
use App\Models\AuditLog;
use App\Models\Notification;
use App\Models\Player;
use App\Models\Tournament;
use App\Models\User;
use App\Services\AuctionService;
use App\Services\Notifications\Channels\ChannelManager;
use App\Services\Notifications\Channels\TwilioDriver;
use App\Support\PosterJobStatus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The fixes for problems people hit using the product rather than bugs in its
 * logic: unreadable errors, dead-end password recovery, an auction hammer with
 * no undo, paying for a registration that was then refused, lists that
 * truncated or never ended, and a poster spinner that could only time out.
 */
class HumanFacingFixesTest extends TestCase
{
    private const AUCTION_ID = 'auction-football-1';

    /* ----------------------------------------------------------- Error envelope */

    public function test_a_validation_failure_carries_a_readable_error_and_per_field_detail(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->postJson('/api/tournaments', [])->assertStatus(422);

        $this->assertIsString($response->json('error'));
        $this->assertNotSame('', $response->json('error'));
        $this->assertStringNotContainsString('status 422', $response->json('error'));
        $this->assertSame($response->json('error'), $response->json('message'));
        $this->assertSame('VALIDATION_FAILED', $response->json('code'));
        $this->assertIsArray($response->json('errors'));
    }

    public function test_an_unknown_api_route_answers_in_the_same_envelope(): void
    {
        $this->getJson('/api/this-does-not-exist')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND')
            ->assertJsonStructure(['error', 'message', 'code']);
    }

    public function test_rate_limiting_says_how_long_to_wait(): void
    {
        $user = User::query()->where('email', 'admin@greenvalley.com')->firstOrFail();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone]);
        }

        $response = $this->postJson('/api/auth/forgot-password', ['identifier' => $user->phone])
            ->assertStatus(429);

        $this->assertSame('RATE_LIMITED', $response->json('code'));
        $this->assertStringContainsString('try again', $response->json('error'));
    }

    /* ------------------------------------------------------- Delivery honesty */

    public function test_the_log_driver_is_reported_as_simulated_not_delivered(): void
    {
        $channels = app(ChannelManager::class);

        $this->assertTrue($channels->isSimulated('sms'));
        $this->assertNotEmpty($channels->healthIssues());
    }

    public function test_notification_health_is_visible_to_the_super_admin(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $this->getJson('/api/admin/notification-health')
            ->assertOk()
            ->assertJsonStructure(['ok', 'issues', 'drivers' => ['sms', 'whatsapp'], 'available_drivers'])
            ->assertJsonPath('drivers.sms', 'log');
    }

    public function test_a_configured_gateway_with_missing_credentials_is_flagged(): void
    {
        config(['notifications.channels.sms' => 'twilio', 'notifications.twilio.sid' => null]);

        $issues = collect(app(ChannelManager::class)->healthIssues())->where('channel', 'sms');

        $this->assertTrue($issues->contains(fn ($i) => $i['severity'] === 'critical' && str_contains($i['message'], 'TWILIO_SID')));
    }

    public function test_the_twilio_driver_sends_and_classifies_refusals(): void
    {
        config([
            'notifications.twilio.sid' => 'AC123',
            'notifications.twilio.token' => 'secret',
            'notifications.twilio.sms_from' => '+15550001111',
        ]);

        Http::fake([
            'api.twilio.com/*' => Http::sequence()
                ->push(['sid' => 'SM42'], 201)
                ->push(['code' => 21211, 'message' => 'Invalid To number'], 400)
                ->push(['code' => 20500, 'message' => 'Internal error'], 500),
        ]);

        $notification = new Notification(['channel' => 'sms', 'to' => '+919847123456', 'body' => 'Hi', 'event' => 'match_reminder']);
        $driver = new TwilioDriver;

        $sent = $driver->send($notification);
        $this->assertTrue($sent->delivered);
        $this->assertSame('SM42', $sent->reference);

        $rejected = $driver->send($notification);
        $this->assertFalse($rejected->delivered);
        $this->assertFalse($rejected->retryable, 'an invalid number must not be retried');

        $failed = $driver->send($notification);
        $this->assertFalse($failed->delivered);
        $this->assertTrue($failed->retryable, 'a gateway outage should be retried');
    }

    public function test_the_organizer_delivery_log_pages_searches_and_flags_simulated_sends(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $response = $this->getJson('/api/organizations/org-green-valley/notifications?per_page=5&search=zzz-no-match')
            ->assertOk()
            ->assertJsonStructure(['notifications', 'pagination' => ['page', 'per_page', 'total', 'total_pages', 'has_more'], 'delivery', 'counts']);

        $this->assertSame(0, $response->json('pagination.total'));
        $this->assertTrue($response->json('delivery.sms_simulated'));
    }

    /* ------------------------------------------------------ Account recovery */

    public function test_onboarding_a_club_no_longer_hands_out_a_shared_default_password(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $response = $this->postJson('/api/admin/organizations', [
            'name' => 'Kondotty Sports Club',
            'email' => 'kondotty@example.com',
            'contact_person' => 'Rashid',
            'plan_id' => 'plan-free',
        ])->assertCreated();

        $password = $response->json('admin_credentials.temporary_password');
        $this->assertIsString($password);
        $this->assertNotSame('admin123', $password);
        $this->assertGreaterThanOrEqual(10, strlen($password));

        $user = User::query()->where('email', 'kondotty@example.com')->firstOrFail();
        $this->assertTrue((bool) $user->must_change_password);

        $this->postJson('/api/auth/login', ['email' => 'kondotty@example.com', 'password' => 'admin123'])
            ->assertStatus(401);
        $login = $this->postJson('/api/auth/login', ['email' => 'kondotty@example.com', 'password' => $password])
            ->assertOk();
        $this->assertTrue($login->json('user.must_change_password'));
    }

    public function test_a_super_admin_can_get_a_locked_out_user_back_in(): void
    {
        $this->actingAsUser('syamdas@gmail.com');
        $target = User::query()->where('email', 'scorer@greenvalley.com')->firstOrFail();
        $versionBefore = (int) $target->token_version;

        $response = $this->postJson("/api/admin/users/{$target->id}/reset-password")->assertOk();
        $password = $response->json('temporary_password');

        $target->refresh();
        $this->assertTrue((bool) $target->must_change_password);
        $this->assertGreaterThan($versionBefore, (int) $target->token_version, 'old sessions must end');
        $this->assertTrue(AuditLog::query()->where('action', 'SUPER_ADMIN_RESET_PASSWORD')->where('entity_id', $target->id)->exists());

        $this->postJson('/api/auth/login', ['email' => $target->email, 'password' => $password])->assertOk();
    }

    public function test_choosing_a_new_password_clears_the_must_change_flag(): void
    {
        $user = User::query()->where('email', 'scorer@greenvalley.com')->firstOrFail();
        $user->must_change_password = true;
        $user->save();

        $this->actingAsUser('scorer@greenvalley.com');
        $this->putJson('/api/auth/me', [
            'current_password' => '12345678',
            'new_password' => 'my-own-choice',
        ])->assertOk();

        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }

    public function test_an_organizer_can_reset_a_member_but_not_another_admin(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $members = $this->getJson('/api/organizations/org-green-valley/members')->assertOk();
        $ids = collect($members->json('data'))->pluck('id');
        $this->assertTrue($ids->contains('user-manager-blasters'), 'team managers of the club\'s teams are members');

        $scorer = User::query()->where('email', 'scorer@greenvalley.com')->firstOrFail();
        $this->postJson("/api/organizations/org-green-valley/members/{$scorer->id}/reset-password")
            ->assertOk()
            ->assertJsonStructure(['temporary_password']);

        $admin = User::query()->where('email', 'admin@greenvalley.com')->firstOrFail();
        $this->postJson("/api/organizations/org-green-valley/members/{$admin->id}/reset-password")
            ->assertForbidden();

        // Another club's people are not theirs to reset.
        $other = User::query()->where('email', 'admin@malabar.com')->firstOrFail();
        $this->postJson("/api/organizations/org-green-valley/members/{$other->id}/reset-password")
            ->assertNotFound();
    }

    /* ------------------------------------------------------ Paging and search */

    public function test_the_audit_trail_is_paged_and_searched_in_the_database(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        $response = $this->getJson('/api/admin/audit-logs?per_page=2')->assertOk();
        $this->assertCount(2, $response->json('data'));
        $this->assertGreaterThan(2, $response->json('total'));
        $this->assertTrue($response->json('has_more'));

        AuditLog::query()->create([
            'id' => 'audit-needle',
            'organization_id' => null,
            'user_id' => 'x',
            'user_name' => 'Needle Person',
            'user_role' => 'SUPER_ADMIN',
            'action' => 'SOMETHING_RARE',
            'entity_type' => 'Thing',
            'entity_id' => 't1',
            'details' => 'an old incident',
            'ip_address' => '127.0.0.1',
            'created_at' => now()->subYear(),
        ]);

        $found = $this->getJson('/api/admin/audit-logs?search=needle')->assertOk();
        $this->assertSame(1, $found->json('total'));
        $this->assertSame('audit-needle', $found->json('data.0.id'));
    }

    public function test_every_account_is_reachable_for_impersonation_by_searching(): void
    {
        $this->actingAsUser('syamdas@gmail.com');

        for ($i = 0; $i < 60; $i++) {
            User::query()->create([
                'id' => "user-filler-{$i}",
                'name' => 'Aaron Filler '.$i,
                'email' => "filler{$i}@example.com",
                'password_hash' => 'x',
                'role' => 'PLAYER',
            ]);
        }

        User::query()->create([
            'id' => 'user-zz-late',
            'name' => 'Zubair Late Alphabet',
            'email' => 'zubair@example.com',
            'password_hash' => 'x',
            'role' => 'PLAYER',
        ]);

        $unfiltered = $this->getJson('/api/admin/impersonate/targets')->assertOk();
        $this->assertGreaterThan(50, $unfiltered->json('totals.players'));

        $found = $this->getJson('/api/admin/impersonate/targets?search=zubair')->assertOk();
        $this->assertSame(['user-zz-late'], collect($found->json('players'))->pluck('id')->all());
    }

    /* ------------------------------------------------------- Auction undo */

    public function test_a_sale_can_be_undone_while_the_player_is_still_on_the_hammer(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        [$auction, $player, $team] = $this->soldPlayer(12500);
        $squadAfterSale = Player::query()->where('team_id', $team->id)->count();

        $response = $this->postJson('/api/auctions/'.self::AUCTION_ID.'/reopen-hammer')->assertOk();

        $this->assertSame('bidding', $response->json('auction.hammer_state'));
        $this->assertSame('in_hammer', $response->json('player.status'));
        $this->assertNull($response->json('player.sold_to_team_id'));
        $this->assertSame(12500.0, (float) $response->json('auction.current_bid_amount'), 'bidding resumes where it stood');
        $this->assertSame($squadAfterSale - 1, Player::query()->where('team_id', $team->id)->count());

        $purse = collect($response->json('team_purses'))->firstWhere('team_id', $team->id);
        $this->assertSame((float) $auction->team_purse - (float) $purse['spent_amount'], (float) $purse['remaining_purse']);

        $this->assertTrue(AuditLog::query()->where('action', 'AUCTION_HAMMER_REOPENED')->exists());

        // And it can be sold again, to the right team, with its own message.
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/sell-player')->assertOk();
    }

    public function test_undo_is_refused_once_the_sale_has_been_paid_for(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        [, $player] = $this->soldPlayer(9000);

        AuctionPlayer::query()->whereKey($player->id)->update(['payment_status' => 'paid']);

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/reopen-hammer')
            ->assertStatus(409)
            ->assertJsonPath('error', fn (string $e) => str_contains($e, 'payment'));
    }

    public function test_there_is_nothing_to_undo_while_bidding_is_open(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = $this->approvedPoolPlayer();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/reopen-hammer')->assertStatus(409);
    }

    public function test_an_unsold_call_can_be_undone_too(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $player = $this->approvedPoolPlayer();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/unsold-player')->assertOk();

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/reopen-hammer')
            ->assertOk()
            ->assertJsonPath('player.status', 'in_hammer');
    }

    /* ----------------------------------------------- Pay-then-register safety */

    public function test_a_registration_is_checked_before_any_money_is_taken(): void
    {
        $token = Tournament::find('tourney-football-sevens')->registrationLink->token;

        $this->postJson("/api/teams/public/registration/{$token}/validate", [
            'team_name' => 'Too Few FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 88888',
            'players' => [['full_name' => 'Only One', 'jersey_number' => 1]],
            'payment_method' => 'card',
        ])->assertStatus(400)
            ->assertJsonPath('error', fn (string $e) => str_contains($e, 'Minimum'));

        $this->postJson("/api/teams/public/registration/{$token}/validate", [
            'team_name' => 'Full Squad FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 88888',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'card',
            'payment_option' => 'full',
        ])->assertOk()->assertJsonPath('ok', true);

        $this->assertSame(0, Tournament::find('tourney-football-sevens')->teams()->where('name', 'Full Squad FC')->count());
    }

    public function test_retrying_a_paid_registration_whose_response_was_lost_returns_the_receipt(): void
    {
        $token = Tournament::find('tourney-football-sevens')->registrationLink->token;
        $paid = $this->payWithDemoCard($token);
        $entry = [
            'team_name' => 'Lost Signal FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 12121',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'card',
            'payment_option' => 'full',
            ...$paid,
        ];

        $first = $this->postJson("/api/teams/public/registration/{$token}", $entry)->assertCreated();

        $retry = $this->postJson("/api/teams/public/registration/{$token}", $entry)->assertOk();
        $this->assertTrue($retry->json('replayed'));
        $this->assertSame($first->json('team.id'), $retry->json('team.id'));
        $this->assertSame(1, Tournament::find('tourney-football-sevens')->teams()->where('name', 'Lost Signal FC')->count());
    }

    public function test_a_paid_registration_that_is_then_refused_is_flagged_for_refund(): void
    {
        $token = Tournament::find('tourney-football-sevens')->registrationLink->token;

        // Someone else registers the same manager number between check and pay.
        $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Got There First FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 34343',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "Q{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'pay_at_ground',
        ])->assertCreated();

        $paid = $this->payWithDemoCard($token);

        $response = $this->postJson("/api/teams/public/registration/{$token}", [
            'team_name' => 'Too Late FC',
            'manager_name' => 'Manager',
            'manager_phone' => '+91 90000 34343',
            'players' => collect(range(1, 8))->map(fn (int $n) => ['full_name' => "P{$n}", 'jersey_number' => $n])->all(),
            'payment_method' => 'card',
            'payment_option' => 'full',
            ...$paid,
        ])->assertStatus(409);

        $this->assertTrue($response->json('refund_pending'));
        $this->assertSame($paid['razorpay_payment_id'], $response->json('payment_reference'));
        $this->assertTrue(AuditLog::query()->where('action', 'REGISTRATION_PAYMENT_NEEDS_REFUND')->exists());
    }

    /* ---------------------------------------------------------- Poster jobs */

    public function test_a_poster_request_can_be_followed_by_id(): void
    {
        Queue::fake();
        $this->actingAsUser('admin@greenvalley.com');

        // Posters are a plan feature; make sure this club's plan has it.
        $planId = \App\Models\Subscription::query()
            ->where('organization_id', 'org-green-valley')
            ->where('status', 'active')
            ->value('plan_id');
        $plan = \App\Models\Plan::findOrFail($planId);
        $plan->features = array_values(array_unique([...($plan->features ?? []), 'ai_tournament_poster']));
        $plan->save();

        $jobId = $this->postJson('/api/posters/generate', [
            'poster_type' => 'tournament_announcement',
            'tournament_id' => 'tourney-football-sevens',
        ])->assertStatus(202)->json('job_id');

        Queue::assertPushed(\App\Jobs\GeneratePoster::class);
        $this->assertNotEmpty($jobId);

        $this->getJson("/api/posters/jobs/{$jobId}")
            ->assertOk()
            ->assertJsonPath('status', 'queued')
            ->assertJsonPath('stalled', false);

        PosterJobStatus::put($jobId, ['status' => 'failed', 'message' => 'Could not be created']);
        $this->getJson("/api/posters/jobs/{$jobId}")->assertJsonPath('status', 'failed');

        $this->getJson('/api/posters/jobs/pjob-unknown')->assertNotFound();
    }

    /* ------------------------------------------------------------- Helpers */

    /** @return array{0: Auction, 1: AuctionPlayer, 2: \App\Models\Team} */
    private function soldPlayer(int $price): array
    {
        $auction = Auction::find(self::AUCTION_ID);
        $player = $this->approvedPoolPlayer();
        $purse = app(AuctionService::class)->teamPurses($auction)[0];
        $team = \App\Models\Team::findOrFail($purse['team_id']);

        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/call-player', ['player_id' => $player->id])->assertOk();
        $price = max($price, (int) $player->base_price);
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/place-bid', ['team_id' => $team->id, 'amount' => $price])->assertOk();
        $this->postJson('/api/auctions/'.self::AUCTION_ID.'/sell-player')->assertOk();

        return [$auction->fresh(), $player->fresh(), $team];
    }

    private function approvedPoolPlayer(): AuctionPlayer
    {
        $player = AuctionPlayer::query()->where('auction_id', self::AUCTION_ID)->firstOrFail();
        $player->status = 'approved';
        $player->save();

        return $player;
    }

    private function payWithDemoCard(string $token): array
    {
        $order = $this->postJson("/api/teams/public/registration/{$token}/payment-order", [
            'payment_option' => 'full',
            'method' => 'card',
        ])->assertOk()->json();

        return $this->postJson("/api/payments/demo/{$order['order_id']}/pay", [
            'method' => 'card',
            'card_number' => '4111 1111 1111 1111',
            'card_name' => 'Vineeth S',
            'card_expiry' => '12/40',
            'card_cvv' => '123',
        ])->assertOk()->json();
    }
}
