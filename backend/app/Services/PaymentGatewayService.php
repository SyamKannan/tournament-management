<?php

namespace App\Services;

use App\Models\PlatformSetting;
use App\Support\Ids;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

/**
 * Resolves which checkout collects money for each of the two payment flows
 * the super admin configures separately:
 *
 *  - `subscription` — organizers buying/renewing a plan (BillingService)
 *  - `registration` — teams paying an organizer's ground fee (TournamentPaymentService)
 *
 * Each flow uses either Razorpay (keys saved in platform settings, falling
 * back to RAZORPAY_KEY_ID/SECRET) or the built-in `demo` checkout, which runs
 * the same order -> checkout -> signed result -> verify cycle with test cards
 * and no real money. Demo is refused in production.
 */
class PaymentGatewayService
{
    public const FLOWS = ['subscription', 'registration'];

    public const PROVIDERS = ['demo', 'razorpay'];

    /** Methods a checkout can collect online; `pay_at_ground` never reaches a gateway. */
    public const ONLINE_METHODS = ['upi', 'card', 'netbanking'];

    /** Demo card that always declines, so failure handling can be tested. */
    public const DEMO_DECLINED_CARD = '4000000000000002';

    public const DEMO_FAILING_UPI = 'failure@demo';

    private const DEMO_ORDER_TTL_MINUTES = 60;

    /** Long enough for a captain to come back and finish after a dropped connection. */
    private const RAZORPAY_ORDER_TTL_HOURS = 48;

    public function __construct(private readonly RazorpayGatewayService $razorpay) {}

    /**
     * Stored config for a flow, secret decrypted.
     *
     * @return array{provider: string, key_id: string, key_secret: string}
     */
    public function config(string $flow): array
    {
        $stored = PlatformSetting::current()->payment_gateways[$flow] ?? [];
        $secret = '';

        if (! empty($stored['key_secret'])) {
            try {
                $secret = Crypt::decryptString($stored['key_secret']);
            } catch (DecryptException) {
                $secret = ''; // APP_KEY rotated — treat as unset until re-entered.
            }
        }

        $provider = in_array($stored['provider'] ?? null, self::PROVIDERS, true) ? $stored['provider'] : 'demo';

        return [
            'provider' => $provider,
            'key_id' => (string) ($stored['key_id'] ?? '') ?: (string) config('services.razorpay.key_id'),
            'key_secret' => $secret ?: (string) config('services.razorpay.key_secret'),
        ];
    }

    /** Online methods a flow's checkout offers. */
    public function onlineMethods(string $flow): array
    {
        $settings = PlatformSetting::current();
        $methods = $flow === 'subscription'
            ? ($settings->subscription_payment_methods ?? self::ONLINE_METHODS)
            : ($settings->enabled_payment_methods ?? []);

        return array_values(array_intersect(self::ONLINE_METHODS, $methods));
    }

    public function isReady(string $flow): bool
    {
        $config = $this->config($flow);

        return $config['provider'] === 'demo'
            ? ! app()->isProduction()
            : filled($config['key_id']) && filled($config['key_secret']);
    }

    /**
     * Start a payment. `$methods` sets what the checkout offers (e.g. the
     * tournament's own accepted methods), defaulting to the flow's platform
     * list; `$preferred` preselects one.
     *
     * @throws \RuntimeException when the flow's gateway isn't usable
     */
    public function createOrder(string $flow, float $amount, string $currency, string $receipt, array $notes = [], ?array $methods = null, ?string $preferred = null): array
    {
        if (! $this->isReady($flow)) {
            throw new \RuntimeException('Online payments are not set up yet. Please contact support.');
        }

        // An explicit list (a tournament's accepted methods) wins over the
        // platform list: disabling a method platform-wide only removes it
        // from organizers' pickers, it doesn't break tournaments already using it.
        $offered = $methods !== null
            ? array_values(array_intersect(self::ONLINE_METHODS, $methods))
            : $this->onlineMethods($flow);
        if ($offered === []) {
            throw new \RuntimeException('No online payment method is available.');
        }

        $config = $this->config($flow);
        $common = [
            'configured' => true,
            'provider' => $config['provider'],
            'methods' => $offered,
            'preferred_method' => in_array($preferred, $offered, true) ? $preferred : $offered[0],
        ];

        if ($config['provider'] === 'razorpay') {
            // The flow rides on the order so verify() can tell a ground-fee
            // order from a plan order even when the cache has lost it.
            $order = $this->razorpay->createOrder($amount, $currency, $receipt, [...$notes, 'kk_flow' => $flow], $config['key_id'], $config['key_secret']);

            Cache::put($this->razorpayCacheKey($order['order_id']), [
                'flow' => $flow,
                'amount' => (int) $order['amount'],
            ], now()->addHours(self::RAZORPAY_ORDER_TTL_HOURS));

            return [...$common, ...$order];
        }

        $orderId = 'demo_order_'.Ids::token(14);
        $amountMinor = (int) round($amount * 100);

        Cache::put($this->demoCacheKey($orderId), [
            'flow' => $flow,
            'amount' => $amountMinor,
            'currency' => $currency ?: 'INR',
            'methods' => $offered,
        ], now()->addMinutes(self::DEMO_ORDER_TTL_MINUTES));

        return [...$common, 'order_id' => $orderId, 'amount' => $amountMinor, 'currency' => $currency ?: 'INR'];
    }

