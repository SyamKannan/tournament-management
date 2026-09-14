<?php

namespace App\Models;

class Announcement extends BaseModel
{
    const UPDATED_AT = null;

    protected $casts = [
        'duration_seconds' => 'integer',
    ];
}
