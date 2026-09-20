<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Channel drivers
    |--------------------------------------------------------------------------
    |
    | Which driver carries each channel. `log` records the message and reports
    | success without contacting anyone, which is what local and staging want
    | and what the test suite asserts against.
    |
    | Adding a real gateway is one class implementing ChannelDriver plus its
    | name here — nothing else in the application changes.
    |
    */

    'channels' => [
        'whatsapp' => env('WHATSAPP_DRIVER', 'log'),
        'sms' => env('SMS_DRIVER', 'log'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Master switch
    |--------------------------------------------------------------------------
    |
    | Off means nothing is queued at all — not even a row. For a local database
    | restored from production, so a `db:reset` cannot text real people.
    |
    */

    'enabled' => (bool) env('NOTIFICATIONS_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Delivery
    |--------------------------------------------------------------------------
    */

    // A send that fails is retried by `notifications:retry` up to this many
    // attempts in total. Gateways fail in bursts, so giving up early is wrong.
    'max_attempts' => (int) env('NOTIFICATIONS_MAX_ATTEMPTS', 3),

    // How long before kick-off the reminder sweep messages a team. Two passes:
    // the day before, so people can travel, and again shortly before.
    'match_reminder_hours' => [24, 2],

    // How many days before a subscription lapses the organizer is warned.
    'subscription_warning_days' => [7, 3, 1],

    /*
    |--------------------------------------------------------------------------
    | Default per-event settings
    |--------------------------------------------------------------------------
    |
    | An organizer can turn any of these off for their own club; this is what
    | applies until they do. Everything that tells someone what they owe or
    | where to be is on by default; the rest is opt-in.
    |
    */

    'defaults' => [
        // Not an organizer's to switch off — being locked out of an account is
        // not marketing, and `dispatch()` is called with no organization for it.
        'password_reset_code' => true,
        'team_registered' => true,
        'team_approved' => true,
        'team_rejected' => true,
        'payment_received' => true,
        'fee_due_reminder' => true,
        'fixtures_published' => true,
        'match_reminder' => true,
        'match_result' => false,
        'tournament_cancelled' => true,
        'auction_player_sold' => true,
        'subscription_expiring' => true,
        'subscription_expired' => true,
    ],

];
