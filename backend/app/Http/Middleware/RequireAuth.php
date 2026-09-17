<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireAuth
{
    /**
     * Statuses that stop an organization's people from working. Suspending an
     * organization in the admin console used to change nothing but a label —
     * its admins and scorers carried on as before.
     */
    private const BLOCKED_ORGANIZATION_STATUSES = ['suspended', 'cancelled'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        // Only signed-in actions are blocked; the public hub, scoreboards and
        // registration links stay readable, since they belong to the tournament
        // rather than to the organization's account.
        if ($user->role !== 'SUPER_ADMIN' && $user->organization_id) {
            $status = Organization::query()->whereKey($user->organization_id)->value('status');

            if (in_array($status, self::BLOCKED_ORGANIZATION_STATUSES, true)) {
                return response()->json([
                    'error' => $status === 'suspended'
                        ? 'This organization is suspended. Please contact platform support.'
                        : 'This organization’s account is closed. Please contact platform support.',
                    'code' => 'ORGANIZATION_'.strtoupper($status),
                ], 403);
            }
        }

        return $next($request);
    }
}
