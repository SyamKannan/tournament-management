<?php

namespace App\Models;

class Sponsor extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'logo' => '',
    ];

    const UPDATED_AT = null;
}
