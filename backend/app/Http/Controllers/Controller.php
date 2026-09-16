<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * Guard a record that carries its own organization, for routes where the
     * owning organization can only be known after the record is loaded.
     *
     * Returns the 403 response to send back, or null when access is allowed.
     * Routes whose organization is derivable from the URL should use the
     * `tenant` middleware instead.
     */
    protected function denyForeignTenant(Request $request, ?string $organizationId): ?JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        if ($user->role !== 'SUPER_ADMIN' && $organizationId !== $user->organization_id) {
            return response()->json(['error' => 'You do not have access to this organization.'], 403);
        }

        return null;
    }
}
