<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Append-only: one row each time an account agreed to one document version. */
class LegalAcceptance extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $casts = [
        'version' => 'integer',
        'accepted_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
