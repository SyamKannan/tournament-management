<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Thin wrapper around Razorpay's Orders API and payment-signature
 * verification. Keys are passed in per call because each payment flow can
 * use its own account — see PaymentGatewayService, which picks them.
 */
class RazorpayGatewayService
{
    /**
     * Create a Razorpay order for the given amount and return what the
     * client needs to open Checkout.
     *
     * @return array{order_id: string, amount: int, currency: string, key_id: string}
     *
     * @throws \RuntimeException when the order cannot be created
     */
    public function createOrder(float $amountRupees, string $currency, string $receipt, array $notes, string $keyId, string $keySecret): array
    {
        $amountPaise = (int) round($amountRupees * 100);

        $response = Http::withBasicAuth($keyId, $keySecret)
            ->asJson()
            ->timeout(15)
            ->post('https://api.razorpay.com/v1/orders', [
                'amount' => $amountPaise,
                'currency' => $currency ?: 'INR',
                'receipt' => substr($receipt, 0, 40),
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
     * An order as Razorpay holds it — what it was opened for, which a signed
     * checkout result says nothing about. Null when it can't be read.
     *
     * @return array{amount: int, notes: array<string, mixed>}|null
     */
    public function fetchOrder(string $orderId, string $keyId, string $keySecret): ?array
    {
        try {
            $response = Http::withBasicAuth($keyId, $keySecret)
                ->timeout(15)
                ->get('https://api.razorpay.com/v1/orders/'.rawurlencode($orderId));
        } catch (\Throwable) {
            return null;
        }

        if (! $response->successful() || ! is_numeric($response->json('amount'))) {
            return null;
        }

        return [
            'amount' => (int) $response->json('amount'),
            'notes' => (array) ($response->json('notes') ?? []),
        ];
    }

    /**
     * Verify the signature Razorpay Checkout returns after a successful
     * payment, per Razorpay's documented HMAC-SHA256 scheme.
     */
    public function verifyPaymentSignature(string $orderId, string $paymentId, string $signature, string $keySecret): bool
    {
        if ($keySecret === '') {
            return false;
        }

        $expected = hash_hmac('sha256', "{$orderId}|{$paymentId}", $keySecret);

        return hash_equals($expected, $signature);
    }
}
