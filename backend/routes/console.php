<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Schedule
|--------------------------------------------------------------------------
|
| Needs one cron entry on the server, and nothing else:
|
|   * * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
|
| Every task here is safe to run twice. The notification sweeps dedupe on
| `notifications.dedupe_key` and the subscription sweep only acts on rows whose
| dates say so, so a missed hour catches up on the next tick and a double run
| sends nothing twice. `withoutOverlapping()` keeps a slow pass from stacking.
|
*/

// Match and ground-fee reminders. Every fifteen minutes so a reminder lands
// close to the window it is for, rather than up to an hour late.
Schedule::command('notifications:reminders')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->runInBackground();

// Gateways fail in bursts; come back for the failures a few minutes later.
Schedule::command('notifications:retry')
    ->everyTenMinutes()
    ->withoutOverlapping();

// Plans lapsing, and the warnings before they do. Early morning, so an
// organizer reads it at the start of the day rather than overnight.
Schedule::command('subscriptions:sweep')
    ->dailyAt('06:30')
    ->withoutOverlapping();
