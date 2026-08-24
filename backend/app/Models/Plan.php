<?php

namespace App\Models;

class Plan extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'description' => '',
    ];

    protected $casts = [
        'price' => 'float',
        'trial_days' => 'integer',
        'tournament_limit' => 'integer',
        'team_limit' => 'integer',
        'player_limit' => 'integer',
        'storage_limit_mb' => 'integer',
        'ad_limit' => 'integer',
        'features' => 'array',
    ];
}
