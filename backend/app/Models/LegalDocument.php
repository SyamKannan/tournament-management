<?php

namespace App\Models;

/**
 * One published version of the Terms & Conditions or the Privacy Policy.
 * Immutable once written — `LegalService::publish()` is the only way in.
 */
class LegalDocument extends BaseModel
{
    public const TYPES = ['terms', 'privacy'];

    /** The column on `users` holding the version each account last accepted. */
    public const USER_COLUMNS = [
        'terms' => 'terms_version_accepted',
        'privacy' => 'privacy_version_accepted',
    ];

    protected $casts = [
        'version' => 'integer',
        'requires_reacceptance' => 'boolean',
        'published_at' => 'datetime',
    ];

    public function toPublicArray(): array
    {
        return [
            'type' => $this->type,
            'version' => $this->version,
            'title' => $this->title,
            'body' => $this->body,
            'summary_of_changes' => $this->summary_of_changes,
            'requires_reacceptance' => $this->requires_reacceptance,
            'published_at' => $this->published_at ? $this->serializeDate($this->published_at) : null,
        ];
    }
}
