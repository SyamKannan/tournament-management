<?php

namespace App\Models;

/**
 * One item in an account's in-app feed. `read_at` null means unread.
 */
class UserNotification extends BaseModel
{
    protected $attributes = [
        'body' => '',
    ];

    protected $casts = [
        'read_at' => 'datetime',
    ];

    protected $hidden = [
        'dedupe_key',
    ];
}
