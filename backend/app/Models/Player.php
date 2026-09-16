<?php

namespace App\Models;

use App\Services\PlayerIdentity;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Player extends BaseModel
{
    protected $casts = [
        'age' => 'integer',
        'jersey_number' => 'integer',
        'is_captain' => 'boolean',
        'is_wicketkeeper' => 'boolean',
    ];

    /**
     * Every squad entry gets its Player Code the moment it is created, however
     * it is created — team registration, an organizer adding a player, an
     * auction sale or a player signing up.
     */
    protected static function booted(): void
    {
        static::creating(fn (Player $player) => app(PlayerIdentity::class)->assignCode($player));
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
