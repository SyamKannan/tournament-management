<?php

namespace App\Models;

class Advertisement extends BaseModel
{
    const UPDATED_AT = null;

    protected $casts = [
        'priority' => 'integer',
        'duration_seconds' => 'integer',
    ];
}
