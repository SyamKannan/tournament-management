<?php

namespace App\Models;

class Subscription extends BaseModel
{
    protected $casts = [
        'auto_renew' => 'boolean',
        'amount_paid' => 'float',
    ];
}
