<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Singleton row holding platform-wide configuration.
 */
class PlatformSetting extends Model
{
    protected $table = 'platform_settings';

    protected $guarded = [];

    protected $hidden = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'enable_public_signup' => 'boolean',
        'require_admin_approval_for_orgs' => 'boolean',
        'default_trial_days' => 'integer',
        'grace_period_days' => 'integer',
        'enabled_payment_methods' => 'array',
    ];

    public static function current(): self
    {
        return static::query()->firstOrFail();
    }
}
