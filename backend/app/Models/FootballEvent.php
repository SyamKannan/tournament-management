<?php

namespace App\Models;

class FootballEvent extends BaseModel
{
    const UPDATED_AT = null;

    protected $hidden = ['sequence'];

    protected $casts = [
        'minute' => 'integer',
    ];
}
