<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Player;
use App\Models\RegistrationPayment;
use App\Models\Team;
use App\Models\Tournament;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Organizer reports: ground-fee collection and squad rosters.
 */
class ReportController extends Controller
{
    /**
     * Ground-fee collection: expected against collected, per team and in total.
     */
    public function financials(Request $request, string $tournamentId): JsonResponse
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $payments = RegistrationPayment::query()
            ->where('tournament_id', $tournament->id)
            ->get()
            ->keyBy('team_id');

        // Teams still in, plus any rejected or withdrawn side that paid
        // something — that money is held (or owed back) all the same. A team
        // turned away before paying owes nothing and isn't expected to.
        $teams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where(fn ($q) => $q->holdingPlace()->orWhereIn('id', $payments->filter(fn ($p) => (float) $p->paid_amount > 0)->keys()))
            ->get();

        $totalExpected = 0.0;
        $totalCollected = 0.0;
        $totalPending = 0.0;

        $records = $teams->map(function (Team $team) use ($payments, $tournament, &$totalExpected, &$totalCollected, &$totalPending) {
            $payment = $payments->get($team->id);
            $paid = (float) ($payment->paid_amount ?? 0);
            // What this team was charged: the fee on its payment row, fixed when
            // it registered — not whatever the tournament's fee is today. A team
            // no longer in owes only what it has already handed over.
            $expectedPerTeam = in_array($team->status, Team::HOLDS_PLACE, true)
                ? (float) ($payment->total_fee ?? $tournament->ground_fee ?? 0)
                : $paid;
            $pending = max(0, $expectedPerTeam - $paid);

            $totalExpected += $expectedPerTeam;
            $totalCollected += $paid;
            $totalPending += $pending;

            return [
                'team_id' => $team->id,
                'team_name' => $team->name,
                'manager_name' => $team->manager_name,
                'manager_phone' => $team->manager_phone,
                'total_fee' => $expectedPerTeam,
                'paid_amount' => $paid,
                'remaining_amount' => $pending,
                'status' => $payment->status ?? 'unpaid',
                'payment_method' => $payment->payment_method ?? 'N/A',
                'transaction_id' => $payment->transaction_id ?? 'N/A',
                'receipt_number' => $payment->receipt_number ?? 'N/A',
            ];
        });

        return response()->json([
            'tournament' => [
                'id' => $tournament->id,
                'name' => $tournament->name,
                'ground_fee' => $tournament->ground_fee,
                'sport' => $tournament->sport_code,
            ],
            'summary' => [
                'total_teams' => $teams->count(),
                'total_expected' => $totalExpected,
                'total_collected' => $totalCollected,
                'total_pending' => $totalPending,
                'collection_percentage' => $totalExpected > 0
                    ? (int) round(($totalCollected / $totalExpected) * 100)
                    : 0,
            ],
            'records' => $records,
        ]);
    }

    /**
     * Printable squad list for every team in a tournament.
     */
    public function teamsRoster(Request $request, string $tournamentId): JsonResponse
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $teams = Team::query()->where('tournament_id', $tournament->id)->get();
        $players = Player::query()->whereIn('team_id', $teams->pluck('id'))->get()->groupBy('team_id');

        return response()->json([
            'tournament_name' => $tournament->name,
            'teams' => $teams->map(fn (Team $team) => [
                'team' => [
                    'id' => $team->id,
                    'name' => $team->name,
                    'short_name' => $team->short_name,
                    'village' => $team->village,
                    'captain' => $team->captain_name,
                    'manager' => $team->manager_name,
                    'phone' => $team->manager_phone,
                    'status' => $team->status,
                ],
                'players' => ($players->get($team->id) ?? collect())->map(fn (Player $player) => [
                    'name' => $player->full_name,
                    'jersey' => $player->jersey_number,
                    'position' => $player->football_position ?: ($player->cricket_role ?: 'Player'),
                    'style' => $player->cricket_bowling_style ?: ($player->cricket_batting_style ?: ''),
                    'captain' => $player->is_captain ? 'Captain' : '',
                ])->values(),
            ])->values(),
        ]);
    }
}
