<?php

namespace App\Models;

class Standing extends BaseModel
{
    public $timestamps = false;

    protected $casts = [
        'played' => 'integer',
        'won' => 'integer',
        'drawn' => 'integer',
        'lost' => 'integer',
        'no_result' => 'integer',
        'goals_for' => 'integer',
        'goals_against' => 'integer',
        'goal_difference' => 'integer',
        'runs_scored' => 'integer',
        'overs_faced' => 'float',
        'runs_conceded' => 'integer',
        'overs_bowled' => 'float',
        'net_run_rate' => 'float',
        'points' => 'integer',
        'form' => 'array',
        'rank' => 'integer',
    ];
}
