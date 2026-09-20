<?php

namespace App\Models;

/**
 * One outbound message, written before it is sent.
 *
 * The row is the record of intent; `status` says what became of it. Nothing is
 * deleted on failure — an organizer asking "did the teams get told?" needs the
 * failures as much as the successes.
 */
class Notification extends BaseModel
{
    /**
     * These columns are TEXT and therefore nullable in the schema — MySQL
     * rejects a DEFAULT on TEXT. Defaulting them here keeps the API
     * emitting empty strings rather than nulls.
     */
    protected $attributes = [
        'body' => '',
    ];

    protected $casts = [
        'attempts' => 'integer',
        'sent_at' => 'datetime',
    ];

    public function isSendable(): bool
    {
        return in_array($this->status, ['queued', 'failed'], true);
    }
}
