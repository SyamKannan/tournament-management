<?php

namespace App\Models;

class Announcement extends BaseModel
{
    const UPDATED_AT = null;

    protected $casts = [
        'is_active_on_scoreboard' => 'boolean',
    ];
}
