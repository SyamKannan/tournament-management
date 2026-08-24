<?php

namespace App\Models;

class Invoice extends BaseModel
{
    const UPDATED_AT = null;

    protected $casts = [
        'amount' => 'float',
    ];
}
