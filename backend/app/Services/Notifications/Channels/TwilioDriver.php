<?php

namespace App\Services\Notifications\Channels;

use App\Models\Notification;
use Illuminate\Support\Facades\Http;

/**
 * Sends through Twilio's REST API — SMS on the `sms` channel, and WhatsApp on
 * the `whatsapp` channel via Twilio's `whatsapp:` address prefix.
 *
 * Twilio is the pragmatic first real gateway here: one account covers both
 * channels, it reaches Indian numbers, and it needs no template approval for
 * SMS. `MetaWhatsAppDriver` is the cheaper option once a business account and
 * approved templates exist.
 *
 * Errors are classified rather than thrown: Twilio's 4xx codes for a bad or
 * unreachable number will never succeed, so they are rejections, and retrying
 * them only burns the allowance. Everything else is worth another attempt.
 */
class TwilioDriver implements ChannelDriver
{
    /**
     * Twilio error codes that mean "this number will never work". Retrying any
     * of these is guaranteed waste, so they end the message rather than
     * leaving it looking retryable.
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

        $from = $this->from($notification->channel);

        if ($from === '') {
            return DeliveryResult::failed(
                sprintf('Twilio is selected for %s but no sender number is configured.', $notification->channel)
            );
        }

        $to = $this->address($notification->channel, (string) $notification->to);

        try {
            $response = Http::asForm()
                ->withBasicAuth($sid, $token)
                ->timeout((int) config('notifications.timeout', 15))
                ->post("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json", [
                    'From' => $from,
                    'To' => $to,
                    'Body' => (string) $notification->body,
                ]);
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

    /** The configured sender for a channel, already in Twilio's address form. */
    private function from(string $channel): string
    {
        $number = (string) config(
            $channel === 'whatsapp'
                ? 'notifications.twilio.whatsapp_from'
                : 'notifications.twilio.sms_from'
        );

        if ($number === '') {
            return '';
        }

        return $this->address($channel, $number);
    }

    /** WhatsApp addresses carry a scheme prefix; SMS numbers are bare E.164. */
    private function address(string $channel, string $number): string
    {
        if ($channel !== 'whatsapp') {
            return $number;
        }

        return str_starts_with($number, 'whatsapp:') ? $number : 'whatsapp:'.$number;
    }
}
