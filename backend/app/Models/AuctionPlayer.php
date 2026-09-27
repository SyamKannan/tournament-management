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

    /**
     * Contact details stay out of every serialization unless the organizer's
     * view asks for them (`makeVisible(self::CONTACT_FIELDS)`). Auction events
     * go to anonymous WebSocket rooms, so a default of "visible" put every
     * registrant's phone number on the stadium screen's socket.
     */
    public const CONTACT_FIELDS = ['mobile', 'email'];

    protected $hidden = self::CONTACT_FIELDS;

    protected $casts = [
        'age' => 'integer',
        'base_price' => 'float',
        'sold_price' => 'float',
        'payment_amount' => 'float',
    ];
}
