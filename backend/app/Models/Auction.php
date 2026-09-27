<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A tournament player auction. `bid_history` is the bidding on the player
 * currently on the hammer, newest bid first — what the live arena and TV
 * screens show. Earlier players' bids stay in `auction_bids` (they used to be
 * wiped every time a new player was called); `bids()` reads all of them.
 */
class Auction extends BaseModel
{
    protected $appends = ['bid_history'];

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

    public function bids(): HasMany
    {
        return $this->hasMany(AuctionBid::class)->orderByDesc('sequence');
    }

    /** @return \Illuminate\Support\Collection<int, AuctionBid> */
    public function getBidHistoryAttribute()
    {
        if (! $this->current_player_id) {
            return collect();
        }

        return $this->bids()->where('player_id', $this->current_player_id)->get();
    }

    public function players(): HasMany
    {
        return $this->hasMany(AuctionPlayer::class);
    }
}
