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

    protected $appends = ['clock_seconds'];

    protected $casts = [
        'team_a_score' => 'integer',
        'team_b_score' => 'integer',
        'team_a_penalties' => 'integer',
        'team_b_penalties' => 'integer',
        'match_minute' => 'integer',
        'elapsed_seconds' => 'integer',
        'is_timer_running' => 'boolean',
        'timer_started_at_epoch' => 'integer',
    ];

    /**
     * The match clock right now, in seconds. Worked out on the server and sent
     * with every payload, so a scorer's phone with its clock set wrong still
     * shows the right minute: the client only counts on from this value.
     */
    public function getClockSecondsAttribute(): int
    {
        $seconds = (int) $this->elapsed_seconds;

        if ($this->is_timer_running && $this->timer_started_at_epoch) {
            $seconds += max(0, intdiv(now()->getTimestampMs() - (int) $this->timer_started_at_epoch, 1000));
        }

        return $seconds;
    }

    public function events(): HasMany
    {
        return $this->hasMany(FootballEvent::class, 'match_id', 'match_id')->orderBy('sequence');
    }
}
