<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Splits payment configuration per flow (plan subscriptions vs team
 * registration fees) and replaces the catch-all "upi = pay online" method
 * with explicit upi / card / netbanking.
 */
return new class extends Migration
{
    private const ONLINE = ['upi', 'card', 'netbanking'];

    public function up(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->json('payment_gateways')->nullable()->after('enabled_payment_methods');
            $table->json('subscription_payment_methods')->nullable()->after('payment_gateways');
        });

        foreach (DB::table('platform_settings')->get() as $row) {
            DB::table('platform_settings')->where('id', $row->id)->update([
                'payment_gateways' => json_encode([
                    'subscription' => ['provider' => 'demo', 'key_id' => ''],
                    'registration' => ['provider' => 'demo', 'key_id' => ''],
                ]),
                'subscription_payment_methods' => json_encode(self::ONLINE),
                'enabled_payment_methods' => json_encode($this->expand(json_decode($row->enabled_payment_methods ?? '[]', true) ?: [])),
            ]);
        }

        foreach (DB::table('tournaments')->select('id', 'payment_config')->get() as $row) {
            $config = json_decode($row->payment_config ?? '', true);
            if (! is_array($config) || empty($config['enabled_methods'])) {
                continue;
            }
            $config['enabled_methods'] = $this->expand($config['enabled_methods']);
            DB::table('tournaments')->where('id', $row->id)->update(['payment_config' => json_encode($config)]);
        }
    }

    public function down(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->dropColumn(['payment_gateways', 'subscription_payment_methods']);
        });
    }

    /** "upi" used to mean any online payment — keep those tournaments accepting all online methods. */
    private function expand(array $methods): array
    {
        if (in_array('upi', $methods, true)) {
            $methods = [...$methods, ...self::ONLINE];
        }

        return array_values(array_unique($methods));
    }
};
