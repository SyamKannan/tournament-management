<?php

namespace App\Models;

class AuctionBid extends BaseModel
{
    public $timestamps = false;

    protected $hidden = ['sequence'];

    protected $casts = [
        'amount' => 'float',
    ];
}
