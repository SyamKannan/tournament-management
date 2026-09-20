<?php

namespace App\Models;

/**
 * One bearer token that must no longer be accepted, keyed by its `jti` claim.
 *
 * Only tokens that have not yet expired are worth keeping: past `expires_at`
 * the signature check refuses them anyway, so TokenService prunes them.
 */
class RevokedToken extends BaseModel
{
    protected $table = 'revoked_tokens';

    protected $primaryKey = 'jti';

    const UPDATED_AT = null;

    protected $casts = [
        'expires_at' => 'integer',
    ];
}
