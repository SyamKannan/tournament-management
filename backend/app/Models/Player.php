<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Player extends BaseModel
{
    protected $casts = [
        'age' => 'integer',
        'jersey_number' => 'integer',
        'is_captain' => 'boolean',
        'is_wicketkeeper' => 'boolean',
    ];

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
