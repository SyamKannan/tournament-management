<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PaymentGatewayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The built-in demo checkout's "charge" step. Public (anonymous teams pay
 * ground fees too) and 404 in production, where only Razorpay is allowed.
 */
class PaymentController extends Controller
{
    public function __construct(private readonly PaymentGatewayService $gateway) {}

    public function demoPay(Request $request, string $orderId): JsonResponse
    {
        abort_if(app()->isProduction(), 404);

        $input = $request->validate([
            'method' => ['required', 'string', 'in:'.implode(',', PaymentGatewayService::ONLINE_METHODS)],
            'card_number' => ['nullable', 'string', 'max:32'],
            'card_name' => ['nullable', 'string', 'max:255'],
            'card_expiry' => ['nullable', 'string', 'max:8'],
            'card_cvv' => ['nullable', 'string', 'max:4'],
            'upi_id' => ['nullable', 'string', 'max:255'],
            'bank' => ['nullable', 'string', 'max:64'],
            'outcome' => ['nullable', 'string', 'in:success,failure'],
        ]);

        try {
            return response()->json($this->gateway->demoPay($orderId, $input));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        } catch (\DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 402);
        }
    }
}
