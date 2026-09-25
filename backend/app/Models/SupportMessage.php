<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One message in a support thread. `is_internal` notes never leave the admin side. */
class SupportMessage extends BaseModel
{
    protected $attributes = [
        'is_internal' => false,
    ];

    protected $casts = [
        'is_internal' => 'boolean',
        'attachments' => 'array',
    ];

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class, 'ticket_id');
    }
}
