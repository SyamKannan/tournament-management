<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // AI-generated poster background artwork (see AiArtworkService). Left
    // blank, poster generation just skips the AI step and falls back to the
    // plain template — never a hard failure.
    'openai' => [
        'api_key' => env('OPENAI_API_KEY'),
    ],

    // Fallback Razorpay keys for PaymentGatewayService, used when a payment
    // flow is set to Razorpay in platform settings without keys of its own.
    'razorpay' => [
        'key_id' => env('RAZORPAY_KEY_ID'),
        'key_secret' => env('RAZORPAY_KEY_SECRET'),
    ],

    // Match/tournament poster art director (see ArtDirectorService). Left
    // blank, GeneratePoster skips straight to the hardcoded copy template —
    // never a hard failure. Haiku by default: this is a short, cheap,
    // low-latency JSON-only call, not something that needs a bigger model.
    'anthropic' => [
        'api_key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001'),
        // Chat assistant model when no GEMINI_API_KEY is set (see AssistantService).
        'assistant_model' => env('ASSISTANT_MODEL', 'claude-opus-5'),
    ],

    // Scorey, the public chat assistant (see AssistantService). A free key from
    // aistudio.google.com is enough; when set, Gemini is used ahead of the
    // Anthropic key below. Free-tier prompts may be used by Google to improve
    // its products.
    'gemini' => [
        'api_key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-2.5-flash'),
    ],

    // Browsershot's Chrome. Required for poster rendering regardless of any
    // API key above — see GeneratePoster::resolveChromePath() for the local
    // auto-detect fallback used when this is left blank.
    'poster' => [
        'chrome_path' => env('POSTER_CHROME_PATH'),
    ],

];
