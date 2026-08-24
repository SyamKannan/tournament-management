<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform-level tables: settings, sports, SaaS plans, organizations, users,
 * subscriptions, invoices and the global audit trail.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_settings', function (Blueprint $table) {
            $table->id();
            $table->string('platform_name');
            $table->string('support_email');
            $table->string('support_phone');
            $table->string('currency_symbol', 8);
            $table->boolean('enable_public_signup')->default(true);
            $table->boolean('require_admin_approval_for_orgs')->default(false);
            $table->unsignedInteger('default_trial_days')->default(14);
            $table->unsignedInteger('grace_period_days')->default(7);
            $table->string('payment_gateway_mode', 16)->default('sandbox');
            $table->timestamps();
        });

        Schema::create('sports', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('code', 32)->index();
            $table->string('icon', 16)->default('');
            $table->boolean('is_active')->default(true);
        });

        Schema::create('plans', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 12, 2)->default(0);
            $table->string('currency', 8)->default('₹');
            $table->string('billing_type', 16);
            $table->string('billing_interval', 16)->nullable();
            $table->unsignedInteger('trial_days')->default(0);
            $table->unsignedInteger('tournament_limit')->default(1);
            $table->unsignedInteger('team_limit')->default(16);
            $table->unsignedInteger('player_limit')->default(250);
            $table->unsignedInteger('storage_limit_mb')->default(1024);
            $table->unsignedInteger('ad_limit')->default(5);
            $table->json('features');
            $table->string('status', 16)->default('active')->index();
            $table->timestamps();
        });

        Schema::create('organizations', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('logo')->nullable();
            $table->text('banner')->nullable();
            $table->string('type');
            $table->text('description')->nullable();
            $table->string('contact_person')->default('');
            $table->string('phone')->default('');
            $table->string('whatsapp')->default('');
            $table->string('email')->index();
            $table->text('address')->nullable();
            $table->string('village')->default('');
            $table->string('panchayat')->default('');
            $table->string('municipality')->default('');
            $table->string('district')->default('');
            $table->string('state')->default('');
            $table->string('country')->default('India');
            $table->string('website')->default('');
            $table->json('social_media');
            $table->string('status', 16)->default('pending')->index();
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('email')->index();
            $table->string('password_hash');
            $table->string('phone')->default('');
            $table->string('role', 32)->index();
            $table->text('avatar')->nullable();
            $table->string('organization_id')->nullable()->index();
            $table->timestamps();

            $table->foreign('organization_id')->references('id')->on('organizations')->nullOnDelete();
        });

        Schema::create('subscriptions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->index();
            $table->string('plan_id')->index();
            $table->string('status', 16)->index();
            $table->string('start_date');
            $table->string('end_date');
            $table->string('trial_end_date')->nullable();
            $table->string('next_billing_date')->nullable();
            $table->boolean('auto_renew')->default(false);
            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->string('currency', 8)->default('₹');
            $table->timestamps();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->index();
            $table->string('subscription_id')->index();
            $table->string('invoice_number');
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('currency', 8)->default('₹');
            $table->string('status', 16)->index();
            $table->string('payment_method', 32);
            $table->string('transaction_reference')->default('');
            $table->string('billing_name')->default('');
            $table->string('billing_email')->default('');
            $table->text('billing_address')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->nullable()->index();
            $table->string('user_id')->default('');
            $table->string('user_name')->default('');
            $table->string('user_role', 32)->default('');
            $table->string('action')->index();
            $table->string('entity_type', 64)->default('');
            $table->string('entity_id')->default('');
            $table->text('details')->nullable();
            $table->string('ip_address', 64)->nullable();
            $table->timestamp('created_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('users');
        Schema::dropIfExists('organizations');
        Schema::dropIfExists('plans');
        Schema::dropIfExists('sports');
        Schema::dropIfExists('platform_settings');
    }
};
