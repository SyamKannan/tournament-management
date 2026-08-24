<?php

namespace App\Models;

class RegistrationLink extends BaseModel
{
    const UPDATED_AT = null;

    protected $casts = [
        'max_teams' => 'integer',
        'current_registrations' => 'integer',
    ];
}
