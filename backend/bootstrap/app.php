<?php

use App\Http\Middleware\RequireAuth;
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
            ResolveApiUser::class,
        ]);

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
    })->create();
