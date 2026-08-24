<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a team manager account to the team they run.
 *
 * Without this the platform has no way to answer "which team is this manager
 * bidding for", which is what an auction has to know before it can accept a bid
 * — previously any signed-in user could bid on behalf of any team.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('teams', function (Blueprint $table) {
            $table->string('manager_user_id')->nullable()->after('manager_name')->index();
        });
    }

    public function down(): void
    {
        Schema::table('teams', function (Blueprint $table) {
            $table->dropIndex(['manager_user_id']);
            $table->dropColumn('manager_user_id');
        });
    }
};
