<?php

namespace App\Services\Notifications\Channels;

use App\Models\Notification;
use Illuminate\Support\Facades\Log;

/**
 * Writes the message to the application log instead of sending it.
 *
 * The default, and deliberately so: the engine — templates, opt-outs, the
 * delivery log, the scheduled reminders — is complete and exercisable without
 * a gateway account, DLT registration or template approval. Swap the driver in
 * config when those exist and nothing else moves.
 */
class LogDriver implements ChannelDriver
{
    public function key(): string
    {
        return 'log';
    }

    public function send(Notification $notification): DeliveryResult
    {
        Log::channel(config('logging.default'))->info('notification.send', [
            'event' => $notification->event,
            'channel' => $notification->channel,
            'to' => $notification->to,
            'body' => $notification->body,
        ]);

        return DeliveryResult::sent('log:'.$notification->id);
    }
}
