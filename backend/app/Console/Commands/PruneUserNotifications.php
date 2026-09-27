<?php

namespace App\Console\Commands;

use App\Models\UserNotification;
use Illuminate\Console\Command;

/**
 * Deletes in-app notifications read long ago, so a busy organizer's feed does
 * not grow forever. Unread items are never touched — whatever nobody has
 * seen yet is still news. Safe to run twice: a second pass finds nothing.
 */
class PruneUserNotifications extends Command
{
    public const KEEP_READ_DAYS = 90;

    protected $signature = 'notifications:prune
                            {--dry-run : Report what would be deleted without deleting it}';

    protected $description = 'Delete in-app notifications read more than '.self::KEEP_READ_DAYS.' days ago';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $query = UserNotification::query()
            ->whereNotNull('read_at')
            ->where('read_at', '<', now()->subDays(self::KEEP_READ_DAYS));

        $count = $dryRun ? $query->count() : $query->delete();

        $this->info(($dryRun ? 'Would delete' : 'Deleted')." {$count} read notification(s).");

        return self::SUCCESS;
    }
}
