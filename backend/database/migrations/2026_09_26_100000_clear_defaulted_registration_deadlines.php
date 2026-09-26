<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The tournament form never sent dates, so every tournament was saved with
 * start, end and registration closing all set to the day it was created —
 * and registration shut at midnight that day, turning teams away. Those
 * deadlines were never chosen by anyone: clear them (no deadline) so the
 * organizer sets a real one from the form, which now asks for it.
 *
 * Only rows where all three dates equal the creation day are touched, so a
 * deadline someone actually picked is left alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('tournaments')
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->where('registration_closing', '!=', '')
            ->get(['id', 'start_date', 'end_date', 'registration_closing', 'created_at']);

        foreach ($rows as $row) {
            $created = substr((string) $row->created_at, 0, 10);

            if ($row->registration_closing === $created && $row->start_date === $created && $row->end_date === $created) {
                DB::table('tournaments')->where('id', $row->id)->update(['registration_closing' => '']);
                DB::table('registration_links')->where('tournament_id', $row->id)->where('deadline', $created)->update(['deadline' => null]);
            }
        }
    }

    public function down(): void
    {
        // The cleared dates were defaults, not choices; nothing to put back.
    }
};
