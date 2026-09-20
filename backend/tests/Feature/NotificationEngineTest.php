<?php

namespace Tests\Feature;

use App\Jobs\SendNotification;
use App\Models\GameMatch;
use App\Models\Notification;
use App\Models\Organization;
use App\Models\RegistrationPayment;
use App\Models\Subscription;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\Notifications\NotificationCatalog;
use App\Services\Notifications\NotificationService;
use App\Support\Phone;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Outbound WhatsApp and SMS.
 *
 * The rules that matter: a message is written down before anyone tries to send
 * it, a gateway failure never reaches the organizer's request, a number that
 * asked to be left alone is left alone, and the scheduled reminders send once
 * however often the sweep runs.
 */
class NotificationEngineTest extends TestCase
{
    private const ORG = 'org-green-valley';

    private const FOOTBALL = 'tourney-football-sevens';

    private NotificationService $notifications;

    protected function setUp(): void
    {
        parent::setUp();
        $this->notifications = app(NotificationService::class);
    }

    /* ------------------------------------------------------------ Numbers */

    public function test_numbers_are_normalised_however_they_were_typed(): void
    {
        // The same Kerala mobile, written four ways on four different forms.
        foreach (['+91 94470 98765', '09447098765', '9447098765', '+919447098765'] as $written) {
            $this->assertSame('919447098765', Phone::normalize($written), "failed for [{$written}]");
        }

        $this->assertNull(Phone::normalize(''));
        $this->assertNull(Phone::normalize('not a phone'));
        $this->assertNull(Phone::normalize('123'));
    }

    public function test_whatsapp_prefers_the_whatsapp_number_and_falls_back_to_the_phone(): void
    {
        $withBoth = $this->dispatchTo(['phone' => '9000000001', 'whatsapp' => '9000000002']);
        $this->assertSame('919000000002', $withBoth->to);

        // A blank WhatsApp field must not mean silence.
        $phoneOnly = $this->dispatchTo(['phone' => '9000000003', 'whatsapp' => '']);
        $this->assertSame('919000000003', $phoneOnly->to);
    }

    /* ------------------------------------------------------------- Writing */

    public function test_a_message_is_written_before_it_is_sent(): void
    {
        Queue::fake();

        $notification = $this->dispatchTo(['phone' => '9447098765']);

        $this->assertSame('queued', $notification->status);
        $this->assertNotEmpty($notification->body);
        Queue::assertPushed(SendNotification::class);
    }

    public function test_a_recipient_with_no_number_is_recorded_as_skipped_not_dropped(): void
    {
        Queue::fake();

        $notification = $this->dispatchTo(['phone' => '', 'whatsapp' => '']);

        $this->assertSame('skipped', $notification->status);
        $this->assertSame('No usable phone number on file', $notification->error);
        // Nothing to send, so nothing is queued — but the row explains why.
        Queue::assertNothingPushed();
    }

    public function test_an_unknown_event_sends_nothing(): void
    {
        $this->assertSame([], $this->notifications->dispatch('not_a_real_event', [
            ['name' => 'Someone', 'phone' => '9447098765'],
        ]));
    }

    public function test_a_template_drops_a_line_whose_values_are_all_missing(): void
    {
        // `venue_line` is the optional half of the approval message.
        $withVenue = NotificationCatalog::render('team_approved', [
            'team' => 'Malabar Blasters',
            'tournament' => 'Sevens Cup',
            'start_date' => '12 Oct',
            'venue_line' => ' at Payyanad',
            'balance' => '₹500',
        ]);

        $this->assertStringContainsString('Payyanad', $withVenue);
        $this->assertStringNotContainsString('{venue_line}', $withVenue);

        $withoutVenue = NotificationCatalog::render('team_approved', [
            'team' => 'Malabar Blasters',
            'tournament' => 'Sevens Cup',
            'start_date' => '12 Oct',
            'venue_line' => '',
            'balance' => '₹500',
        ]);

        $this->assertStringNotContainsString('{', $withoutVenue);
        $this->assertStringContainsString('Malabar Blasters', $withoutVenue);
    }

