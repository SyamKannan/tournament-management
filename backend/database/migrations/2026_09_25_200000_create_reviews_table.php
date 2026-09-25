<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reviews of the platform shown on the landing page. Organizers write one per
 * club; the super admin can add more. `visibility` is `auto` (public when the
 * rating reaches the admin's minimum), `shown` or `hidden` (admin overrides).
 * `platform_settings.reviews` holds the section's switches; null = defaults.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->nullable()->unique();
            $table->string('user_id')->nullable();
            $table->string('author_name');
            $table->string('author_title')->default('');
            $table->unsignedTinyInteger('rating');
            $table->text('body');
            $table->string('visibility', 8)->default('auto')->index();
            $table->boolean('is_featured')->default(false);
            $table->string('source', 16)->default('organizer');
            $table->string('moderated_by')->nullable();
            $table->timestamp('moderated_at')->nullable();
            $table->timestamps();

            $table->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
        });

        Schema::table('platform_settings', function (Blueprint $table) {
            $table->json('reviews')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('platform_settings', function (Blueprint $table) {
            $table->dropColumn('reviews');
        });

        Schema::dropIfExists('reviews');
    }
};
