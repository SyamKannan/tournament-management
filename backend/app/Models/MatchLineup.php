<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One player's place in a single match's team sheet.
 *
 * Distinct from `players`, which is the full tournament squad — a roster of 16
 * yields an 11-row lineup here, ordered, with the captain and keeper flagged
 * for this fixture only.
 */
class MatchLineup extends BaseModel
{
    protected $casts = [
        'batting_order' => 'integer',
        'is_playing' => 'boolean',
        'is_captain' => 'boolean',
        'is_wicketkeeper' => 'boolean',
    ];

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'player_id');
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(GameMatch::class, 'match_id');
    }
}
