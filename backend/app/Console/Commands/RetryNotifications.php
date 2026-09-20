<?php

namespace App\Console\Commands;

use App\Jobs\SendNotification;
use App\Services\Notifications\NotificationService;
use Illuminate\Console\Command;

/**
 * Re-queues messages a gateway refused for a reason worth trying again.
 *
 * Retrying here rather than inside the job is deliberate: gateways fail in
 * bursts, and a job retrying itself would exhaust its attempts inside the same
 * outage. Coming back on a schedule gives the gateway time to recover, survives
 * a worker restart, and leaves the attempt count on the notification row where
 * an organizer can see it.
 */
class RetryNotifications extends Command
{
    protected $signature = 'notifications:retry
                            {--limit=100 : How many to re-queue in one pass}';

    protected $description = 'Re-queue notifications that failed and are still worth another attempt';

    public function handle(NotificationService $notifications): int
    {
        $due = $notifications->retryable((int) $this->option('limit'));

        foreach ($due as $notification) {
            SendNotification::dispatch($notification->id);
        }

        $this->info(sprintf('%d notification(s) re-queued.', $due->count()));

        return self::SUCCESS;
    }
}