    /**
     * Verify a checkout result for the given flow.
     *
     * `$expectedAmount` (in rupees) is checked against what the order was
     * opened for, so a result from a part-payment order can't be presented as
     * settling the full fee. On the demo gateway the order is then spent, so
     * the same signed result can't be replayed onto a second registration.
     */
    public function verify(string $flow, ?string $orderId, ?string $paymentId, ?string $signature, ?float $expectedAmount = null): bool
    {
        if (! $orderId || ! $paymentId || ! $signature) {
            return false;
        }

        $config = $this->config($flow);

        if ($config['provider'] === 'razorpay') {
            if (! $this->razorpay->verifyPaymentSignature($orderId, $paymentId, $signature, $config['key_secret'])) {
                return false;
            }

            // The signature only proves *an* order was paid. Without checking
            // what that order was for, paying the cheapest plan's checkout (or
            // half a ground fee) could be presented as paying for anything.
            // The order is not spent here: a payment lost to a dropped
            // connection must verify again, and each flow refuses a payment
            // id it has already recorded.
            return $this->razorpayOrderMatches($config, $flow, $orderId, $expectedAmount);
        }

        if (app()->isProduction() || ! hash_equals($this->demoSignature($flow, $orderId, $paymentId), $signature)) {
            return false;
        }

        $order = Cache::get($this->demoCacheKey($orderId));

        if (! $order || $order['flow'] !== $flow) {
            return false;
        }

        if ($expectedAmount !== null && $order['amount'] !== (int) round($expectedAmount * 100)) {
            return false;
        }

        Cache::forget($this->demoCacheKey($orderId));

        return true;
    }

    /**
     * Whether a Razorpay order was opened for this flow and amount — read from
     * the cache written at creation, else from Razorpay itself. An order that
     * can't be read is refused, not waved through.
     *
     * @param  array{provider: string, key_id: string, key_secret: string}  $config
     */
    private function razorpayOrderMatches(array $config, string $flow, string $orderId, ?float $expectedAmount): bool
    {
        $order = Cache::get($this->razorpayCacheKey($orderId));

        if (! $order) {
            $remote = $this->razorpay->fetchOrder($orderId, $config['key_id'], $config['key_secret']);

            if (! $remote) {
                return false;
            }

            $order = ['flow' => $remote['notes']['kk_flow'] ?? $flow, 'amount' => $remote['amount']];
        }

        if ($order['flow'] !== $flow) {
            return false;
        }

        return $expectedAmount === null || $order['amount'] === (int) round($expectedAmount * 100);
    }

    private function razorpayCacheKey(string $orderId): string
    {
        return 'razorpay_order:'.$orderId;
    }

    /**
     * Charge a demo order. Mirrors what a real gateway checks — Luhn, expiry,
     * CVV, UPI handle format — and has deterministic decline inputs.
     *
     * @return array{razorpay_payment_id: string, razorpay_order_id: string, razorpay_signature: string}
     *
     * @throws \InvalidArgumentException bad input (422)
     * @throws \DomainException          payment declined (402)
     */
    public function demoPay(string $orderId, array $input): array
    {
        $order = Cache::get($this->demoCacheKey($orderId));

        if (! $order) {
            throw new \InvalidArgumentException('This payment session has expired. Please start again.');
        }

        $method = $input['method'] ?? '';
        if (! in_array($method, $order['methods'], true)) {
            throw new \InvalidArgumentException('This payment method is not available.');
        }

        match ($method) {
            'card' => $this->checkDemoCard($input),
            'upi' => $this->checkDemoUpi($input),
            'netbanking' => $this->checkDemoNetbanking($input),
        };

        $paymentId = 'demo_pay_'.Ids::token(14);

        return [
            'razorpay_payment_id' => $paymentId,
            'razorpay_order_id' => $orderId,
            'razorpay_signature' => $this->demoSignature($order['flow'], $orderId, $paymentId),
        ];
    }

