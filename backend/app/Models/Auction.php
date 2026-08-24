<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A tournament player auction. `bidHistory` serialises as the `bid_history`
 * array the live auction arena and TV screens read, newest bid first.
 */
class Auction extends BaseModel
{
    protected $with = ['bidHistory'];

    protected $casts = [
        'team_purse' => 'float',
        'min_bid_increment' => 'float',
        'max_players_per_team' => 'integer',
        'min_players_per_team' => 'integer',
        'base_prices' => 'array',
        'current_bid_amount' => 'float',
        'hammer_timer_seconds' => 'integer',
        'accelerated_round_active' => 'boolean',
    ];

    public function bidHistory(): HasMany
    {
        return $this->hasMany(AuctionBid::class)->orderByDesc('sequence');
    }

    public function players(): HasMany
    {
        return $this->hasMany(AuctionPlayer::class);
    }
}
