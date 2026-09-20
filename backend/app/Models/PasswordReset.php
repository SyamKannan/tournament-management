<?php

namespace App\Models;

/**
 * An outstanding request to reset a password.
 *
 * The code itself is never stored — only its hash — so this row cannot be used
 * to take an account over.
 */
class PasswordReset extends BaseModel
{
    protected $table = 'password_resets';

    const UPDATED_AT = null;

    protected $casts = [
        'attempts' => 'integer',
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function isUsable(): bool
    {
        return $this->used_at === null
            && $this->expires_at->isFuture()
            && $this->attempts < self::MAX_ATTEMPTS;
    }

    /** Wrong guesses allowed before the code is burned. */
    public const MAX_ATTEMPTS = 5;
}
