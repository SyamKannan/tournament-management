<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tournament extends BaseModel
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
    ];

    protected $casts = [
        'max_teams' => 'integer',
        'ground_fee' => 'float',
        'prize_money' => 'float',
        'runner_up_prize' => 'float',
        'payment_config' => 'array',
        'settings' => 'array',
        'has_auction' => 'boolean',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function teams(): HasMany
    {
        return $this->hasMany(Team::class);
    }

    public function matches(): HasMany
    {
        return $this->hasMany(GameMatch::class);
    }

    public function registrationLink()
    {
        return $this->hasOne(RegistrationLink::class);
    }
}
