<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Live football scoreline. The ordered `events` log is always loaded so the
 * serialised state matches the payload the scorer and scoreboard clients expect.
 */
class FootballMatchState extends BaseModel
{
    public $timestamps = false;

    protected $with = ['events'];

    protected $casts = [
        'team_a_score' => 'integer',
        'team_b_score' => 'integer',
        'team_a_penalties' => 'integer',
        'team_b_penalties' => 'integer',
        'match_minute' => 'integer',
        'is_timer_running' => 'boolean',
        'timer_started_at_epoch' => 'integer',
    ];

    public function events(): HasMany
    {
        return $this->hasMany(FootballEvent::class, 'match_id', 'match_id')->orderBy('sequence');
    }
}
