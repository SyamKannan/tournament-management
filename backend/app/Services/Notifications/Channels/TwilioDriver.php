<?php

namespace App\Services\Notifications\Channels;

use App\Models\Notification;
use Illuminate\Support\Facades\Http;

/**
 * Sends through Twilio's REST API — SMS on the `sms` channel, and WhatsApp on
 * the `whatsapp` channel via Twilio's `whatsapp:` address prefix.
 *
 * Two Twilio features matter for India specifically, and both are optional:
 *
 * - A **Messaging Service** (`TWILIO_MESSAGING_SERVICE_SID`) replaces a single
 *   `From`. It is how a DLT-registered sender ID is normally attached in
 *   India, and it lets Twilio pick from a pool of senders. When set, it is used
 *   for both channels.
 * - **WhatsApp Content templates**. Anything the business starts — a reset
 *   code, a match reminder — must be an approved template outside WhatsApp's
 *   24-hour window. Map an event to its Content SID (`HX…`) in
 *   `notifications.twilio.whatsapp_content`; the rendered body is passed as
 *   variable `{{1}}`. An unmapped event goes as free text, which only lands
 *   inside an open window.
 *
 * Errors are classified rather than thrown: Twilio's codes for a bad or
 * unreachable number will never succeed, so they are rejections, and retrying
 * them only burns the allowance. Everything else is worth another attempt.
 */
class TwilioDriver implements ChannelDriver
{
    /**
     * Twilio error codes that mean "this will never work as sent".
     *
     * @var array<int, int>
     */
    private const PERMANENT_CODES = [
        21211, // invalid 'To' number
        21214, // 'To' number cannot receive SMS
        21217, // phone number does not appear to be valid
        21408, // permission to send to this region is not enabled
        21610, // recipient has unsubscribed (STOP)
        21612, // unreachable by this route
        21614, // 'To' number is not a valid mobile number
        63016, // WhatsApp free text outside the 24h window — needs a template
        63024, // invalid WhatsApp number
    ];

    public function key(): string
    {
        return 'twilio';
    }

    public function send(Notification $notification): DeliveryResult
    {
        $sid = (string) config('notifications.twilio.sid');
        $token = (string) config('notifications.twilio.token');

        if ($sid === '' || $token === '') {
            // Misconfiguration is not the recipient's fault and is fixable, so
            // it stays retryable — the message waits rather than being lost.
            return DeliveryResult::failed('Twilio is selected but TWILIO_SID / TWILIO_TOKEN are not set.');
        }

        $sender = $this->sender($notification->channel);

        if ($sender === null) {
            return DeliveryResult::failed(sprintf(
                'Twilio is selected for %s but no sender is configured (set %s or TWILIO_MESSAGING_SERVICE_SID).',
                $notification->channel,
                $notification->channel === 'whatsapp' ? 'TWILIO_WHATSAPP_FROM' : 'TWILIO_SMS_FROM',
            ));
        }

        $payload = [
            ...$sender,
            'To' => $this->address($notification->channel, (string) $notification->to),
            ...$this->content($notification),
        ];

        try {
            $response = Http::asForm()
                ->withBasicAuth($sid, $token)
                ->timeout((int) config('notifications.timeout', 15))
                ->post("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json", $payload);
        } catch (\Throwable $e) {
            return DeliveryResult::failed('Twilio request failed: '.$e->getMessage());
        }

        if ($response->successful()) {
            return DeliveryResult::sent((string) $response->json('sid'));
        }

        $code = (int) $response->json('code');
        $message = (string) ($response->json('message') ?: 'HTTP '.$response->status());

        if (in_array($code, self::PERMANENT_CODES, true) || $response->status() === 400) {
            return DeliveryResult::rejected("Twilio rejected the message ({$code}): {$message}");
        }

        return DeliveryResult::failed("Twilio error ({$code}): {$message}");
    }

    /**
     * `MessagingServiceSid` when one is configured, otherwise the channel's
     * `From`. Null when neither is set.
     *
     * @return array<string, string>|null
     */
    private function sender(string $channel): ?array
    {
        $service = (string) config('notifications.twilio.messaging_service_sid');

        if ($service !== '') {
            return ['MessagingServiceSid' => $service];
        }

        $number = (string) config(
            $channel === 'whatsapp'
                ? 'notifications.twilio.whatsapp_from'
                : 'notifications.twilio.sms_from'
        );

        return $number === '' ? null : ['From' => $this->address($channel, $number)];
    }

    /**
     * An approved WhatsApp template when the event has one, plain text
     * otherwise.
     *
     * @return array<string, string>
     */
    private function content(Notification $notification): array
    {
        if ($notification->channel === 'whatsapp') {
            $contentSid = config('notifications.twilio.whatsapp_content.'.$notification->event);

            if (is_string($contentSid) && $contentSid !== '') {
                return [
                    'ContentSid' => $contentSid,
                    'ContentVariables' => json_encode(['1' => (string) $notification->body], JSON_UNESCAPED_UNICODE),
                ];
            }
        }

        return ['Body' => (string) $notification->body];
    }

    /**
     * Twilio's address form: E.164 with its `+`, prefixed `whatsapp:` on that
     * channel. Recipients are stored as bare digits (`Phone::normalize()`),
     * which Twilio refuses as an invalid number — so the `+` is added here.
     * An alphanumeric sender ID (a DLT header like `KCKWCK`) is left alone.
     */
    private function address(string $channel, string $number): string
    {
        $number = trim($number);

        if (str_starts_with($number, 'whatsapp:')) {
            return $number;
        }

        if (preg_match('/^\d{6,15}$/', $number)) {
            $number = '+'.$number;
        }

        return $channel === 'whatsapp' ? 'whatsapp:'.$number : $number;
    }
}
