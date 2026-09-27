<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which period each football event happened in.
 *
 * A penalty shoot-out settles a drawn knockout tie but is not part of the
 * score: a kick in the shoot-out goes to `team_*_penalties`, not the scoreline,
 * and is not a goal in anyone's stats. Undo has to know which of the two a
 * deleted event changed, so the event carries its period. Existing rows are
 * all from before shoot-outs were recorded apart, so they read as open play.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('football_events', function (Blueprint $table) {
            $table->string('period', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('football_events', function (Blueprint $table) {
            $table->dropColumn('period');
        });
    }
};
