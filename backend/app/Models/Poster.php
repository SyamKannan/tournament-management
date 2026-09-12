<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Poster extends BaseModel
{
    public const TYPES = [
        'matchday',
        'toss',
        'result',
        'player_of_match',
        'points_table',
        'tournament_announcement',
    ];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(GameMatch::class, 'match_id');
    }
}
