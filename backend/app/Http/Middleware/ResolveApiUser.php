<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\TokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the caller for every API request without ever rejecting one.
 *
 * Public endpoints (tournament hubs, registration links, scoreboards) must stay
 * reachable by anonymous visitors, so an absent or invalid credential simply
 * leaves the request unauthenticated; `RequireAuth` is what enforces access.
 *
 * Two credentials are accepted:
 *   - `Authorization: Bearer <jwt>` — the real sign-in path
 *   - `x-demo-role` / `x-demo-org-id` — the role switcher used for walkthroughs
 */
class ResolveApiUser
{
    public function __construct(private readonly TokenService $tokens) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $this->resolveDemoUser($request) ?? $this->resolveTokenUser($request);

        if ($user) {
            $this->bind($request, $user);
        } elseif ($this->presentedCredential($request)) {
            // A credential was offered and refused — expired, revoked, forged.
            // That request is anonymous, and must be said so explicitly: the
            // auth guard outlives a single request wherever the process does,
            // so without this the caller from the previous request would be
            // inherited by the one whose token was just revoked.
            //
            // Only when something was actually offered. A request carrying no
            // credential at all is left alone, so a guard set up out of band
            // still stands.
            $this->clear($request);
        }

        return $next($request);
    }

    private function presentedCredential(Request $request): bool
    {
        if ($request->bearerToken()) {
            return true;
        }

        return (bool) config('app.demo_role_switcher') && (bool) $request->header('x-demo-role');
    }

    private function resolveDemoUser(Request $request): ?User
    {
        if (! config('app.demo_role_switcher')) {
            return null;
        }

        $role = $request->header('x-demo-role');
        if (! $role) {
            return null;
        }

        $organizationId = $request->header('x-demo-org-id');

        if ($organizationId) {
            $scoped = User::query()
                ->where('role', $role)
                ->where('organization_id', $organizationId)
                ->first();

            if ($scoped) {
                return $scoped;
            }
        }

        return User::query()->where('role', $role)->first();
    }

    private function resolveTokenUser(Request $request): ?User
    {
        $token = $request->bearerToken();
        if (! $token) {
            return null;
        }

        // Signature, expiry, the revocation denylist and the user's own
        // cut-off all live behind this one call, so a revoked token leaves the
        // request anonymous exactly as an expired one does.
        return $this->tokens->authenticate($token);
    }

    private function bind(Request $request, User $user): void
    {
        $request->setUserResolver(fn () => $user);
        auth()->setUser($user);
    }

    private function clear(Request $request): void
    {
        $request->setUserResolver(fn () => null);
        auth()->forgetUser();
    }
}