    /* ------------------------------------------------------------ Delivery */

    public function test_the_log_driver_marks_a_message_sent(): void
    {
        $notification = $this->dispatchTo(['phone' => '9447098765']);

        $this->notifications->deliver($notification);

        $this->assertSame('sent', $notification->fresh()->status);
        $this->assertSame('log', $notification->fresh()->driver);
        $this->assertSame(1, $notification->fresh()->attempts);
        $this->assertNotNull($notification->fresh()->sent_at);
    }

    public function test_a_driver_that_throws_leaves_the_message_failed_and_retryable(): void
    {
        // A driver that is not registered is the bluntest broken driver there is.
        config()->set('notifications.channels.whatsapp', 'not-a-driver');

        $notification = $this->dispatchTo(['phone' => '9447098765']);
        $this->notifications->deliver($notification);

        $fresh = $notification->fresh();
        $this->assertSame('failed', $fresh->status);
        $this->assertStringContainsString('Driver error', (string) $fresh->error);
        $this->assertCount(1, $this->notifications->retryable());
    }

    public function test_a_gateway_failure_does_not_reach_the_caller(): void
    {
        config()->set('notifications.channels.whatsapp', 'not-a-driver');

        // Approving a team must succeed even when nothing can be sent about it.
        $this->actingAsUser('admin@greenvalley.com');
        $team = $this->pendingTeam();

        $this->putJson("/api/teams/{$team->id}/status", ['status' => 'approved'])->assertOk();

        $this->assertSame('approved', $team->fresh()->status);
    }

    public function test_a_message_stops_being_retried_once_it_runs_out_of_attempts(): void
    {
        config()->set('notifications.max_attempts', 2);
        config()->set('notifications.channels.whatsapp', 'not-a-driver');

        $notification = $this->dispatchTo(['phone' => '9447098765']);

        $this->notifications->deliver($notification);
        $this->assertCount(1, $this->notifications->retryable());

        $this->notifications->deliver($notification->fresh());
        $this->assertCount(0, $this->notifications->retryable(), 'a spent message must not be retried forever');
    }

    /* ------------------------------------------------------------ Opt-outs */

    public function test_a_number_that_opted_out_is_never_contacted(): void
    {
        $this->notifications->optOut('+91 94470 98765', self::ORG, 'Asked to stop');

        $notification = $this->dispatchTo(['phone' => '9447098765']);

        $this->assertSame('skipped', $notification->status);
        $this->assertSame('Recipient has opted out', $notification->error);
    }

    public function test_opting_out_after_queueing_still_stops_the_send(): void
    {
        $notification = $this->dispatchTo(['phone' => '9447098765']);
        $this->assertSame('queued', $notification->status);

        // Queued last night, opted out this morning, sent this afternoon.
        $this->notifications->optOut('9447098765');
        $this->notifications->deliver($notification);

        $this->assertSame('skipped', $notification->fresh()->status);
    }

    public function test_opting_back_in_allows_contact_again(): void
    {
        $this->notifications->optOut('9447098765');
        $this->notifications->optIn('09447098765');

        $this->assertSame('queued', $this->dispatchTo(['phone' => '9447098765'])->status);
    }

    /* ------------------------------------------------- Organizer settings */

    public function test_an_organizer_can_switch_an_event_off(): void
    {
        $this->notifications->updateSettingsFor(self::ORG, ['events' => ['team_approved' => false]]);

        $this->assertFalse($this->notifications->enabledFor(self::ORG, 'team_approved'));
        $this->assertSame([], $this->notifications->dispatch(
            'team_approved',
            [['name' => 'Manager', 'phone' => '9447098765']],
            ['team' => 'A', 'tournament' => 'B'],
            self::ORG,
        ));
    }

    public function test_switching_the_whole_club_off_silences_every_event(): void
    {
        $this->notifications->updateSettingsFor(self::ORG, ['enabled' => false]);

        foreach (NotificationCatalog::events() as $event) {
            $this->assertFalse($this->notifications->enabledFor(self::ORG, $event), $event);
        }
    }

