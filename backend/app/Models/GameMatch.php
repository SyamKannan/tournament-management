<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A scheduled fixture. Named GameMatch because `Match` is a reserved word in
 * PHP 8; the underlying table is still `matches`.
 */
class GameMatch extends BaseModel
{
    protected $table = 'matches';

    protected $casts = [
        'match_number' => 'integer',
        'toss_time' => 'datetime',
    ];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function teamA(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team_a_id');
    }

    public function teamB(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team_b_id');
    }

    public function footballState()
    {
        return $this->hasOne(FootballMatchState::class, 'match_id');
    }

    public function cricketState()
    {
        return $this->hasOne(CricketMatchState::class, 'match_id');
    }
}
