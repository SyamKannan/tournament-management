<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Team;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Notifications\NotificationService;
use App\Services\TokenService;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The bell: every dispatched event also lands in the feed of each recipient
 * who has an account — with or without a gateway, a phone, or an opt-out —
 * and each account sees and clears only its own.
 */
class InAppNotificationTest extends TestCase
{
    private const ORG = 'org-green-valley';

    private const ORGANIZER = 'admin@greenvalley.com';

    private const MANAGER = 'manager@malabarblasters.com';

    private const MANAGER_ID = 'user-manager-blasters';

    private NotificationService $notifications;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        $this->notifications = app(NotificationService::class);
    }

    /* ------------------------------------------------------------ Writing */

    public function test_approving_a_team_rings_its_managers_bell(): void
    {
        $team = Team::query()->findOrFail('team-malabar-blasters');
        $team->status = 'pending';
        $team->save();

        $this->actingAsUser(self::ORGANIZER);
        $this->putJson("/api/teams/{$team->id}/status", ['status' => 'approved'])->assertOk();

        $this->actingAsUser(self::MANAGER);
        $feed = $this->getJson('/api/me/notifications')->assertOk();

        $feed->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.event', 'team_approved')
            ->assertJsonPath('data.0.title', 'Malabar Blasters FC is confirmed')
            ->assertJsonPath('data.0.link', '/team/dashboard')
            ->assertJsonPath('data.0.read_at', null)
            ->assertJsonMissingPath('data.0.dedupe_key');

        $this->getJson('/api/me/notifications/unread-count')->assertOk()->assertExactJson(['unread' => 1]);
    }

    public function test_the_bell_rings_even_when_no_phone_can_be_reached(): void
    {
        $this->dispatch([['name' => 'Faisal', 'phone' => '', 'user_id' => self::MANAGER_ID]]);

        $this->assertSame(1, UserNotification::query()->where('user_id', self::MANAGER_ID)->count());
    }

    public function test_an_opted_out_phone_still_gets_its_account_feed(): void
    {
        $this->notifications->optOut('9745511223', self::ORG);

        $this->dispatch([['name' => 'Faisal', 'phone' => '9745511223', 'user_id' => self::MANAGER_ID]]);

        $this->assertSame(1, UserNotification::query()->where('user_id', self::MANAGER_ID)->count());
    }

    public function test_a_recipient_without_an_account_gets_no_feed_item(): void
    {
        $this->dispatch([['name' => 'Walk-in', 'phone' => '9000000001']]);
        $this->dispatch([['name' => 'Ghost', 'phone' => '9000000002', 'user_id' => 'user-does-not-exist']]);

        $this->assertSame(0, UserNotification::query()->count());
    }

    public function test_a_password_reset_code_never_reaches_the_feed(): void
    {
        $this->notifications->dispatch(
            'password_reset_code',
            [['name' => 'Faisal', 'phone' => '9745511223', 'user_id' => self::MANAGER_ID]],
            ['code' => '123456', 'minutes' => '15'],
        );

        $this->assertSame(0, UserNotification::query()->count());
    }

    public function test_an_event_the_club_switched_off_does_not_ring_either(): void
    {
        $this->notifications->updateSettingsFor(self::ORG, ['events' => ['team_approved' => false]]);

        $this->dispatch([['name' => 'Faisal', 'phone' => '9745511223', 'user_id' => self::MANAGER_ID]]);

        $this->assertSame(0, UserNotification::query()->count());
    }

    public function test_a_repeated_scheduled_dispatch_rings_once(): void
    {
        $recipients = [['name' => 'Faisal', 'phone' => '9745511223', 'user_id' => self::MANAGER_ID]];

        $this->dispatch($recipients, 'sweep:once');
        $this->dispatch($recipients, 'sweep:once');

        $this->assertSame(1, UserNotification::query()->count());
    }

    public function test_the_same_account_listed_twice_gets_one_item(): void
    {
        $this->dispatch([
            ['name' => 'Faisal', 'phone' => '9745511223', 'user_id' => self::MANAGER_ID],
            ['name' => 'Faisal again', 'phone' => '9745511224', 'user_id' => self::MANAGER_ID],
        ]);

        $this->assertSame(1, UserNotification::query()->count());
    }

    public function test_a_headline_missing_its_name_falls_back_to_the_description(): void
    {
        $this->notifications->dispatch(
            'team_approved',
            [['name' => 'Faisal', 'user_id' => self::MANAGER_ID]],
            ['team' => '', 'tournament' => 'Test Cup'],
            self::ORG,
        );

        $this->assertSame('A team you manage was approved', UserNotification::query()->value('title'));
    }

    /* ------------------------------------------------------------ Reading */

    public function test_the_feed_needs_a_login(): void
    {
        $this->getJson('/api/me/notifications')->assertUnauthorized();
        $this->getJson('/api/me/notifications/unread-count')->assertUnauthorized();
    }

    public function test_one_account_never_sees_or_clears_anothers(): void
    {
        $this->dispatch([['name' => 'Faisal', 'user_id' => self::MANAGER_ID]]);
        $item = UserNotification::query()->firstOrFail();

        $this->actingAsUser(self::ORGANIZER);

        $this->getJson('/api/me/notifications')->assertOk()->assertJsonPath('total', 0);
        $this->postJson("/api/me/notifications/{$item->id}/read")->assertNotFound();
        $this->postJson('/api/me/notifications/read-all')->assertOk()->assertJsonPath('updated', 0);

        $this->assertNull($item->fresh()->read_at);
    }

    public function test_marking_one_and_all_read(): void
    {
        $recipients = [['name' => 'Faisal', 'user_id' => self::MANAGER_ID]];
        $this->dispatch($recipients, 'a');
        $this->dispatch($recipients, 'b');
        $this->dispatch($recipients, 'c');

        $this->actingAsUser(self::MANAGER);
        $first = UserNotification::query()->firstOrFail();

        $this->postJson("/api/me/notifications/{$first->id}/read")->assertOk()->assertJsonPath('unread', 2);
        $this->getJson('/api/me/notifications?unread=1')->assertOk()->assertJsonPath('total', 2);

        $this->postJson('/api/me/notifications/read-all')->assertOk()
            ->assertJsonPath('updated', 2)
            ->assertJsonPath('unread', 0);
    }

    public function test_an_impersonating_admin_reads_the_feed_without_clearing_it(): void
    {
        $organizer = User::query()->where('email', self::ORGANIZER)->firstOrFail();
        $this->dispatch([['name' => 'Ramesh', 'user_id' => $organizer->id]]);
        $item = UserNotification::query()->firstOrFail();

        $superAdmin = User::query()->where('role', 'SUPER_ADMIN')->firstOrFail();
        $adminToken = app(TokenService::class)->issue($superAdmin);

        $borrowed = $this->postJson('/api/admin/impersonate', ['user_id' => $organizer->id], ['Authorization' => 'Bearer '.$adminToken])
            ->assertOk()->json('token');
        $headers = ['Authorization' => 'Bearer '.$borrowed];

        $this->getJson('/api/me/notifications', $headers)->assertOk()->assertJsonPath('total', 1);
        $this->postJson("/api/me/notifications/{$item->id}/read", [], $headers)->assertOk()->assertJsonPath('unread', 1);
        $this->postJson('/api/me/notifications/read-all', [], $headers)->assertOk()->assertJsonPath('updated', 0);

        $this->assertNull($item->fresh()->read_at);
    }

    /* ------------------------------------------------------------ Pruning */

    public function test_prune_removes_only_long_read_items(): void
    {
        $recipients = [['name' => 'Faisal', 'user_id' => self::MANAGER_ID]];
        $this->dispatch($recipients, 'old-read');
        $this->dispatch($recipients, 'recent-read');
        $this->dispatch($recipients, 'old-unread');

        UserNotification::query()->where('dedupe_key', 'like', 'old-read%')->update(['read_at' => now()->subDays(120)]);
        UserNotification::query()->where('dedupe_key', 'like', 'recent-read%')->update(['read_at' => now()->subDays(5)]);
        UserNotification::query()->where('dedupe_key', 'like', 'old-unread%')->update(['created_at' => now()->subDays(365)]);

        $this->artisan('notifications:prune --dry-run')->assertSuccessful();
        $this->assertSame(3, UserNotification::query()->count());

        $this->artisan('notifications:prune')->assertSuccessful();
        $this->assertSame(2, UserNotification::query()->count());
        $this->assertSame(0, UserNotification::query()->where('dedupe_key', 'like', 'old-read%')->count());

        $this->artisan('notifications:prune')->assertSuccessful();
        $this->assertSame(2, UserNotification::query()->count());
    }

    /* ------------------------------------------------------------ Helpers */

    /** @param  array<int, array<string, mixed>>  $recipients */
    private function dispatch(array $recipients, ?string $dedupeKey = null): void
    {
        $this->assertTrue(Organization::query()->whereKey(self::ORG)->exists());

        $this->notifications->dispatch(
            'team_approved',
            $recipients,
            ['team' => 'Test Team', 'tournament' => 'Test Cup', 'start_date' => '12 Oct', 'balance' => '0'],
            self::ORG,
            'team',
            'team-under-test',
            $dedupeKey,
        );
    }
}
