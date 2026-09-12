<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tournament domain: tournaments, public registration links, venues,
 * teams, player rosters and the ground-fee payment/receipt records.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tournaments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->index();
            $table->string('sport_id');
            $table->string('sport_code', 16)->index();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('logo')->nullable();
            $table->text('banner')->nullable();
            $table->text('poster')->nullable();
            $table->text('description')->nullable();
            $table->string('location')->default('');
            $table->string('village')->default('');
            $table->string('panchayat')->default('');
            $table->string('municipality')->default('');
            $table->string('district')->default('');
            $table->string('state')->default('');
            $table->string('start_date')->default('');
            $table->string('end_date')->default('');
            $table->string('registration_opening')->default('');
            $table->string('registration_closing')->default('');
            $table->string('format', 32)->default('league');
            $table->unsignedInteger('max_teams')->default(8);
            $table->decimal('ground_fee', 12, 2)->default(0);
            $table->json('payment_config');
            $table->decimal('prize_money', 12, 2)->default(0);
            $table->decimal('runner_up_prize', 12, 2)->default(0);
            $table->string('contact_person')->default('');
            $table->string('phone')->default('');
            $table->string('whatsapp')->default('');
            $table->string('status', 32)->default('draft')->index();
            $table->json('settings');
            $table->boolean('has_auction')->default(false);
            $table->string('auction_id')->nullable();
            $table->string('auction_status', 32)->nullable();
            $table->string('auction_start_time')->nullable();
            $table->string('auction_end_time')->nullable();
            $table->timestamps();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::create('registration_links', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('token')->unique();
            $table->string('status', 16)->default('active');
            $table->unsignedInteger('max_teams')->default(0);
            $table->unsignedInteger('current_registrations')->default(0);
            $table->string('deadline')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->foreign('tournament_id')->references('id')->on('tournaments')->cascadeOnDelete();
        });

        Schema::create('venues', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->index();
            $table->string('name');
            $table->text('address')->nullable();
            $table->string('village')->default('');
            $table->string('panchayat')->default('');
            $table->string('district')->default('');
            $table->text('google_maps_url')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::create('teams', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('name');
            $table->string('short_name', 32)->default('');
            $table->text('logo')->nullable();
            $table->string('village')->default('');
            $table->string('panchayat')->default('');
            $table->string('district')->default('');
            $table->string('jersey_color', 32)->default('');
            $table->string('secondary_jersey_color', 32)->nullable();
            $table->string('captain_name')->default('');
            $table->string('manager_name')->default('');
            $table->string('manager_phone')->default('');
            $table->string('manager_whatsapp')->default('');
            $table->string('manager_email')->default('');
            $table->text('manager_address')->nullable();
            $table->string('status', 32)->default('pending')->index();
            $table->text('approval_notes')->nullable();
            $table->string('group_name', 64)->nullable();
            $table->timestamps();

            $table->foreign('tournament_id')->references('id')->on('tournaments')->cascadeOnDelete();
        });

        Schema::create('players', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('team_id')->index();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('full_name');
            $table->text('photo')->nullable();
            $table->unsignedInteger('age')->nullable();
            $table->string('dob')->nullable();
            $table->string('mobile')->nullable();
            $table->unsignedInteger('jersey_number')->default(0);
            $table->boolean('is_captain')->default(false);
            $table->boolean('is_wicketkeeper')->default(false);
            $table->string('football_position', 64)->nullable();
            $table->string('cricket_role', 64)->nullable();
            $table->string('cricket_bowling_style', 64)->nullable();
            $table->string('cricket_batting_style', 64)->nullable();
            $table->timestamps();
        });

        Schema::create('registration_payments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('team_id')->index();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->decimal('total_fee', 12, 2)->default(0);
            $table->decimal('paid_amount', 12, 2)->default(0);
            $table->decimal('remaining_amount', 12, 2)->default(0);
            $table->string('payment_option', 16)->default('full');
            $table->string('status', 32)->default('unpaid')->index();
            $table->string('payment_method', 32)->default('online');
            $table->string('transaction_id')->default('');
            $table->string('receipt_number')->default('');
            $table->text('notes')->nullable();
            $table->boolean('recorded_by_admin')->default(false);
            $table->string('recorded_by_user_id')->nullable();
            $table->timestamps();
        });

        Schema::create('registration_receipts', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('payment_id')->index();
            $table->string('team_id')->index();
            $table->string('tournament_id')->index();
            $table->string('organization_id')->index();
            $table->string('receipt_number');
            $table->string('issued_at');
            $table->json('receipt_data');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registration_receipts');
        Schema::dropIfExists('registration_payments');
        Schema::dropIfExists('players');
        Schema::dropIfExists('teams');
        Schema::dropIfExists('venues');
        Schema::dropIfExists('registration_links');
        Schema::dropIfExists('tournaments');
    }
};
