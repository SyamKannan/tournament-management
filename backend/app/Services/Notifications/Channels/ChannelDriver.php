<?php

namespace App\Services\Notifications\Channels;

use App\Models\Notification;

/**
 * A way of getting a message to a phone.
 *
 * Implementations do one thing: try to send, and say what happened. They do not
 * touch the notification row, decide about retries, or throw for an ordinary
 * gateway refusal — NotificationService owns all of that, so a new gateway is
 * only ever this one method.
 */
interface ChannelDriver
{
    /** Name this driver is selected by in config/notifications.php. */
    public function key(): string;

    public function send(Notification $notification): DeliveryResult;
}
