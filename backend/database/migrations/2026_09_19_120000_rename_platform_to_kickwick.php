<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Moves databases seeded under the Matchzy brand to KickWick. Values a super
 * admin already changed are left alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('platform_settings')
            ->where('platform_name', 'Matchzy')
            ->update(['platform_name' => 'KickWick']);

        DB::table('platform_settings')
            ->where('support_email', 'support@matchzy.in')
            ->update(['support_email' => 'support@kickwick.com']);
    }

    public function down(): void
    {
        //
    }
};
