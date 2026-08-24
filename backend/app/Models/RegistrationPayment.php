<?php

namespace App\Models;

class RegistrationPayment extends BaseModel
{
    protected $casts = [
        'total_fee' => 'float',
        'paid_amount' => 'float',
        'remaining_amount' => 'float',
        'recorded_by_admin' => 'boolean',
    ];
}
