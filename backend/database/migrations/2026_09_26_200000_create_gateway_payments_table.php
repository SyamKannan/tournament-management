<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every verified gateway payment that has been spent, once.
 *
 * A checkout result stays correctly signed forever, so something has to
 * remember which payment ids have already bought something. That used to be
 * `registration_payments.transaction_id` — but a team's row holds only its
 * latest instalment's id, so paying the balance overwrote the first payment's
 * id and made it spendable again on another registration.
 *
 * `reference_id` is what the payment went to (a team, an organization), so a
 * retried registration can be handed back the entry its payment already made.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gateway_payments', function (Blueprint $table) {
            $table->string('payment_id')->primary();
            $table->string('flow', 32);
            $table->string('purpose', 64)->default('');
            $table->string('reference_id')->default('')->index();
            $table->timestamp('created_at')->nullable();
        });

        // Payments already recorded before this table existed are spent too,
        // or each could be presented once more. What survives of them is the
        // id on each team's payment row and on each plan invoice.
        $now = now();

        DB::table('registration_payments')
            ->whereNotNull('transaction_id')->where('transaction_id', '!=', '')
            ->select(['transaction_id', 'team_id'])
            ->orderBy('id')
            ->chunk(500, function ($rows) use ($now) {
                DB::table('gateway_payments')->insertOrIgnore($rows->map(fn ($row) => [
                    'payment_id' => $row->transaction_id,
                    'flow' => 'registration',
                    'purpose' => 'ground_fee',
                    'reference_id' => (string) $row->team_id,
                    'created_at' => $now,
                ])->all());
            });

        DB::table('invoices')
            ->whereNotNull('transaction_reference')->where('transaction_reference', '!=', '')
            ->select(['transaction_reference', 'organization_id'])
            ->orderBy('id')
            ->chunk(500, function ($rows) use ($now) {
                DB::table('gateway_payments')->insertOrIgnore($rows->map(fn ($row) => [
                    'payment_id' => $row->transaction_reference,
                    'flow' => 'subscription',
                    'purpose' => 'subscription',
                    'reference_id' => (string) $row->organization_id,
                    'created_at' => $now,
                ])->all());
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('gateway_payments');
    }
};
