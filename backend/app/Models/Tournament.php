<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tournament extends BaseModel
{
    /**
     * Ground-fee payment methods an organizer can accept, configured on
     * payment_config.enabled_methods at tournament-creation time. 'upi' opens
     * a real Razorpay Checkout (UPI/cards/netbanking/wallets) once
     * RAZORPAY_KEY_ID/SECRET are set, and falls back to a simulated payment
     * otherwise — see TournamentPaymentService/RazorpayGatewayService.
     */
    public const PAYMENT_METHODS = ['upi', 'pay_at_ground'];

    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'logo' => '',
        'banner' => '',
        'poster' => '',
        'description' => '',
    ];

    protected $casts = [
        'max_teams' => 'integer',
        'ground_fee' => 'float',
        'prize_money' => 'float',
        'runner_up_prize' => 'float',
        'payment_config' => 'array',
        'settings' => 'array',
        'has_auction' => 'boolean',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function teams(): HasMany
    {
        return $this->hasMany(Team::class);
    }

    public function matches(): HasMany
    {
        return $this->hasMany(GameMatch::class);
    }

    public function registrationLink()
    {
        return $this->hasOne(RegistrationLink::class);
    }
}
