<?php

namespace App\Models;

class Advertisement extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'media_url' => '',
    ];

    const UPDATED_AT = null;

    protected $casts = [
        'priority' => 'integer',
        'duration_seconds' => 'integer',
    ];
}
