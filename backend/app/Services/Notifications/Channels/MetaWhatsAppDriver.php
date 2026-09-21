<?php

namespace App\Services\Notifications\Channels;

use App\Models\Notification;
use Illuminate\Support\Facades\Http;

/**
 * Sends through the WhatsApp Cloud API (Meta's own gateway).
 *
 * Cheaper than a reseller once a business account exists, with one rule that
 * shapes this class: outside a 24-hour customer service window WhatsApp only
 * accepts an *approved template*, not free text. So every event maps to a
 * template name in `config/notifications.whatsapp_templates`, and the body we
 * already rendered is passed as the template's single body parameter.
 *
 * Where no template is mapped the message goes as free text, which succeeds
 * only inside an open window — right for a reply, wrong for a reminder. The
 * mapping is therefore the supported path and the fallback is a convenience.
 */
class MetaWhatsAppDriver implements ChannelDriver
{
    public function key(): string
    {
        return 'meta_whatsapp';
    }

    public function send(Notification $notification): DeliveryResult
    {
        $phoneNumberId = (string) config('notifications.meta.phone_number_id');
        $token = (string) config('notifications.meta.token');

        if ($phoneNumberId === '' || $token === '') {
            return DeliveryResult::failed(
                'WhatsApp Cloud API is selected but META_WHATSAPP_PHONE_NUMBER_ID / META_WHATSAPP_TOKEN are not set.'
            );
        }

        $version = (string) config('notifications.meta.version', 'v21.0');
        $to = ltrim((string) $notification->to, '+');

        try {
            $response = Http::withToken($token)
                ->timeout((int) config('notifications.timeout', 15))
                ->post("https://graph.facebook.com/{$version}/{$phoneNumberId}/messages",
                    $this->payload($notification, $to));
        } catch (\Throwable $e) {
            return DeliveryResult::failed('WhatsApp Cloud API request failed: '.$e->getMessage());
        }

        if ($response->successful()) {
            return DeliveryResult::sent((string) $response->json('messages.0.id'));
        }

        $error = $response->json('error') ?? [];
        $code = (int) ($error['code'] ?? 0);
        $message = (string) ($error['message'] ?? 'HTTP '.$response->status());

        // 131026 — undeliverable (not a WhatsApp account); 131047/131051 are
        // template and message-type refusals. None of these fix themselves.
        if (in_array($code, [131026, 131047, 131051, 132000, 132001], true)) {
            return DeliveryResult::rejected("WhatsApp rejected the message ({$code}): {$message}");
        }

        return DeliveryResult::failed("WhatsApp Cloud API error ({$code}): {$message}");
    }

    /**
     * A template send where the event has one mapped, free text otherwise.
     *
     * @return array<string, mixed>
     */
    private function payload(Notification $notification, string $to): array
    {
        $template = config('notifications.whatsapp_templates.'.$notification->event);

        if (! is_string($template) || $template === '') {
            return [
                'messaging_product' => 'whatsapp',
                'to' => $to,
                'type' => 'text',
                'text' => ['body' => (string) $notification->body],
            ];
        }

        return [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => 'template',
            'template' => [
                'name' => $template,
                'language' => ['code' => (string) config('notifications.meta.template_language', 'en')],
                'components' => [[
                    'type' => 'body',
                    'parameters' => [[
                        'type' => 'text',
                        'text' => (string) $notification->body,
                    ]],
                ]],
            ],
        ];
    }
}
