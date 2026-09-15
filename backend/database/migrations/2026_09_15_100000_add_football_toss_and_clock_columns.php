<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Brings football up to what cricket already had.
 *
 * `kick_off_team_id` is football's answer to `batting_first_team_id`: the toss
 * winner either takes the kick-off or picks an end, and the side kicking off
 * leads the squad reveal. Kept as its own column rather than reusing the
 * cricket one, so neither sport's code has to guess what the value means.
 *
 * `elapsed_seconds` is the match clock as it stood when it was last stopped.
 * `match_minute` alone lost every second a pause cut into, and nothing ticked
 * while the clock ran; a running clock is now this plus the time since
 * `timer_started_at_epoch`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            if (! Schema::hasColumn('matches', 'kick_off_team_id')) {
                $table->string('kick_off_team_id')->nullable()->after('batting_first_team_id');
            }
        });

        Schema::table('football_match_states', function (Blueprint $table) {
            if (! Schema::hasColumn('football_match_states', 'elapsed_seconds')) {
                $table->unsignedInteger('elapsed_seconds')->default(0)->after('match_minute');
            }
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            if (Schema::hasColumn('matches', 'kick_off_team_id')) {
                $table->dropColumn('kick_off_team_id');
            }
        });

        Schema::table('football_match_states', function (Blueprint $table) {
            if (Schema::hasColumn('football_match_states', 'elapsed_seconds')) {
                $table->dropColumn('elapsed_seconds');
            }
        });
    }
};
