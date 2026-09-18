<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;

class Plan extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'description' => '',
    ];

    protected $casts = [
        'price' => 'float',
        'tournament_limit' => 'integer',
        'team_limit' => 'integer',
        'player_limit' => 'integer',
        'storage_limit_mb' => 'integer',
        'ad_limit' => 'integer',
        'features' => 'array',
        'sort_order' => 'integer',
    ];

    /** Display order set by the super admin; ties (e.g. freshly seeded plans) fall back to price. */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('price')->orderBy('id');
    }
}
