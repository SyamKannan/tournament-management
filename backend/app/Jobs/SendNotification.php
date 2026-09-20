<?php

namespace App\Jobs;

use App\Models\Notification;
use App\Services\Notifications\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Hands one stored message to its gateway.
 *
 * Queued because a gateway call is a network round trip that has no business
 * inside the request that approved a team or recorded a payment.
 *
 * `tries = 1` on purpose: retrying is not the queue's job here. A failure is
 * recorded on the notification row with its reason, and `notifications:retry`
 * picks it up on a schedule — which survives a worker restart, gives the
 * gateway time to recover, and leaves the attempt count somewhere an organizer
 * can see it. A job thrashing in `failed_jobs` does none of that.
 *
 * Carries the id rather than the model so a queued job cannot resurrect a row
 * that has since been deleted.
 */
class SendNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, SerializesModels;

    public int $tries = 1;

    public int $timeout = 30;

    public function __construct(private readonly string $notificationId) {}

    public function handle(NotificationService $notifications): void
    {
        $notification = Notification::find($this->notificationId);

        if (! $notification) {
            return;
        }

        $notifications->deliver($notification);
    }
}
