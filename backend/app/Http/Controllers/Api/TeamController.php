<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Player;
use App\Models\RegistrationLink;
use App\Models\RegistrationPayment;
use App\Models\RegistrationReceipt;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\TournamentPaymentService;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TeamController extends Controller
{
    public function __construct(private readonly TournamentPaymentService $payments) {}

    /* ------------------------------------------- Public registration wizard */

    /**
     * Everything the public registration page needs, resolved from the shared
     * link token: the tournament, the organizer, the fee breakdown and whether
     * there is still room.
     */
    public function registrationPage(string $token): JsonResponse
    {
        $link = RegistrationLink::query()->where('token', $token)->first();

        if (! $link) {
            return response()->json(['error' => 'Invalid or expired registration link'], 404);
        }

        $tournament = Tournament::find($link->tournament_id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        $currentTeams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', '!=', 'withdrawn')
            ->count();

        return response()->json([
            'link' => $link,
            'tournament' => $tournament,
            'organization' => Organization::find($tournament->organization_id),
            'payment_options' => $this->payments->paymentOptions($tournament),
            'current_teams_count' => $currentTeams,
            'is_full' => $currentTeams >= $tournament->max_teams,
        ]);
    }

    /**
     * Accept a public team entry: squad validation, roster creation, ground-fee
     * payment and receipt, all in one transaction.
     */
    public function register(Request $request, string $token): JsonResponse
    {
        $link = RegistrationLink::query()->where('token', $token)->where('status', 'active')->first();

        if (! $link) {
            return response()->json(['error' => 'Registration link is inactive or invalid'], 400);
        }

        $tournament = Tournament::find($link->tournament_id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        $currentTeams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', '!=', 'withdrawn')
            ->count();

        if ($currentTeams >= $tournament->max_teams) {
            return response()->json([
                'error' => "Tournament registration is full (Max {$tournament->max_teams} teams)",
            ], 400);
        }

        $data = $request->validate([
            'team_name' => ['required', 'string', 'max:255'],
            'manager_name' => ['required', 'string', 'max:255'],
            'manager_phone' => ['required', 'string', 'max:64'],
            'short_name' => ['nullable', 'string', 'max:32'],
            'logo' => ['nullable', 'string'],
            'village' => ['nullable', 'string', 'max:255'],
            'panchayat' => ['nullable', 'string', 'max:255'],
            'district' => ['nullable', 'string', 'max:255'],
            'jersey_color' => ['nullable', 'string', 'max:32'],
            'secondary_jersey_color' => ['nullable', 'string', 'max:32'],
            'captain_name' => ['nullable', 'string', 'max:255'],
            'manager_whatsapp' => ['nullable', 'string', 'max:64'],
            'manager_email' => ['nullable', 'string', 'max:255'],
            'manager_address' => ['nullable', 'string'],
            'players' => ['present', 'array'],
            'players.*.full_name' => ['required', 'string', 'max:255'],
            'players.*.jersey_number' => ['nullable', 'integer'],
            'payment_option' => ['nullable', 'string', 'in:full,partial'],
            'payment_method' => ['nullable', 'string', 'in:online,cash,upi,bank_transfer,other'],
            'transaction_id' => ['nullable', 'string', 'max:255'],
        ], [
            'team_name.required' => 'Team name, manager name, and manager mobile number are required',
            'manager_name.required' => 'Team name, manager name, and manager mobile number are required',
            'manager_phone.required' => 'Team name, manager name, and manager mobile number are required',
        ]);

        $players = $data['players'];
        $settings = $tournament->settings ?? [];
        $football = $tournament->sport_code === 'football';
        $minPlayers = (int) ($settings['squad_min_players'] ?: ($football ? 7 : 11));
        $maxPlayers = (int) ($settings['squad_max_players'] ?: ($football ? 14 : 16));

        if (count($players) < $minPlayers) {
            return response()->json([
                'error' => sprintf('Minimum %d players are required. You entered %d.', $minPlayers, count($players)),
            ], 400);
        }

        if (count($players) > $maxPlayers) {
            return response()->json([
                'error' => sprintf('Maximum %d players allowed. You entered %d.', $maxPlayers, count($players)),
            ], 400);
        }

        $jerseyNumbers = array_filter(array_map(fn ($player) => (int) ($player['jersey_number'] ?? 0), $players));

        if (count(array_unique($jerseyNumbers)) !== count($jerseyNumbers)) {
            return response()->json([
                'error' => 'Duplicate jersey numbers detected in the team roster. Every player must have a unique number.',
            ], 400);
        }

        $paymentOption = $data['payment_option'] ?? 'full';

        $result = DB::transaction(function () use ($data, $players, $tournament, $link, $paymentOption, $request) {
            $team = Team::create([
                'id' => Ids::timestamped('team'),
                'tournament_id' => $tournament->id,
                'organization_id' => $tournament->organization_id,
                'name' => $data['team_name'],
                'short_name' => $data['short_name'] ?? mb_strtoupper(mb_substr($data['team_name'], 0, 4)),
                'logo' => $data['logo'] ?? 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80',
                'village' => $data['village'] ?? '',
                'panchayat' => $data['panchayat'] ?? '',
                'district' => $data['district'] ?? '',
                'jersey_color' => $data['jersey_color'] ?? '#3B82F6',
                'secondary_jersey_color' => $data['secondary_jersey_color'] ?? null,
                'captain_name' => $data['captain_name'] ?? ($players[0]['full_name'] ?? $data['manager_name']),
                'manager_name' => $data['manager_name'],
                'manager_phone' => $data['manager_phone'],
                'manager_whatsapp' => $data['manager_whatsapp'] ?? $data['manager_phone'],
                'manager_email' => $data['manager_email'] ?? '',
                'manager_address' => $data['manager_address'] ?? '',
                'status' => 'pending',
                'group_name' => 'Group A',
            ]);

            foreach (array_values($players) as $index => $player) {
                Player::create([
                    'id' => Ids::unique('pl'),
                    'team_id' => $team->id,
                    'tournament_id' => $tournament->id,
                    'organization_id' => $tournament->organization_id,
                    'full_name' => $player['full_name'],
                    'photo' => $player['photo'] ?? null,
                    'age' => isset($player['age']) ? (int) $player['age'] : null,
                    'dob' => $player['dob'] ?? null,
                    'mobile' => $player['mobile'] ?? null,
                    'jersey_number' => (int) ($player['jersey_number'] ?? 0) ?: $index + 1,
                    'is_captain' => (bool) ($player['is_captain'] ?? $index === 0),
                    'is_wicketkeeper' => (bool) ($player['is_wicketkeeper'] ?? false),
                    'football_position' => $player['football_position'] ?? null,
                    'cricket_role' => $player['cricket_role'] ?? null,
                    'cricket_bowling_style' => $player['cricket_bowling_style'] ?? null,
                    'cricket_batting_style' => $player['cricket_batting_style'] ?? null,
                ]);
            }

            $payment = $this->payments->processPayment([
                'teamId' => $team->id,
                'tournamentId' => $tournament->id,
                'organizationId' => $tournament->organization_id,
                'paymentOption' => $paymentOption,
                'paymentMethod' => $data['payment_method'] ?? 'online',
                'transactionId' => $data['transaction_id'] ?? 'ONLINE_TXN_'.strtoupper(Ids::token(7)),
                'notes' => sprintf('Public registration ground fee payment (%s)', strtoupper($paymentOption)),
            ]);

            $link->increment('current_registrations');

            Audit::log([
                'organization_id' => $tournament->organization_id,
                'user_id' => $team->id,
                'user_name' => $data['manager_name'],
                'user_role' => 'TEAM_MANAGER',
                'action' => 'REGISTERED_TEAM_PUBLIC',
                'entity_type' => 'Team',
                'entity_id' => $team->id,
                'details' => sprintf(
                    'Team [%s] registered for tournament [%s]. Ground Fee Paid: ₹%s',
                    $team->name,
                    $tournament->name,
                    $payment['payment']->paid_amount
                ),
                'ip_address' => $request->ip(),
            ]);

            return ['team' => $team, ...$payment];
        });

        return response()->json([
            'team' => $result['team'],
            'payment' => $result['payment'],
            'receipt' => $result['receipt'],
            'message' => 'Team registered successfully! Download or print your official registration receipt.',
        ], 201);
    }

    /* ------------------------------------------------- Organizer management */

    public function forTournament(Request $request, string $tournamentId): JsonResponse
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $teams = Team::query()->where('tournament_id', $tournamentId)->get();
        $teamIds = $teams->pluck('id');

        $players = Player::query()->whereIn('team_id', $teamIds)->get()->groupBy('team_id');
        $payments = RegistrationPayment::query()
            ->whereIn('team_id', $teamIds)
            ->where('tournament_id', $tournamentId)
            ->get()
            ->keyBy('team_id');
        $receipts = RegistrationReceipt::query()
            ->whereIn('team_id', $teamIds)
            ->where('tournament_id', $tournamentId)
            ->get()
            ->keyBy('team_id');

        return response()->json($teams->map(function (Team $team) use ($players, $payments, $receipts) {
            $roster = $players->get($team->id) ?? collect();

            return [
                ...$team->toArray(),
                'players_count' => $roster->count(),
                'players' => $roster->values(),
                'payment' => $payments->get($team->id),
                'receipt' => $receipts->get($team->id),
            ];
        }));
    }

    public function show(string $id): JsonResponse
    {
        $team = Team::find($id);

        if (! $team) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        return response()->json([
            'team' => $team,
            'players' => Player::query()->where('team_id', $team->id)->get(),
            'payment' => RegistrationPayment::query()->where('team_id', $team->id)->first(),
            'receipt' => RegistrationReceipt::query()->where('team_id', $team->id)->first(),
            'tournament' => Tournament::find($team->tournament_id),
        ]);
    }

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $team = Team::find($id);

        if (! $team) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $team->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:pending,changes_required,approved,rejected,suspended,withdrawn'],
            'approval_notes' => ['sometimes', 'nullable', 'string'],
            'group_name' => ['sometimes', 'nullable', 'string', 'max:64'],
        ]);

        $team->fill($data)->save();

        $user = $request->user();
        Audit::log([
            'organization_id' => $team->organization_id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'user_role' => $user->role,
            'action' => 'UPDATED_TEAM_STATUS',
            'entity_type' => 'Team',
            'entity_id' => $team->id,
            'details' => sprintf('Changed team [%s] status to [%s]', $team->name, $team->status),
            'ip_address' => $request->ip(),
        ]);

        return response()->json($team);
    }

    /**
     * Record a ground-fee instalment collected offline (cash/UPI) or confirm an
     * online one.
     */
    public function recordPayment(Request $request, string $id): JsonResponse
    {
        $team = Team::find($id);

        if (! $team) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $team->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'payment_method' => ['nullable', 'string', 'in:online,cash,upi,bank_transfer,other'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'transaction_id' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'payment_option' => ['nullable', 'string', 'in:full,partial'],
        ]);

        try {
            return response()->json($this->payments->processPayment([
                'teamId' => $team->id,
                'tournamentId' => $team->tournament_id,
                'organizationId' => $team->organization_id,
                'paymentOption' => $data['payment_option'] ?? 'full',
                'paymentMethod' => $data['payment_method'] ?? 'cash',
                'customAmount' => isset($data['amount']) ? (float) $data['amount'] : null,
                'transactionId' => $data['transaction_id'] ?? null,
                'notes' => $data['notes'] ?? 'Recorded by tournament administrator',
                'recordedByAdmin' => true,
                'adminUserId' => $request->user()->id,
            ]));
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    public function receipt(string $id): JsonResponse
    {
        $receipt = RegistrationReceipt::query()->where('team_id', $id)->first();

        if (! $receipt) {
            return response()->json(['error' => 'Receipt not found'], 404);
        }

        return response()->json($receipt);
    }

    public function addPlayer(Request $request, string $id): JsonResponse
    {
        $team = Team::find($id);

        if (! $team) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $team->organization_id)) {
            return $denied;
        }

        try {
            $data = $request->validate([
                'full_name' => ['required', 'string', 'max:255'],
                'jersey_number' => ['required', 'integer'],
                'football_position' => ['nullable', 'string', 'max:64'],
                'cricket_role' => ['nullable', 'string', 'max:64'],
                'cricket_bowling_style' => ['nullable', 'string', 'max:64'],
                'cricket_batting_style' => ['nullable', 'string', 'max:64'],
                'age' => ['nullable', 'integer'],
                'mobile' => ['nullable', 'string', 'max:64'],
                'is_captain' => ['nullable', 'boolean'],
                'is_wicketkeeper' => ['nullable', 'boolean'],
            ]);
        } catch (ValidationException) {
            return response()->json(['error' => 'Player name and jersey number are required'], 400);
        }

        $player = Player::create([
            'id' => Ids::unique('pl'),
            'team_id' => $team->id,
            'tournament_id' => $team->tournament_id,
            'organization_id' => $team->organization_id,
            'full_name' => $data['full_name'],
            'jersey_number' => (int) $data['jersey_number'],
            'football_position' => $data['football_position'] ?? null,
            'cricket_role' => $data['cricket_role'] ?? null,
            'cricket_bowling_style' => $data['cricket_bowling_style'] ?? null,
            'cricket_batting_style' => $data['cricket_batting_style'] ?? null,
            'age' => isset($data['age']) ? (int) $data['age'] : null,
            'mobile' => $data['mobile'] ?? null,
            'is_captain' => (bool) ($data['is_captain'] ?? false),
            'is_wicketkeeper' => (bool) ($data['is_wicketkeeper'] ?? false),
        ]);

        return response()->json($player, 201);
    }
}
