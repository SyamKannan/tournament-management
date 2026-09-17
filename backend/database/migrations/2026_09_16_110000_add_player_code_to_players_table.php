<?php

use App\Services\PlayerIdentity;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Player Code (`SP-7K4Q2`) a player types into "Player Stats" to reach
 * their own record without logging in. Not unique: every squad entry of the
 * same person shares one code (see PlayerIdentity). Existing players are given
 * theirs here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('players', function (Blueprint $table) {
            $table->string('player_code', 16)->nullable()->index()->after('id');
        });

        app(PlayerIdentity::class)->backfillCodes();
    }

    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            $table->dropIndex(['player_code']);
            $table->dropColumn('player_code');
        });
    }
};
