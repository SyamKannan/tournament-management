<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops the unused free-trial columns. There is no time-limited trial —
 * every organizer gets one full-featured tournament for free (see plan-free)
 * and subscriptions go active immediately on signup.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->dropColumn('default_trial_days');
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('trial_days');
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn('trial_end_date');
        });
    }

    public function down(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->unsignedInteger('default_trial_days')->default(14);
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('trial_days')->default(0);
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->string('trial_end_date')->nullable();
        });
    }
};
