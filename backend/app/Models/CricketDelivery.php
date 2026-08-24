<?php

namespace App\Models;

class CricketDelivery extends BaseModel
{
    const UPDATED_AT = null;

    protected $hidden = ['sequence'];

    protected $casts = [
        'innings' => 'integer',
        'over_number' => 'integer',
        'ball_number' => 'integer',
        'runs_scored' => 'integer',
        'extras_runs' => 'integer',
        'is_wicket' => 'boolean',
    ];
}
