<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\PlatformSetting;
use App\Models\Sport;
use Illuminate\Http\JsonResponse;

/**
 * Unauthenticated platform endpoints: the public plan catalogue and a health probe.
 */
class PlatformController extends Controller
{
    public function plans(): JsonResponse
    {
        return response()->json(Plan::query()->get());
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
