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

    /** payment_gateways holds encrypted keys — exposed only via PaymentGatewayService::adminConfig(). */
    protected $hidden = ['id', 'created_at', 'updated_at', 'payment_gateways'];

    protected $casts = [
        'enable_public_signup' => 'boolean',
        'require_admin_approval_for_orgs' => 'boolean',
        'grace_period_days' => 'integer',
        'enabled_payment_methods' => 'array',
        'subscription_payment_methods' => 'array',
        'payment_gateways' => 'array',
    ];

    public static function current(): self
    {
        return static::query()->firstOrFail();
    }
}
