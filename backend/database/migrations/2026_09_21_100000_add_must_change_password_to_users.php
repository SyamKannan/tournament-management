<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks an account whose password was set by somebody else.
 *
 * Onboarding and admin-issued resets both hand over a password the owner did
 * not choose. Until they choose their own, that credential is shared knowledge
 * — this flag is what makes the app insist on a change at next sign-in instead
 * of leaving it in place indefinitely.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('must_change_password')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('must_change_password');
        });
    }
};
