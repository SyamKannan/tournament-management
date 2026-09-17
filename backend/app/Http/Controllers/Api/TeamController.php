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
use App\Services\BillingService;
use App\Services\PaymentGatewayService;
use App\Services\TournamentPaymentService;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TeamController extends Controller
{
    public function __construct(
        private readonly TournamentPaymentService $payments,
        private readonly BillingService $billing,
        private readonly PaymentGatewayService $gateway,
    ) {}

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
            // So the page can say why it is closed instead of failing on submit.
            'is_closed' => $this->registrationClosedReason($tournament, $link) !== null,
            'closed_reason' => $this->registrationClosedReason($tournament, $link),
        ]);
    }

    /**
     * Why entries are closed, or null while they are open. The closing date was
     * being collected and shown but never enforced, so teams could enter days
     * after the deadline — and after the draw had been made.
     */
    private function registrationClosedReason(Tournament $tournament, ?RegistrationLink $link): ?string
    {
        if (in_array($tournament->status, ['cancelled', 'completed'], true)) {
            return $tournament->status === 'cancelled'
                ? 'This tournament has been cancelled.'
                : 'This tournament has already finished.';
        }

        $deadline = $link?->deadline ?: $tournament->registration_closing;

        if ($deadline) {
            try {
                // A date with no time means entries close at the end of that day.
                $closesAt = Carbon::parse($deadline);

                if ($closesAt->equalTo($closesAt->copy()->startOfDay())) {
                    $closesAt = $closesAt->endOfDay();
                }

                if ($closesAt->isPast()) {
                    return 'Registration closed on '.$closesAt->format('j M Y').'.';
                }
            } catch (\Exception) {
                // An unparseable date is treated as no deadline at all.
            }
        }

        return null;
    }

    /**
     * Start checkout for the ground fee a team is about to pay, on the
     * registration flow's gateway (demo or Razorpay). The checkout only
     * offers online methods both the platform and this tournament accept.
     */
    public function paymentOrder(Request $request, string $token): JsonResponse
    {
        $link = RegistrationLink::query()->where('token', $token)->where('status', 'active')->first();

        if (! $link) {
            return response()->json(['error' => 'Registration link is inactive or invalid'], 400);
        }

        $tournament = Tournament::find($link->tournament_id);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($closed = $this->registrationClosedReason($tournament, $link)) {
            return response()->json(['error' => $closed], 400);
        }

        $data = $request->validate([
            'payment_option' => ['nullable', 'string', 'in:full,partial'],
            'method' => ['nullable', 'string'],
        ]);

        $options = $this->payments->paymentOptions($tournament);
        $amount = ($data['payment_option'] ?? 'full') === 'partial'
            ? (float) ($options['partialAmount'] ?: $options['totalFee'])
            : (float) $options['fullAmount'];

        if ($amount <= 0) {
            return response()->json(['configured' => false]);
        }

        try {
            $order = $this->gateway->createOrder(
                'registration',
                $amount,
                'INR',
                'reg-'.Ids::token(10),
                ['tournament_id' => $tournament->id, 'purpose' => 'ground_fee'],
                $tournament->payment_config['enabled_methods'] ?? Tournament::PAYMENT_METHODS,
                $data['method'] ?? null,
            );
        } catch (\RuntimeException $e) {
            report($e);

            return response()->json(['error' => str_starts_with($e->getMessage(), 'Unable to create')
                ? 'Unable to start payment. Please try again.'
                : $e->getMessage()], 503);
        }

        return response()->json($order);
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

        if ($closed = $this->registrationClosedReason($tournament, $link)) {
            return response()->json(['error' => $closed], 400);
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
            'payment_method' => ['nullable', 'string', 'in:'.implode(',', [...Tournament::PAYMENT_METHODS, 'online', 'cash', 'bank_transfer', 'other'])],
            'transaction_id' => ['nullable', 'string', 'max:255'],
            'razorpay_payment_id' => ['nullable', 'string', 'max:255'],
            'razorpay_order_id' => ['nullable', 'string', 'max:255'],
            'razorpay_signature' => ['nullable', 'string', 'max:512'],
        ], [
            'team_name.required' => 'Team name, manager name, and manager mobile number are required',
            'manager_name.required' => 'Team name, manager name, and manager mobile number are required',
            'manager_phone.required' => 'Team name, manager name, and manager mobile number are required',
        ]);

        $paymentMethod = $data['payment_method'] ?? 'upi';
        $enabledMethods = $tournament->payment_config['enabled_methods'] ?? Tournament::PAYMENT_METHODS;

        if (in_array($paymentMethod, Tournament::PAYMENT_METHODS, true) && ! in_array($paymentMethod, $enabledMethods, true)) {
            return response()->json([
                'error' => 'This payment method is not accepted for this tournament. Please choose another one.',
            ], 400);
        }

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

        $playerLimit = $this->billing->planLimitFor($tournament->organization_id, 'players');

        if ($playerLimit !== null) {
            $currentPlayers = Player::query()->where('organization_id', $tournament->organization_id)->count();

            if ($currentPlayers + count($players) > $playerLimit) {
                return response()->json([
                    'error' => "This registration would exceed the organizer's player limit ({$currentPlayers}/{$playerLimit}). Please contact the organizer.",
                ], 400);
            }
        }

        $jerseyNumbers = array_filter(array_map(fn ($player) => (int) ($player['jersey_number'] ?? 0), $players));

        if (count(array_unique($jerseyNumbers)) !== count($jerseyNumbers)) {
            return response()->json([
                'error' => 'Duplicate jersey numbers detected in the team roster. Every player must have a unique number.',
            ], 400);
        }

        $normalizedPhone = preg_replace('/\D+/', '', $data['manager_phone']);
        $alreadyRegistered = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', '!=', 'withdrawn')
            ->get(['manager_phone'])
            ->contains(fn ($team) => preg_replace('/\D+/', '', $team->manager_phone) === $normalizedPhone && $normalizedPhone !== '');

        if ($alreadyRegistered) {
            return response()->json([
                'error' => 'A team is already registered for this tournament with this manager mobile number. Contact the organizer if you need to make changes.',
            ], 409);
        }

        $paymentOption = $data['payment_option'] ?? 'full';
        $payAtGround = $paymentMethod === 'pay_at_ground';

        $options = $this->payments->paymentOptions($tournament);
        $amountToPay = $paymentOption === 'partial'
            ? (float) ($options['partialAmount'] ?: $options['totalFee'])
            : (float) $options['fullAmount'];

        $verifiedTransactionId = null;

        // An online ground-fee payment must be a verified checkout result
        // from the registration flow's gateway, never a self-reported id.
        if (! $payAtGround && $amountToPay > 0 && in_array($paymentMethod, PaymentGatewayService::ONLINE_METHODS, true)) {
            if (empty($data['razorpay_payment_id']) || empty($data['razorpay_order_id']) || empty($data['razorpay_signature'])) {
                return response()->json(['error' => 'Payment verification is required to complete registration.'], 400);
            }

            if (! $this->gateway->verify('registration', $data['razorpay_order_id'], $data['razorpay_payment_id'], $data['razorpay_signature'], $amountToPay)) {
                return response()->json(['error' => 'Payment verification failed. Please try again.'], 400);
            }

            // One payment settles one registration.
            if (RegistrationPayment::query()->where('transaction_id', $data['razorpay_payment_id'])->exists()) {
                return response()->json(['error' => 'This payment has already been used for a registration.'], 409);
            }

            $verifiedTransactionId = $data['razorpay_payment_id'];
        }

        $result = DB::transaction(function () use ($data, $players, $tournament, $link, $paymentOption, $paymentMethod, $payAtGround, $verifiedTransactionId, $request) {
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
                'paymentMethod' => $paymentMethod,
                // Paying at the ground defers the whole fee — nothing is collected now.
                'customAmount' => $payAtGround ? 0.0 : null,
                'transactionId' => $payAtGround
                    ? null
                    : ($verifiedTransactionId ?? $data['transaction_id'] ?? strtoupper($paymentMethod).'_TXN_'.strtoupper(Ids::token(7))),
                'notes' => $payAtGround
                    ? 'Team opted to pay the ground fee in person at the venue'
                    : sprintf('Public registration ground fee payment (%s, %s)', strtoupper($paymentOption), strtoupper($paymentMethod)),
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
            // Handed to the manager to pass on: each player's code for "Player Stats".
            'players' => Player::query()
                ->where('team_id', $result['team']->id)
                ->orderBy('jersey_number')
                ->get(['id', 'full_name', 'jersey_number', 'player_code']),
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

    public function show(Request $request, string $id): JsonResponse
    {
        $team = Team::find($id);

        if (! $team) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        $players = Player::query()->where('team_id', $team->id)->get();
        $insider = $this->isOrganizationStaff($request, $team->organization_id)
            || ($request->user() && $team->manager_user_id === $request->user()->id);

        if (! $insider) {
            // The public gets the squad sheet, not phone numbers or the money.
            return response()->json([
                'team' => $this->withoutTeamContacts($team),
                'players' => $this->withoutPlayerContacts($players),
                'payment' => null,
                'receipt' => null,
                'tournament' => Tournament::find($team->tournament_id),
            ]);
        }

        return response()->json([
            'team' => $team,
            'players' => $players,
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

        $limit = $this->billing->checkLimit($team->organization_id, 'players');

        if (! $limit['allowed']) {
            return response()->json([
                'error' => $limit['reason'] ?? 'Player limit reached for your current subscription plan.',
                'limit' => $limit,
            ], 403);
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
