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
     * An inline `throttle:5,10` does *not* get one. Its cache key is built from
     * the route and the caller's IP, which is the same key the global
     * `throttleApi` uses, so both middlewares increment the same counter and a
     * request costs two attempts instead of one — `throttle:5,10` behaves like
     * `throttle:2,10`. A named limiter is namespaced by its own name, so the
     * number written here is the number that applies.
     */
    private function registerRateLimiters(): void
    {
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
