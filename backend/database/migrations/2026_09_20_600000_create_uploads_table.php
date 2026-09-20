<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What each organizer is actually storing.
 *
 * `plans.storage_limit_mb` has been sold from the start and never measured:
 * files went to `public/uploads` and nothing counted them, so the quota on the
 * pricing page meant nothing and an organizer could never be told they were
 * near it.
 *
 * `organization_id` is nullable on purpose. Uploading is public — a team
 * registering, a player signing up for an auction and an auction entrant all
 * send a photo before anyone has an account — and an upload with no caller
 * cannot be charged to anybody. Those rows are still recorded, so the files on
 * disk are all accounted for even when the quota does not apply to them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('uploads', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('organization_id')->nullable()->index();
            $table->string('uploaded_by')->nullable();
            $table->string('folder', 64)->default('');
            $table->string('filename');
            $table->unsignedBigInteger('bytes')->default(0);
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uploads');
    }
};
