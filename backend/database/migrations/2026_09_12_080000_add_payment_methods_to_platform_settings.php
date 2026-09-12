<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->json('enabled_payment_methods')->nullable()->after('payment_gateway_mode');
        });

        DB::table('platform_settings')->update([
            'enabled_payment_methods' => json_encode(['upi', 'pay_at_ground']),
        ]);
    }

    public function down(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->dropColumn('enabled_payment_methods');
        });
    }
};
