<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Notification;
use App\Models\SupportTicket;
use App\Models\Upload;
use App\Services\Notifications\NotificationService;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Help & Support: a club and the platform talking through tickets, and the
 * public form for someone locked out. Clubs see only their own threads and
 * never the admin's internal notes.
 */
class SupportTicketTest extends TestCase
{
    private const ORG = 'org-green-valley';

    private const OTHER_ORG = 'org-malabar-cricket';

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
    }

    private function organizer(string $org = self::ORG): array
    {
        return $this->demoHeaders('ORG_ADMIN', $org);
    }

    private function admin(): array
    {
        return $this->demoHeaders('SUPER_ADMIN');
    }

    private function open(array $overrides = [], string $org = self::ORG): array
    {
        return $this->withHeaders($this->organizer($org))
            ->postJson("/api/organizations/$org/support/tickets", [
                'category' => 'billing',
                'subject' => 'Charged twice for Pro',
                'body' => 'Our UPI payment went through twice this morning.',
                ...$overrides,
            ])
            ->assertCreated()
            ->json();
    }

    public function test_a_club_opens_a_ticket_and_the_admin_sees_it_unread(): void
    {
        $thread = $this->open(['urgent' => true, 'context' => ['match_id' => 'match_1', 'secret' => 'dropped']]);

        $this->assertSame('KW-1001', $thread['ticket']['reference']);
        $this->assertSame('open', $thread['ticket']['status']);
        $this->assertSame('urgent', $thread['ticket']['priority']);
        $this->assertCount(1, $thread['messages']);
        $this->assertArrayNotHasKey('is_internal', $thread['messages'][0]);

        $this->withHeaders($this->admin())->getJson('/api/admin/support/tickets?status=active')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.organization_name', 'Green Valley Sports Club')
            ->assertJsonPath('data.0.unread', true)
            ->assertJsonPath('data.0.context.match_id', 'match_1')
            ->assertJsonMissingPath('data.0.context.secret')
            ->assertJsonPath('summary.unread', 1)
            ->assertJsonPath('summary.urgent', 1);

        $this->assertTrue(AuditLog::query()->where('action', 'SUPPORT_TICKET_OPENED')->exists());

        $this->assertSame('KW-1002', $this->open()['ticket']['reference']);
    }

    public function test_another_club_can_never_reach_the_ticket(): void
    {
        $id = $this->open()['ticket']['id'];

        // Its own org's URL with someone else's ticket id.
        $this->withHeaders($this->organizer(self::OTHER_ORG))
            ->getJson('/api/organizations/'.self::OTHER_ORG."/support/tickets/$id")
            ->assertNotFound();

        // The owning org's URL.
        $this->withHeaders($this->organizer(self::OTHER_ORG))
            ->getJson('/api/organizations/'.self::ORG.'/support/tickets')
            ->assertForbidden();

        $this->withHeaders($this->organizer(self::OTHER_ORG))
            ->getJson('/api/organizations/'.self::OTHER_ORG.'/support/tickets')
            ->assertOk()
            ->assertJsonPath('total', 0);
    }

    public function test_only_the_organizer_uses_club_support(): void
    {
        $this->withHeaders($this->demoHeaders('TEAM_MANAGER', self::ORG))
            ->getJson('/api/organizations/'.self::ORG.'/support/tickets')
            ->assertForbidden();

        $this->withHeaders($this->demoHeaders('SCORER', self::ORG))
            ->postJson('/api/organizations/'.self::ORG.'/support/tickets', [])
            ->assertForbidden();

        // The platform answers from its inbox, never by writing as the club.
        $this->withHeaders($this->admin())
            ->postJson('/api/organizations/'.self::ORG.'/support/tickets', [
                'category' => 'bug', 'subject' => 'Testing', 'body' => 'Written as the club.',
            ])
            ->assertForbidden();
    }

    public function test_an_admin_reply_waits_on_the_club_and_tells_them(): void
    {
        $id = $this->open()['ticket']['id'];
        $this->withHeaders($this->admin())->getJson("/api/admin/support/tickets/$id")->assertOk();

        $this->withHeaders($this->admin())
            ->postJson("/api/admin/support/tickets/$id/messages", ['body' => 'Refunded the second charge — 3 to 5 working days.'])
            ->assertOk()
            ->assertJsonPath('ticket.status', 'awaiting_reply')
            ->assertJsonPath('messages.1.author_name', 'KickWick Support');

        $sms = Notification::query()->where('event', 'support_reply')->sole();
        $this->assertStringContainsString('KW-1001', $sms->body);
        $this->assertStringContainsString('Refunded the second charge', $sms->body);
        $this->assertSame('919847123456', $sms->to);

        $base = '/api/organizations/'.self::ORG.'/support';
        $this->withHeaders($this->organizer())->getJson("$base/unread")->assertJsonPath('unread', 1);
        $this->withHeaders($this->organizer())->getJson("$base/tickets/$id")->assertOk();
        $this->withHeaders($this->organizer())->getJson("$base/unread")->assertJsonPath('unread', 0);

        $this->withHeaders($this->organizer())
            ->postJson("$base/tickets/$id/messages", ['body' => 'Thanks, got it.'])
            ->assertJsonPath('ticket.status', 'open');
        $this->assertTrue(SupportTicket::find($id)->unread_by_admin);
    }

    public function test_internal_notes_stay_on_the_admin_side(): void
    {
        $id = $this->open()['ticket']['id'];

        $this->withHeaders($this->admin())
            ->postJson("/api/admin/support/tickets/$id/messages", ['body' => 'Check Razorpay dashboard first.', 'internal' => true])
            ->assertOk()
            ->assertJsonPath('ticket.status', 'open')
            ->assertJsonPath('messages.1.is_internal', true);

        $thread = $this->withHeaders($this->organizer())
            ->getJson('/api/organizations/'.self::ORG."/support/tickets/$id")
            ->assertOk()
            ->json();

        $this->assertCount(1, $thread['messages']);
        $this->assertFalse($thread['ticket']['unread']);
        $this->assertSame(0, Notification::query()->where('event', 'support_reply')->count());
    }

    public function test_resolved_reopens_on_a_reply_but_closed_is_final(): void
    {
        $id = $this->open()['ticket']['id'];
        $base = '/api/organizations/'.self::ORG."/support/tickets/$id";

        $this->withHeaders($this->organizer())->putJson("$base/status", ['status' => 'resolved'])
            ->assertJsonPath('ticket.status', 'resolved');
        $this->withHeaders($this->organizer())->postJson("$base/messages", ['body' => 'Actually, one more thing.'])
            ->assertJsonPath('ticket.status', 'open');

        // Closing is the platform's call, not the club's.
        $this->withHeaders($this->organizer())->putJson("$base/status", ['status' => 'closed'])->assertUnprocessable();

        $this->withHeaders($this->admin())->putJson("/api/admin/support/tickets/$id", ['status' => 'closed'])
            ->assertJsonPath('ticket.status', 'closed');
        $this->withHeaders($this->organizer())->postJson("$base/messages", ['body' => 'Hello?'])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'This ticket is closed. Open a new one and mention KW-1001.');
    }

    public function test_the_sweep_closes_stale_resolved_tickets_once(): void
    {
        $stale = $this->open()['ticket']['id'];
        $fresh = $this->open()['ticket']['id'];

        SupportTicket::whereKey($stale)->update(['status' => 'resolved', 'resolved_at' => now()->subDays(8)]);
        SupportTicket::whereKey($fresh)->update(['status' => 'resolved', 'resolved_at' => now()->subDays(2)]);

        $this->artisan('support:sweep --dry-run')->expectsOutput('Would close 1 resolved ticket(s).')->assertSuccessful();
        $this->assertSame('resolved', SupportTicket::find($stale)->status);

        $this->artisan('support:sweep')->expectsOutput('Closed 1 resolved ticket(s).')->assertSuccessful();
        $this->artisan('support:sweep')->expectsOutput('Closed 0 resolved ticket(s).')->assertSuccessful();

        $this->assertSame('closed', SupportTicket::find($stale)->status);
        $this->assertSame('resolved', SupportTicket::find($fresh)->status);
    }

    public function test_attachments_must_be_support_uploads(): void
    {
        $this->withHeaders($this->organizer())
            ->postJson('/api/organizations/'.self::ORG.'/support/tickets', [
                'category' => 'bug',
                'subject' => 'Scorer froze',
                'body' => 'The scorer froze after a wicket.',
                'attachments' => ['https://evil.example/x.png'],
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors', fn ($errors) => isset($errors['attachments.0']));

        // The right shape, but nothing this platform stored.
        $this->withHeaders($this->organizer())
            ->postJson('/api/organizations/'.self::ORG.'/support/tickets', [
                'category' => 'bug', 'subject' => 'Scorer froze', 'body' => 'The scorer froze after a wicket.',
                'attachments' => ['uploads/support/never_uploaded.png'],
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors', fn ($errors) => ($errors['attachments.0'][0] ?? null) === 'Attach screenshots uploaded here.');
        $this->assertSame(0, SupportTicket::query()->count());

        Upload::create([
            'id' => 'upl_support_1', 'folder' => 'support', 'filename' => 'abc_1.png', 'bytes' => 10, 'created_at' => now(),
        ]);

        // Another host's copy of a real file name is saved as our own URL.
        $thread = $this->open(['attachments' => ['https://evil.example/uploads/support/abc_1.png']]);
        $this->assertSame([url('uploads/support/abc_1.png')], $thread['messages'][0]['attachments']);
    }

    public function test_a_screenshot_does_not_count_against_the_clubs_storage(): void
    {
        $png = 'data:image/png;base64,'.base64_encode(base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));

        $this->withHeaders($this->organizer())->postJson('/api/upload', ['base64' => $png, 'folder' => 'support'])->assertCreated();
        $this->withHeaders($this->organizer())->postJson('/api/upload', ['base64' => $png, 'folder' => 'teams'])->assertCreated();

        $this->assertNull(Upload::query()->where('folder', 'support')->value('organization_id'));
        $this->assertSame(self::ORG, Upload::query()->where('folder', 'teams')->value('organization_id'));

        foreach (Upload::query()->get() as $upload) {
            @unlink(public_path("uploads/{$upload->folder}/{$upload->filename}"));
        }
    }

    public function test_a_club_ticket_stores_the_phone_normalised_and_reopening_alerts_the_inbox(): void
    {
        $id = $this->open()['ticket']['id'];
        $this->assertSame('919847123456', SupportTicket::find($id)->contact_phone);

        $base = '/api/organizations/'.self::ORG."/support/tickets/$id";
        $this->withHeaders($this->admin())->getJson("/api/admin/support/tickets/$id");
        $this->assertFalse(SupportTicket::find($id)->unread_by_admin);

        // "Reopen" on a ticket still in progress changes nothing.
        $this->withHeaders($this->organizer())->putJson("$base/status", ['status' => 'open'])->assertJsonPath('ticket.status', 'open');
        $this->assertFalse(SupportTicket::find($id)->unread_by_admin);

        $this->withHeaders($this->organizer())->putJson("$base/status", ['status' => 'resolved']);
        $this->withHeaders($this->organizer())->putJson("$base/status", ['status' => 'open'])->assertJsonPath('ticket.status', 'open');
        $this->assertTrue(SupportTicket::find($id)->unread_by_admin);
        $this->assertNull(SupportTicket::find($id)->resolved_at);
    }

    public function test_the_contact_form_cannot_write_into_a_clubs_thread(): void
    {
        $reference = $this->open()['ticket']['reference'];

        // Knowing the club's reference and the organizer's phone is not enough.
        $this->postJson('/api/support/contact', [
            'name' => 'Stranger', 'phone' => '+91 98471 23456', 'category' => 'other', 'reference' => $reference,
            'body' => 'Please send me your password.',
        ])->assertCreated()->assertJsonPath('reference', 'KW-1002');

        $this->assertSame(1, SupportTicket::query()->where('number', 1001)->sole()->messages()->count());
    }

    public function test_the_public_form_says_the_same_thing_for_any_number(): void
    {
        $registered = $this->postJson('/api/support/contact', [
            'name' => 'Green Valley admin', 'phone' => '98471 23456', 'category' => 'account_access',
            'body' => 'I forgot my password and the SMS never comes.',
        ])->assertCreated()->json();

        $unknown = $this->postJson('/api/support/contact', [
            'name' => 'Someone', 'phone' => '9000000001', 'category' => 'account_access',
            'body' => 'I forgot my password and the SMS never comes.',
        ])->assertCreated()->json();

        $this->assertSame(array_keys($registered), array_keys($unknown));
        $this->assertSame(
            str_replace($registered['reference'], '', $registered['message']),
            str_replace($unknown['reference'], '', $unknown['message']),
        );

        // The admin, and only the admin, sees which account that number belongs to.
        $ticket = SupportTicket::query()->where('number', 1001)->sole();
        $this->assertNull($ticket->organization_id);
        $this->assertSame("Can't sign in", $ticket->subject);

        $this->withHeaders($this->admin())->getJson("/api/admin/support/tickets/{$ticket->id}")
            ->assertJsonPath('matched_accounts.0.id', 'user-org-admin-green')
            ->assertJsonPath('ticket.contact_phone', '919847123456');
    }

    public function test_quoting_a_reference_from_the_same_number_adds_to_that_ticket(): void
    {
        $first = $this->postJson('/api/support/contact', [
            'name' => 'Asha', 'phone' => '9000000002', 'category' => 'other', 'body' => 'How do I register my club?',
        ])->json('reference');

        $this->postJson('/api/support/contact', [
            'name' => 'Asha', 'phone' => '+91 90000 00002', 'category' => 'other', 'reference' => $first,
            'body' => 'Following up on my question.',
        ])->assertCreated()->assertJsonPath('reference', $first);

        // A different number quoting the same reference opens its own ticket.
        $this->postJson('/api/support/contact', [
            'name' => 'Mallory', 'phone' => '9000000003', 'category' => 'other', 'reference' => $first,
            'body' => 'Let me read that thread.',
        ])->assertCreated()->assertJsonPath('reference', 'KW-1002');

        $this->assertSame(2, SupportTicket::query()->where('number', 1001)->sole()->messages()->count());
    }

    public function test_the_public_form_rejects_a_bad_number_and_is_rate_limited(): void
    {
        $this->postJson('/api/support/contact', [
            'name' => 'X', 'phone' => '12', 'category' => 'other', 'body' => 'This is long enough.',
        ])->assertUnprocessable()->assertJsonPath('errors.phone.0', 'That phone number does not look right.');

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/support/contact', [
                'name' => 'X', 'phone' => '9000000004', 'category' => 'other', 'body' => 'This is long enough.',
            ])->assertCreated();
        }

        $this->postJson('/api/support/contact', [
            'name' => 'X', 'phone' => '9000000004', 'category' => 'other', 'body' => 'This is long enough.',
        ])->assertTooManyRequests();
    }

    public function test_tickets_are_searchable_by_reference(): void
    {
        $this->open(['subject' => 'Poster is blank']);
        $this->open(['subject' => 'Charged twice']);

        $this->withHeaders($this->admin())->getJson('/api/admin/support/tickets?search=kw-1002')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.subject', 'Charged twice');

        $this->withHeaders($this->organizer())->getJson('/api/organizations/'.self::ORG.'/support/tickets?search=poster')
            ->assertJsonPath('total', 1)
            ->assertJsonMissingPath('data.0.contact_phone');

        $this->withHeaders($this->admin())->getJson('/api/admin/support/tickets?search=1001')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.subject', 'Poster is blank');
    }

    public function test_the_inbox_finds_a_ticket_by_phone_however_it_is_typed(): void
    {
        $this->postJson('/api/support/contact', [
            'name' => 'Asha', 'phone' => '9000000005', 'category' => 'account_access', 'body' => 'Locked out of my club account.',
        ])->assertCreated();
        $this->open();

        foreach (['90000 00005', '+91 9000000005', '9000000005'] as $typed) {
            $this->withHeaders($this->admin())->getJson('/api/admin/support/tickets?search='.urlencode($typed))
                ->assertJsonPath('total', 1)
                ->assertJsonPath('data.0.contact_name', 'Asha');
        }
    }

    public function test_a_reply_is_saved_even_when_the_notification_cannot_be_prepared(): void
    {
        $id = $this->open()['ticket']['id'];

        $this->mock(NotificationService::class)
            ->shouldReceive('dispatch')
            ->andThrow(new \RuntimeException('gateway config broken'));

        $this->withHeaders($this->admin())
            ->postJson("/api/admin/support/tickets/$id/messages", ['body' => 'Looking into it now.'])
            ->assertOk()
            ->assertJsonPath('ticket.status', 'awaiting_reply');
    }
}
