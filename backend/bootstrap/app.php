<?php

use App\Exceptions\ApiExceptionRenderer;
use App\Http\Middleware\RequireAuth;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\RequireRole;
use App\Http\Middleware\RequireTenantAccess;
use App\Http\Middleware\ResolveApiUser;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Identify the caller on every API request; enforcement is per-route.
        $middleware->api(prepend: [
            SecurityHeaders::class,
            ResolveApiUser::class,
        ]);

        // Sign-in and public registration are the endpoints worth rate limiting:
        // one guards credentials, the others accept unauthenticated writes.
        $middleware->throttleApi('120,1');

        $middleware->alias([
            'auth.required' => RequireAuth::class,
            'role' => RequireRole::class,
            'tenant' => RequireTenantAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Every API failure leaves in one envelope, with `error` carrying a
        // sentence the person who hit it can act on. Without this, anything
        // the framework threw — a validation failure above all — reached the
        // client with no `error` key and was shown as "Request failed with
        // status 422". See ApiExceptionRenderer.
        $exceptions->render(new ApiExceptionRenderer);
    })->create();
