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
        'footer' => 'array',
        'reviews' => 'array',
    ];

    /** Landing-page reviews: reviews rated `min_rating` or more go public unless the admin hides them. */
    public const REVIEW_DEFAULTS = [
        'enabled' => true,
        'min_rating' => 4,
        'max_shown' => 6,
    ];

    public const SOCIAL_NETWORKS = ['facebook', 'instagram', 'youtube', 'x', 'whatsapp'];

    public const FOOTER_DEFAULTS = [
        'tagline' => 'Run the game. We handle the rest.',
        'links' => [
            ['label' => 'Player Stats', 'url' => '/players'],
            ['label' => 'Register Your Club', 'url' => '/register-club'],
            ['label' => 'Join as Player', 'url' => '/register-player'],
            ['label' => 'Sign In', 'url' => '/login'],
        ],
        'social' => ['facebook' => '', 'instagram' => '', 'youtube' => '', 'x' => '', 'whatsapp' => ''],
        'copyright' => '',
        'show_contact' => true,
    ];

    public static function current(): self
    {
        return static::query()->firstOrFail();
    }

    /** @return array{enabled: bool, min_rating: int, max_shown: int} */
    public function reviewSettings(): array
    {
        $merged = [...self::REVIEW_DEFAULTS, ...array_intersect_key($this->reviews ?? [], self::REVIEW_DEFAULTS)];

        return [
            'enabled' => (bool) $merged['enabled'],
            'min_rating' => (int) $merged['min_rating'],
            'max_shown' => (int) $merged['max_shown'],
        ];
    }

    /** Stored footer merged over the defaults, so readers always get every key. */
    public function footerContent(): array
    {
        $stored = $this->footer ?? [];

        return [
            ...self::FOOTER_DEFAULTS,
            ...$stored,
            'social' => [...self::FOOTER_DEFAULTS['social'], ...($stored['social'] ?? [])],
        ];
    }
}
