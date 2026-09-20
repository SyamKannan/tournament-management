<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Getting back into an account.
 *
 * There was no way at all: a team manager or scorer who forgot their password
 * was locked out for good, and the only remedy was an organizer editing the
 * database. These accounts are village volunteers reached on a phone, so the
 * code goes by SMS or WhatsApp rather than email — most have no email on file,
 * and the notification engine already knows how to reach them.
 *
 * The code is stored hashed, for the same reason the password is: a leaked
 * table must not hand over live accounts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_resets', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('user_id')->index();

            // What the person typed to ask for this, normalised. Kept so a
            // request can be rate limited per identity rather than per account,
            // which is what stops someone probing for which accounts exist.
            $table->string('identifier')->index();

            $table->string('code_hash');
            $table->timestamp('expires_at')->index();

            // Wrong guesses. A short numeric code needs a ceiling or it can be
            // walked through in a few hundred requests.
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('used_at')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_resets');
    }
};
