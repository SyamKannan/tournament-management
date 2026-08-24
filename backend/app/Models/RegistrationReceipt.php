<?php

namespace App\Models;

class RegistrationReceipt extends BaseModel
{
    public $timestamps = false;

    protected $casts = [
        'receipt_data' => 'array',
    ];
}
