<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Terms & Conditions and Privacy Policy, versioned, and who agreed to what.
 *
 * `legal_documents` rows are never edited after publishing — a change is a new
 * version — so an acceptance always points at the exact text that was agreed
 * to. `requires_reacceptance` marks a version everyone must accept again; one
 * without it (a typo fix) is shown but asks nothing of existing accounts.
 *
 * `legal_acceptances` is append-only (the record). `users.*_version_accepted`
 * copies the latest one so the per-request check is a column read. A team
 * entered through a public registration link has no account, so what its
 * manager agreed to is kept on the team row (`teams.legal_accepted`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('legal_documents', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('type', 16);
            $table->unsignedInteger('version');
            $table->string('title');
            $table->longText('body');
            $table->string('summary_of_changes', 1000)->default('');
            $table->boolean('requires_reacceptance')->default(true);
            $table->string('published_by')->nullable();
            $table->string('published_by_name')->default('');
            $table->timestamp('published_at');
            $table->timestamps();

            $table->unique(['type', 'version']);
        });

        Schema::create('legal_acceptances', function (Blueprint $table) {
            $table->id();
            $table->string('user_id')->index();
            $table->string('document_id');
            $table->string('type', 16);
            $table->unsignedInteger('version');
            $table->string('method', 16);
            $table->string('ip_address', 64)->default('');
            $table->string('user_agent', 512)->default('');
            $table->timestamp('accepted_at');

            $table->index(['type', 'version']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('terms_version_accepted')->nullable();
            $table->unsignedInteger('privacy_version_accepted')->nullable();
        });

        Schema::table('teams', function (Blueprint $table) {
            $table->json('legal_accepted')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('teams', function (Blueprint $table) {
            $table->dropColumn('legal_accepted');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['terms_version_accepted', 'privacy_version_accepted']);
        });

        Schema::dropIfExists('legal_acceptances');
        Schema::dropIfExists('legal_documents');
    }
};
