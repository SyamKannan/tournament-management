<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\PlatformSetting;
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
