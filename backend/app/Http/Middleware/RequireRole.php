<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        if (! in_array($user->role, $roles, true)) {
            return response()->json([
                'error' => sprintf(
                    'Forbidden. Required one of roles: [%s]. You are [%s].',
                    implode(', ', $roles),
                    $user->role
                ),
            ], 403);
        }

        return $next($request);
    }
}
