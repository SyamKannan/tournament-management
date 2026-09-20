<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fair play as a tie-breaker.
 *
 * Two sides level on points, goal difference and goals scored is the argument a
 * village tournament actually has, and the usual answer is the one with the
 * cleaner record. Cards are already in `football_events`, so this is derived
 * rather than entered: a yellow is one point, a red is three, fewest wins.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('standings', function (Blueprint $table) {
            $table->unsignedInteger('disciplinary_points')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('standings', function (Blueprint $table) {
            $table->dropColumn('disciplinary_points');
        });
    }
};
