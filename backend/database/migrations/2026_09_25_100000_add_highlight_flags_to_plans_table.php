<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The "Most popular" and "Best value" badges on plan cards, set by the super
 * admin. At most one plan carries each. Previously the landing page guessed
 * "Most popular" from the plan's name; the standard plan keeps that badge.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->boolean('is_popular')->default(false);
            $table->boolean('is_best_value')->default(false);
        });

        DB::table('plans')->where('id', 'plan-standard')->update(['is_popular' => true]);
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn(['is_popular', 'is_best_value']);
        });
    }
};
