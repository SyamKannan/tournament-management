<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Player statistics are no longer stored. PlayerStatsService derives them from
 * the scoring logs on every read, so the `player_stats` counters — seeded with
 * placeholder numbers and only ever nudged up and down by the scoring engine —
 * have nothing left to do.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('player_stats');
    }

    public function down(): void
    {
        Schema::create('player_stats', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('player_id')->index();
            $table->string('user_id')->nullable();
            $table->string('full_name');
            $table->text('photo')->nullable();
            $table->unsignedInteger('jersey_number')->nullable();
            $table->string('team_id')->nullable();
            $table->string('team_name')->nullable();
            $table->string('organization_id')->index();
            $table->string('tournament_id')->nullable()->index();
            $table->string('sport_code', 16)->default('football');
            $table->json('cricket')->nullable();
            $table->json('football')->nullable();
            $table->json('recent_performances')->nullable();
            $table->json('awards')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
    }
};
