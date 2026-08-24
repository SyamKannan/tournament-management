<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Live scoring domain: fixtures, per-sport match state, the append-only event
 * and ball-by-ball logs that drive undo, plus computed league standings.
 *
 * Football events and cricket deliveries live in their own tables (ordered by
 * `sequence`) rather than as JSON blobs, so undo is a single ordered delete and
 * the logs stay queryable. They are re-serialised into the `events` /
 * `deliveries` arrays the API returns.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('matches', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('sport_code', 16)->index();
            $table->unsignedInteger('match_number')->default(0);
            $table->string('round_name')->default('');
            $table->string('team_a_id')->index();
            $table->string('team_b_id')->index();
            $table->string('venue_id')->nullable();
            $table->string('scheduled_at')->default('');
            $table->string('status', 32)->default('scheduled')->index();
            $table->text('delay_reason')->nullable();
            $table->string('winner_team_id')->nullable();
            $table->text('result_summary')->nullable();
            $table->string('man_of_the_match_player_id')->nullable();
            $table->timestamps();

            $table->foreign('tournament_id')->references('id')->on('tournaments')->cascadeOnDelete();
        });

        Schema::create('football_match_states', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('match_id')->unique();
            $table->unsignedInteger('team_a_score')->default(0);
            $table->unsignedInteger('team_b_score')->default(0);
            $table->unsignedInteger('team_a_penalties')->nullable();
            $table->unsignedInteger('team_b_penalties')->nullable();
            $table->string('current_half', 16)->default('1');
            $table->unsignedInteger('match_minute')->default(0);
            $table->boolean('is_timer_running')->default(false);
            $table->unsignedBigInteger('timer_started_at_epoch')->nullable();

            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });

        Schema::create('football_events', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('match_id')->index();
            $table->unsignedInteger('sequence')->default(0);
            $table->string('team_id');
            $table->string('player_id')->default('');
            $table->string('event_type', 32);
            $table->integer('minute')->default(0);
            $table->string('assist_player_id')->nullable();
            $table->string('sub_in_player_id')->nullable();
            $table->string('sub_out_player_id')->nullable();
            $table->text('extra_info')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['match_id', 'sequence']);
            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });

        Schema::create('cricket_match_states', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('match_id')->unique();
            $table->unsignedInteger('total_overs')->default(20);
            $table->string('toss_winner_team_id')->nullable();
            $table->string('toss_decision', 8)->nullable();
            $table->unsignedTinyInteger('current_innings')->default(1);
            $table->string('batting_team_id')->default('');
            $table->string('bowling_team_id')->default('');
            $table->unsignedInteger('team_a_runs')->default(0);
            $table->unsignedInteger('team_a_wickets')->default(0);
            $table->decimal('team_a_overs', 6, 1)->default(0);
            $table->unsignedInteger('team_b_runs')->default(0);
            $table->unsignedInteger('team_b_wickets')->default(0);
            $table->decimal('team_b_overs', 6, 1)->default(0);
            $table->string('current_striker_id')->nullable();
            $table->string('current_non_striker_id')->nullable();
            $table->string('current_bowler_id')->nullable();
            $table->unsignedInteger('target_runs')->nullable();
            $table->decimal('required_run_rate', 8, 2)->nullable();
            $table->decimal('current_run_rate', 8, 2)->nullable();

            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });

        Schema::create('cricket_deliveries', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('match_id')->index();
            $table->unsignedInteger('sequence')->default(0);
            $table->unsignedTinyInteger('innings')->default(1);
            $table->unsignedInteger('over_number')->default(0);
            $table->unsignedInteger('ball_number')->default(0);
            $table->string('bowler_id')->default('');
            $table->string('striker_id')->default('');
            $table->string('non_striker_id')->default('');
            $table->integer('runs_scored')->default(0);
            $table->string('extras', 16)->default('none');
            $table->integer('extras_runs')->default(0);
            $table->boolean('is_wicket')->default(false);
            $table->string('wicket_type', 32)->nullable();
            $table->string('dismissed_player_id')->nullable();
            $table->string('fielder_id')->nullable();
            $table->text('commentary')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['match_id', 'sequence']);
            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });

        Schema::create('standings', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('team_id')->index();
            $table->string('group_name', 64)->nullable();
            $table->unsignedInteger('played')->default(0);
            $table->unsignedInteger('won')->default(0);
            $table->unsignedInteger('drawn')->default(0);
            $table->unsignedInteger('lost')->default(0);
            $table->unsignedInteger('no_result')->default(0);
            $table->integer('goals_for')->default(0);
            $table->integer('goals_against')->default(0);
            $table->integer('goal_difference')->default(0);
            $table->integer('runs_scored')->default(0);
            $table->decimal('overs_faced', 8, 1)->default(0);
            $table->integer('runs_conceded')->default(0);
            $table->decimal('overs_bowled', 8, 1)->default(0);
            $table->decimal('net_run_rate', 8, 3)->default(0);
            $table->integer('points')->default(0);
            $table->json('form');
            $table->unsignedInteger('rank')->default(1);

            $table->unique(['tournament_id', 'team_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('standings');
        Schema::dropIfExists('cricket_deliveries');
        Schema::dropIfExists('cricket_match_states');
        Schema::dropIfExists('football_events');
        Schema::dropIfExists('football_match_states');
        Schema::dropIfExists('matches');
    }
};
