<?php

namespace App\Models;

class Sport extends BaseModel
{
    public $timestamps = false;

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
