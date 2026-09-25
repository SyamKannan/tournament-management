<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A review of the platform. Whether it is public is decided on read, not
 * stored: `auto` reviews follow the admin's minimum rating, so raising or
 * lowering it applies to every review at once, while `shown`/`hidden` are the
 * admin's explicit calls and always win.
 */
class Review extends BaseModel
{
    public const VISIBILITIES = ['auto', 'shown', 'hidden'];

    protected $attributes = [
        'visibility' => 'auto',
        'author_title' => '',
    ];

    protected $casts = [
        'rating' => 'integer',
        'moderated_at' => 'datetime',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /** Reviews a visitor may see: passing the rule, and from a club still active. */
    public function scopePublished(Builder $query, int $minRating): Builder
    {
        return $query
            ->where(fn (Builder $q) => $q
                ->where('visibility', 'shown')
                ->orWhere(fn (Builder $auto) => $auto->where('visibility', 'auto')->where('rating', '>=', $minRating)))
            ->where(fn (Builder $q) => $q
                ->whereNull('organization_id')
                ->orWhereIn('organization_id', Organization::query()->where('status', 'active')->select('id')));
    }

    /** The warmest first, then the newest. */
    public function scopeShowcaseOrder(Builder $query): Builder
    {
        return $query->orderByDesc('rating')->orderByDesc('created_at')->orderBy('id');
    }

    public function passesRule(int $minRating): bool
    {
        return $this->visibility === 'shown' || ($this->visibility === 'auto' && $this->rating >= $minRating);
    }
}