    /** Admin-facing config: secrets are never returned, only whether one is saved. */
    public function adminConfig(): array
    {
        $settings = PlatformSetting::current();
        $result = [];

        foreach (self::FLOWS as $flow) {
            $stored = $settings->payment_gateways[$flow] ?? [];
            $result[$flow] = [
                'provider' => in_array($stored['provider'] ?? null, self::PROVIDERS, true) ? $stored['provider'] : 'demo',
                'key_id' => (string) ($stored['key_id'] ?? ''),
                'has_key_secret' => ! empty($stored['key_secret']),
                'ready' => $this->isReady($flow),
            ];
        }

        return $result;
    }

    /**
     * Persist admin changes. A blank key_secret keeps the saved one, so the
     * form never has to round-trip the secret.
     */
    public function updateConfig(array $input): void
    {
        $settings = PlatformSetting::current();
        $gateways = $settings->payment_gateways ?? [];

        foreach (self::FLOWS as $flow) {
            if (! isset($input[$flow])) {
                continue;
            }

            $next = $gateways[$flow] ?? [];
            $next['provider'] = $input[$flow]['provider'] ?? ($next['provider'] ?? 'demo');

            if (array_key_exists('key_id', $input[$flow])) {
                $next['key_id'] = trim((string) $input[$flow]['key_id']);
            }
            if (filled($input[$flow]['key_secret'] ?? null)) {
                $next['key_secret'] = Crypt::encryptString(trim($input[$flow]['key_secret']));
            }

            $gateways[$flow] = $next;
        }

        $settings->payment_gateways = $gateways;
        $settings->save();
    }

    private function checkDemoCard(array $input): void
    {
        $number = preg_replace('/\D+/', '', (string) ($input['card_number'] ?? ''));

        if (strlen($number) < 13 || strlen($number) > 19 || ! $this->luhn($number)) {
            throw new \InvalidArgumentException('Enter a valid card number.');
        }
        if (trim((string) ($input['card_name'] ?? '')) === '') {
            throw new \InvalidArgumentException('Enter the name on the card.');
        }
        if (! preg_match('/^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/', (string) ($input['card_expiry'] ?? ''), $m)) {
            throw new \InvalidArgumentException('Enter the expiry as MM/YY.');
        }
        $expiresEnd = now()->setDate(2000 + (int) $m[2], (int) $m[1], 1)->endOfMonth();
        if ($expiresEnd->isPast()) {
            throw new \InvalidArgumentException('This card has expired.');
        }
        if (! preg_match('/^\d{3,4}$/', (string) ($input['card_cvv'] ?? ''))) {
            throw new \InvalidArgumentException('Enter a valid CVV.');
        }
        if ($number === self::DEMO_DECLINED_CARD) {
            throw new \DomainException('Your card was declined by the bank. Try another card.');
        }
    }

    private function checkDemoUpi(array $input): void
    {
        $vpa = strtolower(trim((string) ($input['upi_id'] ?? '')));

        if (! preg_match('/^[a-z0-9.\-_]{2,}@[a-z]{2,}$/', $vpa)) {
            throw new \InvalidArgumentException('Enter a valid UPI ID, e.g. name@bank.');
        }
        if ($vpa === self::DEMO_FAILING_UPI) {
            throw new \DomainException('The UPI payment was declined. Try another UPI ID.');
        }
    }

    private function checkDemoNetbanking(array $input): void
    {
        if (trim((string) ($input['bank'] ?? '')) === '') {
            throw new \InvalidArgumentException('Choose your bank.');
        }
        if (($input['outcome'] ?? 'success') === 'failure') {
            throw new \DomainException('The bank did not authorise this payment.');
        }
    }

    private function luhn(string $digits): bool
    {
        $sum = 0;
        $alt = false;
        for ($i = strlen($digits) - 1; $i >= 0; $i--) {
            $n = (int) $digits[$i];
            if ($alt) {
                $n *= 2;
                if ($n > 9) {
                    $n -= 9;
                }
            }
            $sum += $n;
            $alt = ! $alt;
        }

        return $sum % 10 === 0;
    }

    private function demoSignature(string $flow, string $orderId, string $paymentId): string
    {
        return hash_hmac('sha256', "{$flow}|{$orderId}|{$paymentId}", 'demo-gateway|'.config('app.key'));
    }

    private function demoCacheKey(string $orderId): string
    {
        return 'demo_payment_order:'.$orderId;
    }
}
