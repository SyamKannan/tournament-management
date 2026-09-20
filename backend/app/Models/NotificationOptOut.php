<?php

namespace App\Models;

/**
 * A number that has asked not to be contacted, keyed by its normalised form so
 * it matches however the number was typed in. One row silences every channel.
 */
class NotificationOptOut extends BaseModel
{
    protected $table = 'notification_opt_outs';

    protected $primaryKey = 'phone';

    const UPDATED_AT = null;
}
