<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ads and announcements now belong to a single match and reach the stadium
 * display only when someone running that match puts them there, full screen.
 *
 * `match_id` replaces the organization-wide pool the display used to rotate
 * through. `duration_seconds` on announcements gives them the same on-screen
 * time ads already had (0 holds until the organizer switches back).
 * `scoreboard_item_id` records which ad or announcement the display is showing,
 * for the same reason `scoreboard_stage` is stored: a TV that reloads has to
 * land back on it.
 *
 * `display_placement` and `is_active_on_scoreboard` described the old
 * side-banner / pinned-strip placements, which no longer exist.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('advertisements', function (Blueprint $table) {
            $table->string('match_id')->nullable()->after('organization_id')->index();
            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });

        Schema::table('advertisements', function (Blueprint $table) {
            $table->dropColumn('display_placement');
        });

        Schema::table('announcements', function (Blueprint $table) {
            $table->string('match_id')->nullable()->after('tournament_id')->index();
            $table->unsignedInteger('duration_seconds')->default(30)->after('type');
            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });

        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn('is_active_on_scoreboard');
        });

        Schema::table('matches', function (Blueprint $table) {
            $table->string('scoreboard_item_id')->nullable()->after('scoreboard_stage_at');
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn('scoreboard_item_id');
        });

        Schema::table('announcements', function (Blueprint $table) {
            $table->dropForeign(['match_id']);
            $table->dropIndex(['match_id']);
            $table->dropColumn(['match_id', 'duration_seconds']);
            $table->boolean('is_active_on_scoreboard')->default(false);
        });

        Schema::table('advertisements', function (Blueprint $table) {
            $table->dropForeign(['match_id']);
            $table->dropIndex(['match_id']);
            $table->dropColumn('match_id');
            $table->string('display_placement', 32)->nullable();
        });
    }
};
