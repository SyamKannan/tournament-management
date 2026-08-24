<?php

namespace App\Models;

use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class User extends BaseModel implements AuthenticatableContract
{
    use Authenticatable;

    protected $hidden = ['password_hash'];

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
        ];
    }
}
