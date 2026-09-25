<?php

namespace App\Console\Commands;

use App\Services\SupportService;
use Illuminate\Console\Command;

/**
 * Closes support tickets marked resolved that nobody came back to, so the
 * inbox's "resolved" pile does not grow forever. A reply before then reopens
 * the ticket instead.
 */
class SweepSupportTickets extends Command
{
    protected $signature = 'support:sweep
                            {--dry-run : Report what would close without writing anything}';

    protected $description = 'Close resolved support tickets with no reply for '.SupportService::AUTO_CLOSE_DAYS.' days';

    public function handle(SupportService $support): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $count = $support->closeStale($dryRun);

        $this->info(($dryRun ? 'Would close' : 'Closed')." {$count} resolved ticket(s).");

        return self::SUCCESS;
    }
}
