<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Team extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'logo' => '',
        'manager_address' => '',
    ];

    /** What the manager agreed to on the registration link — a record, not something screens show. */
    protected $hidden = ['legal_accepted'];

    protected $casts = [
        'legal_accepted' => 'array',
    ];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function players(): HasMany
    {
        return $this->hasMany(Player::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    public function payment()
    {
        return $this->hasOne(RegistrationPayment::class);
    }

    public function receipt()
    {
        return $this->hasOne(RegistrationReceipt::class);
    }
}
