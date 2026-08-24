<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Shared base for every domain model.
 *
 * Records carry human-readable string primary keys (`org-green-valley`,
 * `tourney_1724500000000`) that the front-end and public share links depend on,
 * so auto-incrementing integer keys are disabled throughout.
 *
 * Timestamps are serialised as ISO-8601 with millisecond precision to match the
 * shape the React client already parses.
 */
abstract class BaseModel extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function serializeDate(\DateTimeInterface $date): string
    {
        return $date->format('Y-m-d\TH:i:s.v\Z');
    }
}