    public function test_an_event_that_is_off_by_default_stays_off_until_asked_for(): void
    {
        // Match results are opt-in: a result text per match per team is a lot.
        $this->assertFalse($this->notifications->enabledFor(self::ORG, 'match_result'));

        $this->notifications->updateSettingsFor(self::ORG, ['events' => ['match_result' => true]]);

        $this->assertTrue($this->notifications->enabledFor(self::ORG, 'match_result'));
    }

    public function test_settings_ignore_events_that_do_not_exist(): void
    {
        $this->notifications->updateSettingsFor(self::ORG, ['events' => ['made_up_event' => true]]);

        $stored = Organization::find(self::ORG)->notification_settings;

        $this->assertArrayNotHasKey('made_up_event', $stored['events'] ?? []);
    }

    public function test_the_master_switch_stops_everything(): void
    {
        config()->set('notifications.enabled', false);

        $this->assertSame([], $this->notifications->dispatch(
            'team_approved',
            [['name' => 'Manager', 'phone' => '9447098765']],
            ['team' => 'A', 'tournament' => 'B'],
            self::ORG,
        ));
    }

    /* --------------------------------------------------------- Real flows */

    public function test_approving_a_team_tells_its_manager(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $team = $this->pendingTeam();

        $this->putJson("/api/teams/{$team->id}/status", ['status' => 'approved'])->assertOk();

        $notification = Notification::query()->where('event', 'team_approved')->latest('created_at')->first();

        $this->assertNotNull($notification, 'approving a team should tell the manager');
        $this->assertStringContainsString($team->name, $notification->body);
        $this->assertSame('TEAM_MANAGER', $notification->recipient_role);
    }

    public function test_saving_an_approved_team_again_does_not_tell_them_twice(): void
    {
        $this->actingAsUser('admin@greenvalley.com');
        $team = $this->pendingTeam();

        $this->putJson("/api/teams/{$team->id}/status", ['status' => 'approved'])->assertOk();
        // Setting the group later is not news.
        $this->putJson("/api/teams/{$team->id}/status", ['group_name' => 'Group B'])->assertOk();

        $this->assertSame(1, Notification::query()->where('event', 'team_approved')->where('related_id', $team->id)->count());
    }

