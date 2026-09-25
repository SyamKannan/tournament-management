<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->registerRateLimiters();
    }

    /**
     * Named limiters for the endpoints that need their own budget.
     *
     * An inline `throttle:5,10` does *not* get one. Its cache key is only the
     * caller's IP (or user id) — not the route — which is the same key the
     * global `throttleApi` uses. So it counts *every* API call from that
     * browser: a login page that loaded ten things is already "too many
     * attempts". A named limiter is namespaced by its own name, so the number
     * written here is the number that applies, to that endpoint alone.
     */
    private function registerRateLimiters(): void
    {
        // Signing in: per account and per address, so one person mistyping is
        // slowed down without locking out everyone behind the same club Wi-Fi.
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(10)->by('login:'.$request->ip().'|'.strtolower((string) $request->input('email', $request->input('phone', '')))),
            Limit::perMinute(30)->by('login:'.$request->ip()),
        ]);

        // Plain per-endpoint budgets: name => [attempts, minutes].
        $budgets = [
            'demo-switch' => [20, 1],
            'register-org' => [5, 1],
            'register-player' => [10, 1],
            'demo-pay' => [30, 1],
            'registration' => [10, 1],
            'registration-validate' => [30, 1],
            'match-current' => [60, 1],
            'upload' => [60, 1],
            'public-stats' => [60, 1],
            'assistant' => [10, 1],
            'review' => [10, 10],
        ];
        foreach ($budgets as $name => [$max, $minutes]) {
            RateLimiter::for($name, fn (Request $request) => [
                Limit::perMinutes($minutes, $max)->by($name.':'.($request->user()?->id ?? $request->ip())),
            ]);
        }

        // Asking for a reset code. Tight, because this endpoint would otherwise
        // answer "does this phone number have an account?" for a whole list of
        // numbers, and because every request sends a real SMS.
        RateLimiter::for('password-reset-request', fn (Request $request) => [
            Limit::perMinutes(10, 5)->by($request->ip()),
        ]);

        // Submitting a code. Higher, because somebody mistyping six digits on a
        // phone keypad should not be locked out — the code's own attempt ceiling
        // is what stops it being guessed.
        RateLimiter::for('password-reset-submit', fn (Request $request) => [
            Limit::perMinutes(10, 10)->by($request->ip()),
        ]);
    }
}
