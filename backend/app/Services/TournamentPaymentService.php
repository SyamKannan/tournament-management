<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\RegistrationPayment;
use App\Models\RegistrationReceipt;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Support\Facades\DB;

/**
 * Tournament ground-fee collection: what a team owes, what it has paid, and the
 * receipt issued for each instalment.
 *
 * Separate from BillingService, which handles the organizer's own platform
 * subscription. This is money teams pay organizers to enter a tournament.
 */
class TournamentPaymentService
{
    /**
     * Break the ground fee into the options shown on the registration wizard:
     * a team pays it in full, or — when the organizer allows it — half now and
     * half later. (Older tournaments may still carry a custom percentage or
     * fixed amount in `payment_config`; it no longer applies.)
     *
     * @return array{totalFee: float|int, allowPartial: bool, partialPercentage: int, partialAmount: float|int, fullAmount: float|int}
     */
    public function paymentOptions(Tournament $tournament): array
    {
        $totalFee = (float) ($tournament->ground_fee ?? 0);
        $config = $tournament->payment_config ?? [];
        $allowPartial = (bool) ($config['allow_partial'] ?? false);

        $partialPercentage = $allowPartial ? 50 : 100;
        $partialAmount = $allowPartial ? round($totalFee / 2, 2) : $totalFee;

        return [
            'totalFee' => $this->money($totalFee),
            'allowPartial' => $allowPartial,
            'partialPercentage' => $partialPercentage,
            'partialAmount' => $this->money($partialAmount),
            'fullAmount' => $this->money($totalFee),
        ];
    }

