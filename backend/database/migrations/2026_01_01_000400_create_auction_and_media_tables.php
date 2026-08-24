<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Player auction domain plus the sponsor / advertisement / announcement
 * records that feed the big-screen scoreboard, and career player statistics.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auctions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('title');
            $table->string('token')->unique();
            $table->string('status', 32)->default('draft')->index();
            $table->string('auction_date')->default('');
            $table->string('auction_start_time')->nullable();
            $table->string('auction_end_time')->nullable();
            $table->decimal('team_purse', 14, 2)->default(0);
            $table->decimal('min_bid_increment', 12, 2)->default(0);
            $table->unsignedInteger('max_players_per_team')->default(12);
            $table->unsignedInteger('min_players_per_team')->default(7);
            $table->json('base_prices');
            $table->string('current_player_id')->nullable();
            $table->decimal('current_bid_amount', 14, 2)->default(0);
            $table->string('current_bid_team_id')->nullable();
            $table->string('current_bid_team_name')->nullable();
            $table->string('hammer_state', 16)->default('waiting');
            $table->unsignedInteger('hammer_timer_seconds')->default(30);
            $table->boolean('accelerated_round_active')->default(false);
            $table->timestamps();
        });

        Schema::create('auction_players', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('auction_id')->index();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('player_id')->nullable();
            $table->string('user_id')->nullable();
            $table->string('full_name');
            $table->string('mobile')->default('');
            $table->string('email')->nullable();
            $table->text('photo')->nullable();
            $table->unsignedInteger('age')->default(0);
            $table->string('village')->default('');
            $table->string('district')->default('');
            $table->string('sport_code', 16)->default('football');
            $table->string('category', 32)->default('Category B');
            $table->decimal('base_price', 14, 2)->default(0);
            $table->decimal('sold_price', 14, 2)->nullable();
            $table->string('sold_to_team_id')->nullable();
            $table->string('sold_to_team_name')->nullable();
            $table->string('status', 32)->default('registered')->index();
            $table->string('cricket_role', 64)->nullable();
            $table->string('cricket_batting_style', 64)->nullable();
            $table->string('cricket_bowling_style', 64)->nullable();
            $table->string('football_position', 64)->nullable();
            $table->string('football_preferred_foot', 16)->nullable();
            $table->text('past_achievements')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->foreign('auction_id')->references('id')->on('auctions')->cascadeOnDelete();
        });

        Schema::create('auction_bids', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('auction_id')->index();
            $table->string('player_id')->index();
            $table->string('team_id');
            $table->string('team_name')->default('');
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('timestamp');
            $table->unsignedBigInteger('sequence')->default(0);

            $table->index(['auction_id', 'sequence']);
            $table->foreign('auction_id')->references('id')->on('auctions')->cascadeOnDelete();
        });

        Schema::create('sponsors', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->index();
            $table->string('name');
            $table->text('logo')->nullable();
            $table->text('website')->nullable();
            $table->string('tier', 16)->default('gold');
            $table->text('description')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::create('advertisements', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->index();
            $table->string('title');
            $table->string('business_name')->default('');
            $table->string('media_type', 32)->default('image');
            $table->string('display_placement', 32)->nullable();
            $table->text('media_url')->nullable();
            $table->text('logo_url')->nullable();
            $table->text('description')->nullable();
            $table->string('phone')->nullable();
            $table->string('whatsapp')->nullable();
            $table->text('website')->nullable();
            $table->integer('priority')->default(5);
            $table->unsignedInteger('duration_seconds')->default(10);
            $table->string('status', 16)->default('active')->index();
            $table->string('start_date')->nullable();
            $table->string('end_date')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::create('announcements', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->index();
            $table->string('tournament_id')->nullable()->index();
            $table->string('title');
            $table->text('message');
            $table->string('type', 32)->default('general');
            $table->boolean('is_active_on_scoreboard')->default(false);
            $table->string('expires_at')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

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

    public function down(): void
    {
        Schema::dropIfExists('player_stats');
        Schema::dropIfExists('announcements');
        Schema::dropIfExists('advertisements');
        Schema::dropIfExists('sponsors');
        Schema::dropIfExists('auction_bids');
        Schema::dropIfExists('auction_players');
        Schema::dropIfExists('auctions');
    }
};
