<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Thin wrapper around Razorpay's Orders API and payment-signature
 * verification. Payments stay simulated everywhere in this app until
 * RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are set — see isConfigured().
 */
class RazorpayGatewayService
{
    public function isConfigured(): bool
    {
        return filled(config('services.razorpay.key_id')) && filled(config('services.razorpay.key_secret'));
    }

    /**
     * Create a Razorpay order for the given amount and return what the
     * client needs to open Checkout.
     *
     * @return array{order_id: string, amount: int, currency: string, key_id: string}
     *
     * @throws \RuntimeException when the order cannot be created
     */
    public function createOrder(float $amountRupees, string $currency, string $receipt, array $notes = []): array
    {
        $keyId = (string) config('services.razorpay.key_id');
        $keySecret = (string) config('services.razorpay.key_secret');
        $amountPaise = (int) round($amountRupees * 100);

        $response = Http::withBasicAuth($keyId, $keySecret)
            ->asJson()
            ->post('https://api.razorpay.com/v1/orders', [
                'amount' => $amountPaise,
                'currency' => $currency ?: 'INR',
                'receipt' => $receipt,
                'notes' => $notes,
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Unable to create Razorpay order: '.$response->body());
        }

        $order = $response->json();

        return [
            'order_id' => $order['id'],
            'amount' => $order['amount'],
            'currency' => $order['currency'],
            'key_id' => $keyId,
        ];
    }

    /**
     * Verify the signature Razorpay Checkout returns after a successful
     * payment, per Razorpay's documented HMAC-SHA256 scheme.
     */
    public function verifyPaymentSignature(string $orderId, string $paymentId, string $signature): bool
    {
        $keySecret = (string) config('services.razorpay.key_secret');
        $expected = hash_hmac('sha256', "{$orderId}|{$paymentId}", $keySecret);

        return hash_equals($expected, $signature);
    }
}
