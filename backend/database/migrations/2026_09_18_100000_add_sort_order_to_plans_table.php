<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The order plans are listed in on the landing page, the organization billing
 * page and the plan picker, set by the super admin dragging plan cards.
 * Existing plans start out in price order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('sort_order')->default(0)->index();
        });

        foreach (DB::table('plans')->orderBy('price')->orderBy('id')->pluck('id') as $position => $id) {
            DB::table('plans')->where('id', $id)->update(['sort_order' => $position]);
        }
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropIndex(['sort_order']);
            $table->dropColumn('sort_order');
        });
    }
};
