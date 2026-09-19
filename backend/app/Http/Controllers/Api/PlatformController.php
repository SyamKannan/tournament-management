<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GameMatch;
use App\Models\Organization;
use App\Models\Plan;
use App\Models\PlatformSetting;
use App\Models\Player;
use App\Models\Sport;
use App\Models\Team;
use App\Models\Tournament;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

/**
 * Unauthenticated platform endpoints: the public plan catalogue and a health probe.
 */
class PlatformController extends Controller
{
    /**
     * The plans organizers may currently subscribe to. Deactivated/archived
     * plans are omitted entirely, not flagged — organizations already on one
     * keep their limits, but it can no longer be newly chosen.
     */
    public function plans(): JsonResponse
    {
        return response()->json(Plan::query()->where('status', 'active')->ordered()->get());
    }

    /**
     * The sports end users are allowed to see and create tournaments for.
     * Disabled sports are omitted entirely, not flagged — existing tournaments
     * in a disabled sport keep working, but nothing new can be created in it.
     */
    public function sports(): JsonResponse
    {
        return response()->json(Sport::query()->where('is_active', true)->get());
    }

    /**
     * The payment methods organizers may currently offer teams at
     * registration (e.g. "upi", "pay_at_ground"). Mirrors sports(): a
     * disabled method disappears from the list rather than being flagged,
     * so tournaments already using it keep working.
     */
    public function paymentMethods(): JsonResponse
    {
        return response()->json(PlatformSetting::current()->enabled_payment_methods ?? []);
    }

    /** Landing-page footer: admin-edited content plus the public support contact. */
    public function footer(): JsonResponse
    {
        $settings = PlatformSetting::current();
        $footer = $settings->footerContent();

        return response()->json([
            ...$footer,
            'platform_name' => $settings->platform_name,
            'support_email' => $footer['show_contact'] ? $settings->support_email : null,
            'support_phone' => $footer['show_contact'] ? $settings->support_phone : null,
        ]);
    }

    /**
     * Headline counts for the sign-in and sign-up pages. Only public-facing
     * activity is counted (active clubs, published tournaments), and the
     * result is cached briefly since every visitor to those pages asks.
     */
    public function stats(): JsonResponse
    {
        return response()->json(Cache::remember('platform-stats', now()->addMinutes(10), fn () => [
            'clubs' => Organization::query()->where('status', 'active')->count(),
            'tournaments' => Tournament::query()->where('status', '!=', 'draft')->count(),
            'teams' => Team::query()->whereNotIn('status', ['rejected', 'withdrawn'])->count(),
            'players' => Player::query()->count(),
            'matches_played' => GameMatch::query()->where('status', 'completed')->count(),
            'live_matches' => GameMatch::query()
                ->whereIn('status', ['toss', 'in_progress', 'half_time', 'innings_break', 'drinks_break'])
                ->count(),
        ]));
    }

    public function health(): JsonResponse
    {
        return response()->json([
            'status' => 'healthy',
            'platform' => PlatformSetting::current()->platform_name,
            'time' => now()->toIso8601ZuluString('millisecond'),
            'version' => '1.0.0',
        ]);
    }
}
