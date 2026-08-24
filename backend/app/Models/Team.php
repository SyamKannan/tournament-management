<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Team extends BaseModel
{
    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function players(): HasMany
    {
        return $this->hasMany(Player::class);
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
