<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'logo' => '',
        'banner' => '',
        'description' => '',
        'address' => '',
    ];

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
