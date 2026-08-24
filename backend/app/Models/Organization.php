<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends BaseModel
{
    protected $casts = [
        'social_media' => 'array',
    ];

    public function tournaments(): HasMany
    {
        return $this->hasMany(Tournament::class);
    }

    public function subscription()
    {
        return $this->hasOne(Subscription::class);
    }
}
