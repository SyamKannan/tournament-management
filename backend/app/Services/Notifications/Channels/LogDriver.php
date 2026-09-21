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
        $context = [
            'event' => $notification->event,
            'channel' => $notification->channel,
            'to' => $notification->to,
            'body' => $notification->body,
        ];

        // In production this driver is a misconfiguration, not a choice: a
        // password reset code written to a log file locks a real person out of
        // an account they have no other way back into. Say so at a level that
        // shows up in an error tracker rather than scrolling past in `info`.
        if (app()->isProduction()) {
            Log::channel(config('logging.default'))->warning(
                'notification.not_delivered: the '.$notification->channel.' channel is on the `log` driver, '
                .'so this message was recorded but never sent.',
                $context
            );
        } else {
            Log::channel(config('logging.default'))->info('notification.send', $context);
        }

        // Still reported as delivered: the engine's contract — the row, the
        // opt-out checks, the retry sweep — has to work without a gateway, and
        // the test suite asserts against it. The `log:` reference and
        // `driver = log` are how every reader tells this from a real send;
        // `ChannelManager::isSimulated()` is the check to use.
        return DeliveryResult::sent('log:'.$notification->id);
    }
}
