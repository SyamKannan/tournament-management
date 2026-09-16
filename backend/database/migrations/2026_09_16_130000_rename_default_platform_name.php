<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Replaces the old placeholder brand and support address in databases seeded
 * before the rename. Values a super admin already changed are left alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('platform_settings')
            ->where('platform_name', 'Antigravity Sports SaaS')
            ->update(['platform_name' => 'Sportivo']);

        DB::table('platform_settings')
            ->where('support_email', 'support@sports-saas.com')
            ->update(['support_email' => 'support@sportivo.app']);
    }

    public function down(): void
    {
        //
    }
};
