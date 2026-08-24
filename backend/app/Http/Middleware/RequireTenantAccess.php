<?php

namespace App\Http\Middleware;

use App\Models\GameMatch;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\Audit;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Strict tenant isolation.
 *
 * Works out which organization a request is reaching for — from an explicit
 * route/body/query parameter, or by resolving the owner of the tournament, team
 * or match being addressed — and refuses when that is not the caller's own
 * organization. Super admins are platform-wide and bypass the check.
 *
 * Every refusal is written to the audit trail, since a cross-tenant attempt is
 * a security event worth keeping.
 */
class RequireTenantAccess
{
    /**
     * @param  string|null  $orgParam  Route parameter holding the organization id,
     *                                 for routes where it is not named `orgId`
     *                                 (`tenant:id` on `/organizations/{id}`).
     */
    public function handle(Request $request, Closure $next, ?string $orgParam = null): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        if ($user->role === 'SUPER_ADMIN') {
            return $next($request);
        }

        $targetOrgId = $this->resolveTargetOrganization($request, $orgParam);

        if (! $user->organization_id || ($targetOrgId && $user->organization_id !== $targetOrgId)) {
            Audit::log([
                'organization_id' => $user->organization_id,
                'user_id' => $user->id,
                'user_name' => $user->name,
                'user_role' => $user->role,
                'action' => 'SECURITY_TENANT_VIOLATION_BLOCKED',
                'entity_type' => 'TenantIsolation',
                'entity_id' => $targetOrgId ?: 'UNKNOWN',
                'details' => sprintf(
                    'User from org [%s] attempted unauthorized access to org [%s] on path %s',
                    $user->organization_id ?: 'NONE',
                    $targetOrgId,
                    $request->getRequestUri()
                ),
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'error' => '403 Forbidden: Strict Tenant Isolation Violation. You do not have permission to access data belonging to another organization.',
                'code' => 'TENANT_ISOLATION_VIOLATION',
            ], 403);
        }

        return $next($request);
    }

    private function resolveTargetOrganization(Request $request, ?string $orgParam): ?string
    {
        $direct = ($orgParam ? $request->route($orgParam) : null)
            ?? $request->route('orgId')
            ?? $request->route('organizationId')
            ?? $request->input('organization_id')
            ?? $request->query('orgId')
            ?? $request->query('organization_id');

        if ($direct) {
            return (string) $direct;
        }

        if ($tournamentId = $request->route('tournamentId')) {
            return Tournament::query()->whereKey($tournamentId)->value('organization_id');
        }

        if ($teamId = $request->route('teamId')) {
            return Team::query()->whereKey($teamId)->value('organization_id');
        }

        if ($matchId = $request->route('matchId')) {
            return GameMatch::query()->whereKey($matchId)->value('organization_id');
        }

        return null;
    }
}
