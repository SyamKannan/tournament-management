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

    /**
     * Entries that take up one of a tournament's places. A rejected or
     * withdrawn team has given its place back: counting it kept registration
     * "full" after the organizer had turned sides away.
     */
    public const HOLDS_PLACE = ['pending', 'changes_required', 'approved', 'suspended'];

    /** @param  \Illuminate\Database\Eloquent\Builder<self>  $query */
    public function scopeHoldingPlace($query)
    {
        return $query->whereIn('status', self::HOLDS_PLACE);
    }

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
