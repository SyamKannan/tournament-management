<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Coin toss fields, sport-agnostic like `winner_team_id` and `result_summary`
 * already on this table. Purely additive: every column is skipped if it
 * already exists, and nothing existing is altered or dropped.
 *
 * No foreign keys on the team-reference columns, matching `team_a_id` /
 * `team_b_id` / `winner_team_id` on this same table, which are plain indexed
 * strings rather than FK-constrained.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            if (! Schema::hasColumn('matches', 'toss_caller_team_id')) {
                $table->string('toss_caller_team_id')->nullable()->after('man_of_the_match_player_id');
            }
            if (! Schema::hasColumn('matches', 'toss_call')) {
                $table->string('toss_call', 8)->nullable()->after('toss_caller_team_id');
            }
            if (! Schema::hasColumn('matches', 'toss_result')) {
                $table->string('toss_result', 8)->nullable()->after('toss_call');
            }
            if (! Schema::hasColumn('matches', 'toss_winner_team_id')) {
                $table->string('toss_winner_team_id')->nullable()->after('toss_result');
            }
            if (! Schema::hasColumn('matches', 'toss_decision')) {
                $table->string('toss_decision', 8)->nullable()->after('toss_winner_team_id');
            }
            if (! Schema::hasColumn('matches', 'toss_method')) {
                $table->string('toss_method', 8)->nullable()->after('toss_decision');
            }
            if (! Schema::hasColumn('matches', 'toss_time')) {
                $table->timestamp('toss_time')->nullable()->after('toss_method');
            }
            if (! Schema::hasColumn('matches', 'batting_first_team_id')) {
                $table->string('batting_first_team_id')->nullable()->after('toss_time');
            }
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            foreach ([
                'toss_caller_team_id',
                'toss_call',
                'toss_result',
                'toss_winner_team_id',
                'toss_decision',
                'toss_method',
                'toss_time',
                'batting_first_team_id',
            ] as $column) {
                if (Schema::hasColumn('matches', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
