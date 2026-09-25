<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reviews come only from clubs and are only shown or hidden, so the featured
 * flag and the organizer/admin source are gone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->dropColumn(['is_featured', 'source']);
        });
    }

    public function down(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->boolean('is_featured')->default(false);
            $table->string('source', 16)->default('organizer');
        });
    }
};
