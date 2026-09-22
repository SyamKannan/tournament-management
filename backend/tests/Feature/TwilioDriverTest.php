<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Services\Notifications\Channels\ChannelManager;
use App\Services\Notifications\Channels\TwilioDriver;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * What actually reaches Twilio. The request shape is the whole contract: a
 * number without its `+` or a free-text WhatsApp message outside the window is
 * refused by Twilio, not by anything this application would notice.
 */
class TwilioDriverTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'notifications.twilio.sid' => 'AC123',
            'notifications.twilio.token' => 'secret',
            'notifications.twilio.sms_from' => 'KCKWCK',
            'notifications.twilio.whatsapp_from' => '+14155238886',
            'notifications.twilio.messaging_service_sid' => null,
            'notifications.twilio.whatsapp_content' => [],
        ]);
    }

    private function notification(array $attributes = []): Notification
    {
        // Stored the way NotificationService stores it: Phone::normalize() digits.
        return new Notification([
            'channel' => 'sms',
            'to' => '919847012345',
            'body' => 'Your KickWick code is 123456',
            'event' => 'password_reset_code',
            ...$attributes,
        ]);
    }

    public function test_a_stored_number_is_sent_in_e164_with_its_plus(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM1'], 201)]);

        (new TwilioDriver)->send($this->notification());

        Http::assertSent(fn (Request $r) => $r['To'] === '+919847012345'
            && $r['From'] === 'KCKWCK'
            && $r['Body'] === 'Your KickWick code is 123456'
            && str_ends_with($r->url(), '/Accounts/AC123/Messages.json'));
    }

    public function test_whatsapp_numbers_get_the_whatsapp_prefix_on_both_ends(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM2'], 201)]);

        (new TwilioDriver)->send($this->notification(['channel' => 'whatsapp']));

        Http::assertSent(fn (Request $r) => $r['To'] === 'whatsapp:+919847012345'
            && $r['From'] === 'whatsapp:+14155238886');
    }

    public function test_a_messaging_service_replaces_the_sender(): void
    {
        config(['notifications.twilio.messaging_service_sid' => 'MG999', 'notifications.twilio.sms_from' => null]);
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM3'], 201)]);

        $result = (new TwilioDriver)->send($this->notification());

        $this->assertTrue($result->delivered);
        Http::assertSent(fn (Request $r) => $r['MessagingServiceSid'] === 'MG999' && ! isset($r['From']));
    }

    public function test_a_mapped_whatsapp_event_is_sent_as_its_approved_template(): void
    {
        config(['notifications.twilio.whatsapp_content' => ['password_reset_code' => 'HXabc']]);
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM4'], 201)]);

        (new TwilioDriver)->send($this->notification(['channel' => 'whatsapp']));

        Http::assertSent(fn (Request $r) => $r['ContentSid'] === 'HXabc'
            && json_decode($r['ContentVariables'], true) === ['1' => 'Your KickWick code is 123456']
            && ! isset($r['Body']));
    }

    public function test_free_text_outside_the_whatsapp_window_is_not_retried(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['code' => 63016, 'message' => 'Outside window'], 400)]);

        $result = (new TwilioDriver)->send($this->notification(['channel' => 'whatsapp']));

        $this->assertFalse($result->delivered);
        $this->assertFalse($result->retryable);
    }

    public function test_no_sender_at_all_is_reported_as_a_fixable_failure(): void
    {
        config(['notifications.twilio.sms_from' => null]);
        Http::fake();

        $result = (new TwilioDriver)->send($this->notification());

        $this->assertFalse($result->delivered);
        $this->assertTrue($result->retryable);
        $this->assertStringContainsString('TWILIO_MESSAGING_SERVICE_SID', $result->error);
        Http::assertNothingSent();
    }

    public function test_health_accepts_a_messaging_service_in_place_of_a_number(): void
    {
        config([
            'notifications.channels.sms' => 'twilio',
            'notifications.twilio.sms_from' => null,
            'notifications.twilio.messaging_service_sid' => 'MG999',
        ]);

        $smsIssues = collect(app(ChannelManager::class)->healthIssues())->where('channel', 'sms');

        $this->assertTrue($smsIssues->isEmpty(), $smsIssues->pluck('message')->implode(' | '));
    }

    public function test_the_test_command_sends_one_real_message_and_reports_it(): void
    {
        config(['notifications.channels.sms' => 'twilio']);
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SMtest'], 201)]);

        $this->artisan('notifications:test', ['phone' => '98470 12345'])
            ->expectsOutputToContain('Driver: twilio')
            ->expectsOutputToContain('Reference: SMtest')
            ->assertSuccessful();

        Http::assertSent(fn (Request $r) => $r['To'] === '+919847012345');
        $this->assertSame(0, Notification::query()->count(), 'a test send writes no delivery-log row');
    }

    public function test_the_test_command_shows_the_gateways_refusal(): void
    {
        config(['notifications.channels.sms' => 'twilio']);
        Http::fake(['api.twilio.com/*' => Http::response(['code' => 21408, 'message' => 'Permission to send an SMS has not been enabled for the region'], 400)]);

        $this->artisan('notifications:test', ['phone' => '9847012345'])
            ->expectsOutputToContain('21408')
            ->assertFailed();
    }
}
