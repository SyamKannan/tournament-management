<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Match/tournament social posters (matchday, toss, result, player_of_match,
 * points_table, tournament_announcement). Additive only — does not touch any
 * existing table, including the `poster` URL column already on `tournaments`
 * for the earlier plain tournament-branding poster.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posters', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tournament_id')->index();
            $table->string('match_id')->nullable()->index();
            $table->string('poster_type', 32)->index();
            $table->text('image_path');
            $table->string('created_by')->nullable();
            $table->timestamps();

            $table->foreign('tournament_id')->references('id')->on('tournaments')->cascadeOnDelete();
            $table->foreign('match_id')->references('id')->on('matches')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posters');
    }
};