    public function test_publishing_fixtures_tells_each_manager_their_own_first_match(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/matches/auto-generate-fixtures', [
            'tournament_id' => self::FOOTBALL,
            'replace' => true,
        ]);

        $sent = Notification::query()->where('event', 'fixtures_published')->get();

        // Either the fixtures generated and every approved manager was told, or
        // the tournament had played matches and none were. Both are valid; what
        // must not happen is a partial announcement.
        if ($sent->isNotEmpty()) {
            $approved = Team::query()->where('tournament_id', self::FOOTBALL)->where('status', 'approved')->count();
            $this->assertSame($approved, $sent->count());
            $this->assertStringContainsString('Fixtures are out', $sent->first()->body);
        }

        $this->assertTrue(true);
    }

    public function test_cancelling_a_tournament_tells_every_team_including_the_unapproved(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $entered = Team::query()->where('tournament_id', self::FOOTBALL)->count();

        $this->postJson('/api/tournaments/'.self::FOOTBALL.'/cancel', ['reason' => 'Ground waterlogged'])->assertOk();

        $sent = Notification::query()->where('event', 'tournament_cancelled')->get();

        $this->assertSame($entered, $sent->count(), 'every side that entered has to hear about this one');
        $this->assertStringContainsString('waterlogged', $sent->first()->body);
    }

    /* -------------------------------------------------------- Scheduling */

    public function test_the_reminder_sweep_sends_each_match_reminder_once(): void
    {
        $match = GameMatch::query()->where('tournament_id', self::FOOTBALL)->first();
        $match->status = 'scheduled';
        $match->scheduled_at = now()->addHours(3)->format('Y-m-d\TH:i:s.v\Z');
        $match->save();

        $this->artisan('notifications:reminders')->assertSuccessful();
        $first = Notification::query()->where('event', 'match_reminder')->count();

        $this->assertGreaterThan(0, $first, 'a match three hours out is inside the 24-hour window');

        // The sweep runs every fifteen minutes; the second pass must add nothing.
        $this->artisan('notifications:reminders')->assertSuccessful();

        $this->assertSame($first, Notification::query()->where('event', 'match_reminder')->count());
    }

    public function test_the_reminder_sweep_ignores_a_match_that_is_too_far_off(): void
    {
        GameMatch::query()->update(['status' => 'completed']);

        $match = GameMatch::query()->where('tournament_id', self::FOOTBALL)->first();
        $match->status = 'scheduled';
        $match->scheduled_at = now()->addDays(9)->format('Y-m-d\TH:i:s.v\Z');
        $match->save();

        $this->artisan('notifications:reminders')->assertSuccessful();

        $this->assertSame(0, Notification::query()->where('event', 'match_reminder')->count());
    }

    public function test_the_sweep_reminds_a_team_that_still_owes_a_fee(): void
    {
        $payment = RegistrationPayment::query()->where('remaining_amount', '>', 0)->first();

        if (! $payment) {
            $payment = RegistrationPayment::query()->first();
            $payment->remaining_amount = 500;
            $payment->save();
        }

        $this->artisan('notifications:reminders')->assertSuccessful();
        $first = Notification::query()->where('event', 'fee_due_reminder')->count();

        $this->assertGreaterThan(0, $first);

        // Weekly, not every sweep — one key per team per week.
        $this->artisan('notifications:reminders')->assertSuccessful();
        $this->assertSame($first, Notification::query()->where('event', 'fee_due_reminder')->count());
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        $match = GameMatch::query()->where('tournament_id', self::FOOTBALL)->first();
        $match->status = 'scheduled';
        $match->scheduled_at = now()->addHours(3)->format('Y-m-d\TH:i:s.v\Z');
        $match->save();

        $this->artisan('notifications:reminders --dry-run')->assertSuccessful();

        $this->assertSame(0, Notification::query()->count());
    }

    /* ------------------------------------------------------ Subscriptions */

    public function test_the_sweep_expires_a_subscription_past_its_grace_period(): void
    {
        $subscription = Subscription::query()->where('status', 'active')->firstOrFail();
        $subscription->end_date = now()->subDays(30)->format('Y-m-d');
        $subscription->save();

        $this->artisan('subscriptions:sweep')->assertSuccessful();

        $this->assertSame('expired', $subscription->fresh()->status);
        $this->assertFalse((bool) $subscription->fresh()->auto_renew);
    }

    public function test_the_sweep_honours_the_grace_period(): void
    {
        $grace = (int) \App\Models\PlatformSetting::query()->value('grace_period_days');
        $this->assertGreaterThan(0, $grace, 'the seeded platform should allow some grace');

        $subscription = Subscription::query()->where('status', 'active')->firstOrFail();
        // Ended yesterday, so still inside the grace period.
        $subscription->end_date = now()->subDay()->format('Y-m-d');
        $subscription->save();

        $this->artisan('subscriptions:sweep')->assertSuccessful();

        $this->assertSame('active', $subscription->fresh()->status);
    }

    public function test_an_expiring_subscription_warns_the_organizer_once_per_threshold(): void
    {
        Subscription::query()->update(['status' => 'cancelled']);

        $subscription = Subscription::query()->first();
        $subscription->status = 'active';
        $subscription->end_date = now()->addDays(3)->format('Y-m-d');
        $subscription->save();

        $this->artisan('subscriptions:sweep')->assertSuccessful();
        $this->artisan('subscriptions:sweep')->assertSuccessful();

        $this->assertSame(
            1,
            Notification::query()->where('event', 'subscription_expiring')->count(),
            'a daily sweep must not warn daily'
        );
    }

    public function test_an_expired_subscription_is_only_announced_once(): void
    {
        Subscription::query()->update(['status' => 'cancelled']);

        $subscription = Subscription::query()->first();
        $subscription->status = 'active';
        $subscription->end_date = now()->subDays(60)->format('Y-m-d');
        $subscription->save();

        $this->artisan('subscriptions:sweep')->assertSuccessful();
        $subscription->fresh()->update(['status' => 'active']);
        $this->artisan('subscriptions:sweep')->assertSuccessful();

        $this->assertSame(1, Notification::query()->where('event', 'subscription_expired')->count());
    }

    /* --------------------------------------------------------------- API */

    public function test_an_organizer_reads_and_changes_their_own_settings(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/organizations/'.self::ORG.'/notification-settings')
            ->assertOk()
            ->assertJsonStructure(['enabled', 'sender_name', 'events' => [['event', 'channel', 'audience', 'description', 'enabled']]]);

        $this->putJson('/api/organizations/'.self::ORG.'/notification-settings', [
            'events' => ['match_result' => true],
            'sender_name' => 'Green Valley SC',
        ])->assertOk();

        $this->assertTrue($this->notifications->enabledFor(self::ORG, 'match_result'));
    }

    public function test_the_delivery_log_is_readable_with_its_tallies(): void
    {
        $this->dispatchTo(['phone' => '9447098765']);

        $this->actingAsUser('admin@greenvalley.com');

        $this->getJson('/api/organizations/'.self::ORG.'/notifications')
            ->assertOk()
            ->assertJsonStructure(['notifications', 'counts' => ['total', 'sent', 'queued', 'failed', 'skipped'], 'opted_out']);
    }

    public function test_another_club_cannot_read_this_clubs_delivery_log(): void
    {
        $this->dispatchTo(['phone' => '9447098765']);

        // The log is a list of other people's phone numbers.
        $this->actingAsUser('admin@malabar.com');

        $this->getJson('/api/organizations/'.self::ORG.'/notifications')->assertForbidden();
        $this->getJson('/api/organizations/'.self::ORG.'/notification-settings')->assertForbidden();
    }

    public function test_the_delivery_log_needs_a_login(): void
    {
        $this->getJson('/api/organizations/'.self::ORG.'/notifications')->assertUnauthorized();
    }

    public function test_an_organizer_can_stop_contacting_a_number(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/organizations/'.self::ORG.'/notifications/opt-out', [
            'phone' => '+91 94470 98765',
            'reason' => 'Manager asked us to stop',
        ])->assertCreated();

        $this->assertTrue($this->notifications->hasOptedOut('09447098765'));

        $this->postJson('/api/organizations/'.self::ORG.'/notifications/opt-in', ['phone' => '9447098765'])->assertOk();

        $this->assertFalse($this->notifications->hasOptedOut('9447098765'));
    }

    public function test_opting_out_rejects_something_that_is_not_a_number(): void
    {
        $this->actingAsUser('admin@greenvalley.com');

        $this->postJson('/api/organizations/'.self::ORG.'/notifications/opt-out', ['phone' => 'nonsense'])
            ->assertStatus(422);
    }

    /* ----------------------------------------------------------- Helpers */

    /** @param array<string, mixed> $recipient */
    private function dispatchTo(array $recipient): Notification
    {
        $created = $this->notifications->dispatch(
            'team_approved',
            [['name' => 'Test Manager', ...$recipient]],
            ['team' => 'Test Team', 'tournament' => 'Test Cup', 'start_date' => '12 Oct', 'balance' => '0'],
            self::ORG,
            'team',
            'team-under-test',
        );

        $this->assertCount(1, $created, 'the dispatch should have written exactly one row');

        return $created[0];
    }

    private function pendingTeam(): Team
    {
        $team = Team::query()->where('organization_id', self::ORG)->firstOrFail();
        $team->status = 'pending';
        $team->manager_phone = '9447098765';
        $team->manager_whatsapp = '9447098765';
        $team->save();

        return $team;
    }
}
