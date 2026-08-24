<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Live cricket scoreline. The ordered ball-by-ball `deliveries` log is always
 * loaded, mirroring the state object the scorer and scoreboard clients expect.
 */
class CricketMatchState extends BaseModel
{
    public $timestamps = false;

    protected $with = ['deliveries'];

    protected $casts = [
        'total_overs' => 'integer',
        'current_innings' => 'integer',
        'team_a_runs' => 'integer',
        'team_a_wickets' => 'integer',
        'team_a_overs' => 'float',
        'team_b_runs' => 'integer',
        'team_b_wickets' => 'integer',
        'team_b_overs' => 'float',
        'target_runs' => 'integer',
        'required_run_rate' => 'float',
        'current_run_rate' => 'float',
    ];

    public function deliveries(): HasMany
    {
        return $this->hasMany(CricketDelivery::class, 'match_id', 'match_id')->orderBy('sequence');
    }
}
