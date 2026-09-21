<?php

namespace App\Exceptions;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

/**
 * Turns a thrown exception into the error envelope the client already reads.
 *
 * Controllers here answer failures with `{"error": "..."}` and the client
 * shows that string. Anything the *framework* throws used to come back in
 * Laravel's own shape instead — `{"message": ..., "errors": {...}}` — which
 * has no `error` key, so every one of those reached a person as the literal
 * text "Request failed with status 422". A validation message the server had
 * already written in plain English was thrown away at the last step.
 *
 * So every exception leaves through here in one shape:
 *
 *     {
 *       "error":  "Enter a jersey number between 1 and 99.",  // always present
 *       "message": "<same string>",                           // Laravel's key, kept
 *       "code":   "VALIDATION_FAILED",                        // stable, for branching
 *       "errors": { "players.3.jersey_number": ["..."] }      // 422 only
 *     }
 *
 * `error` is a sentence meant for the person who hit it. `errors` is what lets
 * the form put the message under the field that caused it instead of floating
 * it in a toast, so a captain filling in fifteen players is told *which* row
 * is wrong.
 */
class ApiExceptionRenderer
{
    /**
     * Render, or return null to let Laravel handle it (HTML pages, and the
     * debug trace in local development for genuine 500s).
     */
    public function __invoke(\Throwable $e, Request $request): ?JsonResponse
    {
        if (! $request->is('api/*') && ! $request->expectsJson()) {
            return null;
        }

        return match (true) {
            $e instanceof ValidationException => $this->validation($e),
            $e instanceof AuthenticationException => $this->make(
                401,
                'You need to sign in to do that.',
                'UNAUTHENTICATED',
            ),
            $e instanceof AuthorizationException => $this->make(
                403,
                $e->getMessage() ?: 'You do not have permission to do that.',
                'FORBIDDEN',
            ),
            $e instanceof ModelNotFoundException => $this->make(
                404,
                'That record no longer exists. It may have been deleted while this page was open.',
                'NOT_FOUND',
            ),
            $e instanceof NotFoundHttpException => $this->make(
                404,
                'That page or record could not be found.',
                'NOT_FOUND',
            ),
            $e instanceof MethodNotAllowedHttpException => $this->make(
                405,
                'That action is not available here.',
                'METHOD_NOT_ALLOWED',
            ),
            $e instanceof TooManyRequestsHttpException => $this->throttled($e),
            $e instanceof HttpExceptionInterface => $this->httpException($e),
            default => $this->unexpected($e),
        };
    }

    /**
     * A 422 keeps the per-field detail and promotes the first message to
     * `error`, because a form with no field-level display still has to show
     * the reader something they can act on.
     */
    private function validation(ValidationException $e): JsonResponse
    {
        $errors = $e->errors();
        $first = collect($errors)->flatten()->first();

        return $this->make(
            422,
            (string) ($first ?: 'Some of the details entered are not valid.'),
            'VALIDATION_FAILED',
            ['errors' => $errors],
        );
    }

    /**
     * Rate limiting is the one error where the useful part is *when to try
     * again*, so it is spelled out rather than left as a bare refusal.
     */
    private function throttled(TooManyRequestsHttpException $e): JsonResponse
    {
        $retryAfter = (int) ($e->getHeaders()['Retry-After'] ?? 0);

        $message = $retryAfter > 0
            ? 'Too many attempts. Please wait '.$this->humanSeconds($retryAfter).' and try again.'
            : 'Too many attempts. Please wait a moment and try again.';

        return $this->make(429, $message, 'RATE_LIMITED', [
            'retry_after' => $retryAfter,
        ])->withHeaders($e->getHeaders());
    }

    private function httpException(HttpExceptionInterface $e): JsonResponse
    {
        $status = $e->getStatusCode();
        $message = $e instanceof \Throwable ? trim($e->getMessage()) : '';

        return $this->make(
            $status,
            $message !== '' ? $message : $this->genericFor($status),
            'HTTP_'.$status,
        )->withHeaders($e->getHeaders());
    }

    /**
     * An unhandled throwable. The reader gets a sentence and nothing else —
     * an exception message can carry a query, a path or a key. The detail is
     * added back only when the app is in debug mode, where the developer
     * looking at it is the only audience.
     */
    private function unexpected(\Throwable $e): JsonResponse
    {
        $extra = config('app.debug')
            ? [
                'debug' => [
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                    'file' => $e->getFile().':'.$e->getLine(),
                ],
            ]
            : [];

        return $this->make(
            500,
            'Something went wrong on our side. The team has been notified — please try again.',
            'SERVER_ERROR',
            $extra,
        );
    }

    /** @param  array<string, mixed>  $extra */
    private function make(int $status, string $message, string $code, array $extra = []): JsonResponse
    {
        return response()->json([
            // `error` is what this application's clients read; `message` is
            // Laravel's own key, kept so anything expecting the framework
            // shape still works. They are deliberately the same string.
            'error' => $message,
            'message' => $message,
            'code' => $code,
            ...$extra,
        ], $status);
    }

    private function genericFor(int $status): string
    {
        return match ($status) {
            400 => 'That request could not be understood.',
            401 => 'You need to sign in to do that.',
            403 => 'You do not have permission to do that.',
            404 => 'That page or record could not be found.',
            409 => 'That conflicts with a change someone else just made. Reload and try again.',
            413 => 'That file is too large to upload.',
            503 => 'This service is temporarily unavailable. Please try again shortly.',
            default => 'The request could not be completed.',
        };
    }

    /** "30 seconds" / "2 minutes" — a number of seconds is not an instruction. */
    private function humanSeconds(int $seconds): string
    {
        if ($seconds < 60) {
            return $seconds.' '.($seconds === 1 ? 'second' : 'seconds');
        }

        $minutes = (int) ceil($seconds / 60);

        return $minutes.' '.($minutes === 1 ? 'minute' : 'minutes');
    }
}
