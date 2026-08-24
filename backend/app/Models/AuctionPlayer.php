<?php

namespace App\Models;

class AuctionPlayer extends BaseModel
{
    const UPDATED_AT = null;

    protected $casts = [
        'age' => 'integer',
        'base_price' => 'float',
        'sold_price' => 'float',
    ];
}
