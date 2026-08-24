<?php

namespace App\Models;

class PlayerStat extends BaseModel
{
    const CREATED_AT = null;

    protected $table = 'player_stats';

    protected $casts = [
        'jersey_number' => 'integer',
        'cricket' => 'array',
        'football' => 'array',
        'recent_performances' => 'array',
        'awards' => 'array',
    ];
}
