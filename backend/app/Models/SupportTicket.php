<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A question from a club (or a locked-out visitor) to the platform.
 *
 * `open` waits on the platform, `awaiting_reply` on the club, `resolved` can
 * still be reopened by a reply, and `closed` is final — the sweep closes
 * resolved tickets nobody came back to.
 */
class SupportTicket extends BaseModel
{
    public const CATEGORIES = ['billing', 'account_access', 'bug', 'tournament_help', 'feature_request', 'other'];

    public const STATUSES = ['open', 'awaiting_reply', 'resolved', 'closed'];

    public const PRIORITIES = ['normal', 'urgent'];

    protected $attributes = [
        'priority' => 'normal',
        'status' => 'open',
        'unread_by_user' => false,
        'unread_by_admin' => true,
    ];

    protected $casts = [
        'number' => 'integer',
        'context' => 'array',
        'unread_by_user' => 'boolean',
        'unread_by_admin' => 'boolean',
        'last_message_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(SupportMessage::class, 'ticket_id')->orderBy('created_at')->orderBy('id');
    }

    public function reference(): string
    {
        return 'KW-'.$this->number;
    }
}
