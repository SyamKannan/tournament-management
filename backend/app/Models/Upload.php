<?php

namespace App\Models;

/**
 * One stored file, so `plans.storage_limit_mb` can be measured rather than just
 * advertised. Rows with no organization are public registration uploads, which
 * belong to nobody's quota.
 */
class Upload extends BaseModel
{
    const UPDATED_AT = null;

    protected $casts = [
        'bytes' => 'integer',
    ];
}
