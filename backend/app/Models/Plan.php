<?php

namespace App\Models;

class Plan extends BaseModel
{
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
