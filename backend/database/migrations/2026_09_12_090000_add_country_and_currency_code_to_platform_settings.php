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
            $table->string('country', 100)->default('India')->after('platform_name');
            $table->string('currency_code', 8)->default('INR')->after('currency_symbol');
        });

        DB::table('platform_settings')->update([
            'country' => 'India',
            'currency_code' => 'INR',
        ]);
    }

    public function down(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->dropColumn(['country', 'currency_code']);
        });
    }
};
