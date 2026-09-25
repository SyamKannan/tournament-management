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

    /*
    |--------------------------------------------------------------------------
    | Is messaging offered at all?
    |--------------------------------------------------------------------------
    |
    | Until a real gateway is connected, nothing is actually delivered — so the
    | product should not show organizers a WhatsApp/SMS section, or send anyone
    | to a password-reset code that cannot arrive. Left unset, this answers
    | itself: messaging appears once a channel uses something other than `log`.
    | Set MESSAGING_ENABLED=true to show it anyway (a gateway in staging), or
    | false to keep it hidden even with one configured.
    |
    */

    'feature_enabled' => env('MESSAGING_ENABLED'),

    'channels' => [
        'whatsapp' => env('WHATSAPP_DRIVER', 'log'),
        'sms' => env('SMS_DRIVER', 'log'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Gateway credentials
    |--------------------------------------------------------------------------
    |
    | Only the driver named above is ever contacted; the rest of this block is
    | inert. Twilio covers both channels from one account, and the WhatsApp
    | Cloud API is the cheaper WhatsApp route once a business account and
    | approved templates exist.
    |
    */

    'twilio' => [
        'sid' => env('TWILIO_SID'),
        'token' => env('TWILIO_TOKEN'),
        'sms_from' => env('TWILIO_SMS_FROM'),
        'whatsapp_from' => env('TWILIO_WHATSAPP_FROM'),
        // Replaces `From` on both channels when set — the usual way a
        // DLT-registered sender ID is attached for Indian SMS.
        'messaging_service_sid' => env('TWILIO_MESSAGING_SERVICE_SID'),
        // Approved WhatsApp Content templates, event => Content SID (HX…).
        // The rendered message is passed as variable {{1}}, so each template
        // should be a single-variable body. Unmapped events go as free text,
        // which WhatsApp only delivers inside a 24-hour customer window.
        'whatsapp_content' => array_filter([
            'password_reset_code' => env('TWILIO_WA_PASSWORD_RESET'),
            'match_reminder' => env('TWILIO_WA_MATCH_REMINDER'),
            'fee_due_reminder' => env('TWILIO_WA_FEE_DUE'),
            'team_registered' => env('TWILIO_WA_TEAM_REGISTERED'),
            'team_approved' => env('TWILIO_WA_TEAM_APPROVED'),
            'team_rejected' => env('TWILIO_WA_TEAM_REJECTED'),
            'payment_received' => env('TWILIO_WA_PAYMENT_RECEIVED'),
            'fixtures_published' => env('TWILIO_WA_FIXTURES_PUBLISHED'),
            'match_result' => env('TWILIO_WA_MATCH_RESULT'),
            'tournament_cancelled' => env('TWILIO_WA_TOURNAMENT_CANCELLED'),
            'auction_player_sold' => env('TWILIO_WA_AUCTION_PLAYER_SOLD'),
            'subscription_expiring' => env('TWILIO_WA_SUBSCRIPTION_EXPIRING'),
            'subscription_expired' => env('TWILIO_WA_SUBSCRIPTION_EXPIRED'),
        ]),
    ],

    'meta' => [
        'phone_number_id' => env('META_WHATSAPP_PHONE_NUMBER_ID'),
        'token' => env('META_WHATSAPP_TOKEN'),
        'version' => env('META_WHATSAPP_VERSION', 'v21.0'),
        'template_language' => env('META_WHATSAPP_TEMPLATE_LANGUAGE', 'en'),
    ],

    // Seconds to wait on a gateway before calling the attempt failed. Short,
    // because `deliver()` runs on the queue but `retry` sweeps behind it.
    'timeout' => (int) env('NOTIFICATIONS_TIMEOUT', 15),

    /*
    |--------------------------------------------------------------------------
    | WhatsApp template names
    |--------------------------------------------------------------------------
    |
    | Outside a 24-hour service window WhatsApp only accepts an approved
    | template. Map each event to the template registered with Meta; the body
    | NotificationCatalog rendered is passed as its single body parameter. An
    | event with no mapping is sent as free text, which only lands inside an
    | open window.
    |
    */

    'whatsapp_templates' => [
        // 'match_reminder' => 'kickwick_match_reminder',
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
        'support_reply' => true,
    ],

];