    /**
     * Record a payment against a team's registration and issue a receipt.
     *
     * Repeat calls accumulate onto the existing payment record, which is how a
     * team that paid a deposit online later settles the balance in cash.
     *
     * @param  array{teamId: string, tournamentId: string, organizationId: string, paymentOption?: string, paymentMethod?: string, customAmount?: float|null, transactionId?: string|null, notes?: string|null, recordedByAdmin?: bool, adminUserId?: string|null, rejectOverpayment?: bool}  $params
     * @return array{payment: RegistrationPayment, receipt: RegistrationReceipt}
     *
     * @throws \RuntimeException when the tournament, team or organization is missing
     * @throws \DomainException when `rejectOverpayment` is set and the amount exceeds what is owed
     */
    public function processPayment(array $params): array
    {
        $tournament = Tournament::find($params['tournamentId']);
        $team = Team::find($params['teamId']);
        $organization = Organization::find($params['organizationId']);

        if (! $tournament || ! $team || ! $organization) {
            throw new \RuntimeException('Tournament, Team or Organization not found');
        }

        return DB::transaction(function () use ($params, $tournament, $team, $organization) {
            $options = $this->paymentOptions($tournament);
            $paymentOption = ($params['paymentOption'] ?? 'full') === 'partial' ? 'partial' : 'full';
            $paymentMethod = $params['paymentMethod'] ?? 'online';
            $customAmount = $params['customAmount'] ?? null;

            $amountToPay = match (true) {
                // An explicit amount (including 0, e.g. "pay at ground" — nothing
                // collected now) always wins over the option-derived default.
                $customAmount !== null => (float) $customAmount,
                $paymentOption === 'partial' => (float) ($options['partialAmount'] ?: $options['totalFee']),
                default => (float) $options['fullAmount'],
            };

            $payment = RegistrationPayment::query()
                ->where('team_id', $team->id)
                ->where('tournament_id', $tournament->id)
                // Two instalments recorded at once (a double tap, two organizers)
                // must add up, not both start from the same paid_amount.
                ->lockForUpdate()
                ->first();

            // Cash counted at the ground can't exceed what the team owes: a
            // repeated "Confirm" would otherwise book the fee twice and every
            // collection report would overstate what the club holds. Money a
            // gateway already captured is never refused, so this is opt-in.
            if ($params['rejectOverpayment'] ?? false) {
                $owed = $payment ? (float) $payment->remaining_amount : (float) $options['totalFee'];

                // No amount given means "settle up": take what is still owed.
                if ($customAmount === null) {
                    $amountToPay = min($amountToPay, $owed);
                }

                if ($amountToPay > $owed + 0.005) {
                    throw new \DomainException($owed <= 0
                        ? "{$team->name} has already paid the full ground fee."
                        : sprintf('%s owes only ₹%s. Enter that amount or less.', $team->name, $this->money($owed)));
                }
            }

            if ($payment) {
                $paidAmount = (float) $payment->paid_amount + $amountToPay;
                $remaining = max(0, (float) $payment->total_fee - $paidAmount);

                $payment->fill([
                    'paid_amount' => $paidAmount,
                    'remaining_amount' => $remaining,
                    'status' => $remaining == 0 ? 'fully_paid' : 'partially_paid',
                    'payment_method' => $paymentMethod,
                    'transaction_id' => ($params['transactionId'] ?? null) ?: ($payment->transaction_id ?: 'TXN-'.strtoupper(Ids::token(7))),
                    'notes' => $params['notes'] ?? $payment->notes,
                ]);

                if ($params['recordedByAdmin'] ?? false) {
                    $payment->recorded_by_admin = true;
                    $payment->recorded_by_user_id = $params['adminUserId'] ?? null;
                }

                $payment->save();
            } else {
                $totalFee = (float) $options['totalFee'];
                $remaining = max(0, $totalFee - $amountToPay);

                $payment = RegistrationPayment::create([
                    'id' => Ids::unique('pay'),
                    'team_id' => $team->id,
                    'tournament_id' => $tournament->id,
                    'organization_id' => $organization->id,
                    'total_fee' => $totalFee,
                    'paid_amount' => $amountToPay,
                    'remaining_amount' => $remaining,
                    'payment_option' => $paymentOption,
                    'status' => match (true) {
                        $remaining == 0 => 'fully_paid',
                        $amountToPay > 0 => 'partially_paid',
                        default => 'unpaid',
                    },
                    'payment_method' => $paymentMethod,
                    'transaction_id' => ($params['transactionId'] ?? null) ?: 'TXN-'.strtoupper(Ids::token(7)),
                    'receipt_number' => 'REC-'.$team->short_name.'-'.random_int(1000, 9999),
                    'notes' => $params['notes'] ?? null,
                    'recorded_by_admin' => (bool) ($params['recordedByAdmin'] ?? false),
                    'recorded_by_user_id' => $params['adminUserId'] ?? null,
                ]);
            }

            $receipt = RegistrationReceipt::create([
                'id' => Ids::unique('rec'),
                'payment_id' => $payment->id,
                'team_id' => $team->id,
                'tournament_id' => $tournament->id,
                'organization_id' => $organization->id,
                'receipt_number' => $payment->receipt_number,
                'issued_at' => Ids::now(),
                'receipt_data' => [
                    'tournament_name' => $tournament->name,
                    'organization_name' => $organization->name,
                    'team_name' => $team->name,
                    'manager_name' => $team->manager_name,
                    'manager_phone' => $team->manager_phone,
                    'total_fee' => $this->money((float) $payment->total_fee),
                    'paid_amount' => $this->money((float) $payment->paid_amount),
                    'amount_paid_now' => $this->money($amountToPay),
                    'remaining_balance' => $this->money((float) $payment->remaining_amount),
                    'payment_method' => strtoupper(str_replace('_', ' ', (string) $paymentMethod)),
                    'transaction_id' => $payment->transaction_id,
                    'status' => $payment->status,
                    'qr_code_signature' => sprintf(
                        'AUTH-SIG-%s-%s-%s',
                        $team->id,
                        $payment->receipt_number,
                        strtoupper(base_convert((string) Ids::millis(), 10, 36))
                    ),
                ],
            ]);

            Audit::log([
                'organization_id' => $organization->id,
                'user_id' => $params['adminUserId'] ?? $team->id,
                'user_name' => ($params['recordedByAdmin'] ?? false) ? 'Admin / Organizer' : $team->manager_name,
                'user_role' => ($params['recordedByAdmin'] ?? false) ? 'ORG_ADMIN' : 'TEAM_MANAGER',
                'action' => 'RECORDED_TOURNAMENT_GROUND_FEE',
                'entity_type' => 'RegistrationPayment',
                'entity_id' => $payment->id,
                'details' => sprintf(
                    'Payment of ₹%s recorded for team [%s]. Status: %s, Remaining: ₹%s',
                    $this->money($amountToPay),
                    $team->name,
                    $payment->status,
                    $this->money((float) $payment->remaining_amount)
                ),
            ]);

            return ['payment' => $payment->fresh(), 'receipt' => $receipt];
        });
    }

    private function money(float $amount): int|float
    {
        return fmod($amount, 1.0) === 0.0 ? (int) $amount : round($amount, 2);
    }
}
