<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Outbound WhatsApp and SMS.
 *
 * The platform collected `manager_phone`, `manager_whatsapp` and player mobiles
 * everywhere and never sent anything to them: a team was approved, fixtures
 * were published, a fee fell due, and nobody was told. This is the log and the
 * settings behind that.
 *
 * Every message is a row first and a send attempt second, so a gateway being
 * down loses nothing and the organizer can see what went out and what failed.
 *
 * `dedupe_key` is what makes the scheduled reminders safe: the sweep runs every
 * few minutes and would otherwise send the same "match at 4pm" over and over.
 * One key per (event, recipient, subject) and the unique index refuses the
 * repeat, so at-least-once scheduling becomes exactly-once delivery.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->nullable()->index();
            $table->string('event', 64)->index();
            $table->string('channel', 16);

            // Who it went to, denormalised: a team can be deleted and its
            // manager renamed, and the log still has to say who was told what.
            $table->string('recipient_name')->default('');
            $table->string('recipient_role', 32)->default('');
            $table->string('to', 32)->index();

            $table->text('body');

            // queued -> sent | failed, or skipped when the recipient has opted
            // out or has no usable number. Skipped is recorded rather than
            // dropped so "why did they not hear from us" has an answer.
            $table->string('status', 16)->default('queued')->index();
            $table->string('driver', 32)->default('');
            $table->string('provider_reference')->nullable();
            $table->text('error')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);

            // What the message was about, for the log and for grouping.
            $table->string('related_type', 64)->default('');
            $table->string('related_id')->default('');

            $table->string('dedupe_key')->nullable()->unique();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'created_at']);
        });

        // A number that has asked not to be contacted. Checked on every send,
        // for every channel — one refusal covers both WhatsApp and SMS.
        Schema::create('notification_opt_outs', function (Blueprint $table) {
            $table->string('phone', 32)->primary();
            $table->string('organization_id')->nullable()->index();
            $table->string('reason')->default('');
            $table->timestamp('created_at')->nullable();
        });

        Schema::table('organizations', function (Blueprint $table) {
            // Which events this organizer sends, and the name messages are
            // signed with. Empty means the defaults in config/notifications.php.
            $table->json('notification_settings')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn('notification_settings');
        });

        Schema::dropIfExists('notification_opt_outs');
        Schema::dropIfExists('notifications');
    }
};
