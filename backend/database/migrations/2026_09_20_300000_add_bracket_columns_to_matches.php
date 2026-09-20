<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Turns the fixture list into a real bracket.
 *
 * Before this, a "knockout" was one flat list of first-round pairings in team
 * order: no seeding, no byes, and no later rounds at all — a semi-final winner
 * never produced a final, because the final was never created. A tournament
 * could not show anyone what it was working towards.
 *
 * Now every round exists from the moment the schedule is generated, later ones
 * holding empty team ids until they are known, and each match records where its
 * winner goes. `advance_from` is the other direction — where each side of a
 * match comes from — which is what lets the display say "Winner of QF2" or
 * "Group A runner-up" before there is a team to name, and what lets the
 * progression be recomputed from scratch rather than tracked.
 *
 * Recomputed, not tracked, because scoring can be undone: a goal removed from a
 * decided semi-final has to pull the wrong team back out of the final.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            // Which round of the knockout, counting from the first one played,
            // and which slot within it. Null for a league or group fixture.
            $table->unsignedInteger('bracket_round')->nullable()->index();
            $table->unsignedInteger('bracket_position')->nullable();

            // Where this match's winner goes next, and into which side of it.
            // Null on the final, which feeds nothing.
            $table->string('feeds_match_id')->nullable()->index();
            $table->string('feeds_slot', 1)->nullable();

            // Where each side comes from, as {"a": {...}, "b": {...}}. Each is
            // one of a direct entry, the winner of a named match, or a position
            // in a named group's table. JSON because it is read as a whole and
            // never queried across.
            $table->json('advance_from')->nullable();

            // The group a group-stage fixture belongs to. Teams already carry
            // their own group; this saves joining through them to lay out a
            // schedule, and keeps a fixture's group stable if a team moves.
            $table->string('group_name', 64)->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn([
                'bracket_round',
                'bracket_position',
                'feeds_match_id',
                'feeds_slot',
                'advance_from',
                'group_name',
            ]);
        });
    }
};
