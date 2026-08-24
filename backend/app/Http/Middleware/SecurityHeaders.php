<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline response hardening for the API.
 *
 * The API returns JSON rather than markup, so the policy here is deliberately
 * strict: nothing should ever be framed, sniffed, or treated as a document.
 * The SPA is served separately and carries its own policy.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $headers = [
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Cross-Origin-Resource-Policy' => 'same-site',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        ];

        // HSTS is only meaningful over TLS, and asserting it on plain HTTP in
        // development would pin localhost to https in the browser.
        if ($request->secure()) {
            $headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
        }

        foreach ($headers as $name => $value) {
            $response->headers->set($name, $value);
        }

        return $response;
    }
}
