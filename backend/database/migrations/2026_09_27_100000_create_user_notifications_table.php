<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * In-app notifications: the bell.
 *
 * WhatsApp and SMS hide themselves until a gateway is configured, and until
 * then an organizer never heard that a team registered and a manager never
 * heard they were approved. This is the feed a signed-in account reads instead
 * — written by the same dispatch, so every event that texts someone also
 * lands here for whoever of them has an account.
 *
 * Not `notifications`: that is the outbound message log (and the table
 * Laravel's own notifications would expect).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_notifications', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('user_id');
            $table->string('organization_id')->nullable()->index();
            $table->string('event', 64);
            $table->string('title');
            $table->text('body');
            // A client route, never an absolute URL.
            $table->string('link')->default('');
            $table->string('related_type', 64)->default('');
            $table->string('related_id')->default('');
            $table->timestamp('read_at')->nullable();
            // Same role as on the message log: a scheduled sweep running twice
            // must not ring the bell twice.
            $table->string('dedupe_key')->nullable()->unique();
            $table->timestamps();

            $table->index(['user_id', 'read_at', 'created_at']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_notifications');
    }
};
