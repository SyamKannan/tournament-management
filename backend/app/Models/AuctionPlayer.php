<?php

namespace App\Models;

class AuctionPlayer extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'photo' => '',
        'payment_status' => 'pending',
    ];

    const UPDATED_AT = null;

    protected $casts = [
        'age' => 'integer',
        'base_price' => 'float',
        'sold_price' => 'float',
        'payment_amount' => 'float',
    ];
}
