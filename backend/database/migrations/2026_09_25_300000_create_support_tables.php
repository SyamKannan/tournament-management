<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Support tickets between a club and the platform's super admin, plus the
 * public "can't sign in" form. `number` backs the reference people quote
 * (KW-1001). `unread_by_user` / `unread_by_admin` drive the badges without a
 * per-message read receipt.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_tickets', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->unsignedInteger('number')->unique();
            $table->string('organization_id')->nullable()->index();
            $table->string('created_by')->nullable();
            $table->string('contact_name')->default('');
            $table->string('contact_phone')->default('');
            $table->string('contact_email')->default('');
            $table->string('category', 24);
            $table->string('priority', 8)->default('normal');
            $table->string('status', 16)->default('open')->index();
            $table->string('subject');
            $table->json('context')->nullable();
            $table->string('assigned_to')->nullable();
            $table->boolean('unread_by_user')->default(false);
            $table->boolean('unread_by_admin')->default(true);
            $table->timestamp('last_message_at')->nullable()->index();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::create('support_messages', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('ticket_id')->index();
            $table->string('author_id')->nullable();
            $table->string('author_name')->default('');
            $table->string('author_side', 8);
            $table->text('body');
            $table->boolean('is_internal')->default(false);
            $table->json('attachments')->nullable();
            $table->timestamps();

            $table->foreign('ticket_id')->references('id')->on('support_tickets')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_messages');
        Schema::dropIfExists('support_tickets');
    }
};
