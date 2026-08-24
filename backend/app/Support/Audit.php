<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * Writes the platform audit trail and keeps it bounded to the most recent
 * 2,000 entries, matching the retention the previous service applied.
 */
final class Audit
{
    private const MAX_ENTRIES = 2000;

    /**
     * @param  array{organization_id?: ?string, user_id: string, user_name: string, user_role: string, action: string, entity_type: string, entity_id: string, details: string, ip_address?: ?string}  $attributes
     */
    public static function log(array $attributes): AuditLog
    {
        $log = AuditLog::create([
            'id' => Ids::unique('audit'),
            'organization_id' => $attributes['organization_id'] ?? null,
            'user_id' => $attributes['user_id'] ?? '',
            'user_name' => $attributes['user_name'] ?? '',
            'user_role' => $attributes['user_role'] ?? '',
            'action' => $attributes['action'],
            'entity_type' => $attributes['entity_type'] ?? '',
            'entity_id' => $attributes['entity_id'] ?? '',
            'details' => $attributes['details'] ?? '',
            'ip_address' => $attributes['ip_address'] ?? null,
        ]);

        self::prune();

        return $log;
    }

    private static function prune(): void
    {
        $total = AuditLog::query()->count();
        if ($total <= self::MAX_ENTRIES) {
            return;
        }

        $keepIds = AuditLog::query()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::MAX_ENTRIES)
            ->pluck('id');

        DB::table('audit_logs')->whereNotIn('id', $keepIds)->delete();
    }
}
