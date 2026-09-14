<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two additions that together let the organizer run the big screen from the
 * scorer console once the toss is done.
 *
 * `match_lineups` is a real table rather than a JSON column on `matches`
 * because the rows are ordered (batting order drives both the one-by-one squad
 * reveal and who walks out next) and are queried per player — the same reason
 * `football_events` and `cricket_deliveries` are tables.
 *
 * `scoreboard_stage` / `scoreboard_cursor` persist what the stadium display is
 * currently showing. Broadcasting alone isn't enough: a TV that reloads or
 * joins late has to land back on the segment the organizer put it on, and
 * before this the display could only guess from `match.status`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('match_lineups', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('match_id')->index();
            $table->string('team_id')->index();
            $table->string('player_id')->index();
            // Position in the batting card (cricket) or the team sheet
            // (football); also the order the big screen reveals players in.
            $table->unsignedInteger('batting_order')->default(0);
            $table->boolean('is_playing')->default(true);
            $table->boolean('is_captain')->default(false);
            $table->boolean('is_wicketkeeper')->default(false);
            $table->timestamps();

            // One row per player per match — re-saving a lineup updates rather
            // than duplicates.
            $table->unique(['match_id', 'player_id']);
            $table->index(['match_id', 'team_id', 'batting_order']);
            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });

        Schema::table('matches', function (Blueprint $table) {
            if (! Schema::hasColumn('matches', 'scoreboard_stage')) {
                $table->string('scoreboard_stage', 16)->default('auto')->after('batting_first_team_id');
            }
            // -1 means "playing" — the display works the reveal position out
            // from the elapsed time since `scoreboard_stage_at`, so every TV
            // in the ground shows the same player and one joining midway
            // catches up instead of restarting.
            if (! Schema::hasColumn('matches', 'scoreboard_cursor')) {
                $table->integer('scoreboard_cursor')->default(-1)->after('scoreboard_stage');
            }
            if (! Schema::hasColumn('matches', 'scoreboard_stage_at')) {
                $table->timestamp('scoreboard_stage_at')->nullable()->after('scoreboard_cursor');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('match_lineups');

        Schema::table('matches', function (Blueprint $table) {
            foreach (['scoreboard_stage', 'scoreboard_cursor', 'scoreboard_stage_at'] as $column) {
                if (Schema::hasColumn('matches', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
