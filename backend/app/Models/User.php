<?php

namespace App\Models;

use App\Services\LegalService;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class User extends BaseModel implements AuthenticatableContract
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'avatar' => '',
    ];

    use Authenticatable;

    /**
     * The super admin looking through this account, when the request came in
     * on an impersonation token (its `imp` claim). Set by TokenService, never
     * stored. Such a session can't agree to terms on the person's behalf.
     */
    public ?string $impersonatorId = null;

    protected $hidden = ['password_hash'];

    protected $casts = [
        'must_change_password' => 'boolean',
        'terms_version_accepted' => 'integer',
        'privacy_version_accepted' => 'integer',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /**
     * The trimmed identity payload every auth endpoint returns.
     */
    public function toAuthPayload(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'role' => $this->role,
            'avatar' => $this->avatar,
            'organization_id' => $this->organization_id,
            // The client routes straight to "choose a password" when this is
            // set, so an onboarding or admin-issued credential is never left
            // in place as a shared secret.
            'must_change_password' => (bool) $this->must_change_password,
            // The super admin looking through this account, when this session
            // is an impersonation. The client shows its banner from this, not
            // from what the browser happens to have stored.
            'impersonated_by' => $this->impersonatorId,
            // Documents (terms, privacy) this account must accept before the
            // app lets it do anything; the client's TermsGate shows them.
            'legal_pending' => app(LegalService::class)->pendingFor($this),
            // Whether this is a returning account being asked about a new
            // version, rather than one that has never agreed to anything.
            'legal_accepted_before' => $this->terms_version_accepted !== null || $this->privacy_version_accepted !== null,
        ];
    }
}
