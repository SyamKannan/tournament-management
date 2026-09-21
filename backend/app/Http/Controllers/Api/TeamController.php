<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GameMatch;
use App\Models\Organization;
use App\Models\Player;
use App\Models\RegistrationLink;
use App\Models\RegistrationPayment;
use App\Models\RegistrationReceipt;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\BillingService;
use App\Services\Notifications\Audience;
use App\Services\Notifications\NotificationService;
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
        private readonly NotificationService $notifications,
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
     * Everything that can refuse a public team entry, without writing anything.
     *
     * Run twice on purpose. The client calls it through `validateRegistration`
     * *before* it opens the payment checkout, so a team is never charged for a
     * registration that was always going to be turned away (squad too small,
     * duplicate jersey numbers, the manager's number already entered). And
     * `register` runs it again, because the situation can change between the
     * check and the submit.
     *
     * @return array{0: JsonResponse|null, 1: array<string, mixed>}
     */
    private function registrationPrecheck(Request $request, string $token): array
    {
        $link = RegistrationLink::query()->where('token', $token)->where('status', 'active')->first();

        if (! $link) {
            return [response()->json(['error' => 'Registration link is inactive or invalid'], 400), []];
        }

        $tournament = Tournament::find($link->tournament_id);

        if (! $tournament) {
            return [response()->json(['error' => 'Tournament not found'], 404), []];
        }

        if ($closed = $this->registrationClosedReason($tournament, $link)) {
            return [response()->json(['error' => $closed], 400), []];
        }

        $currentTeams = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', '!=', 'withdrawn')
            ->count();

        if ($currentTeams >= $tournament->max_teams) {
            return [response()->json([
                'error' => "Tournament registration is full (Max {$tournament->max_teams} teams)",
            ], 400), []];
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
            return [response()->json([
                'error' => 'This payment method is not accepted for this tournament. Please choose another one.',
            ], 400), []];
        }

        $players = $data['players'];
        $settings = $tournament->settings ?? [];
        $football = $tournament->sport_code === 'football';
        $minPlayers = (int) ($settings['squad_min_players'] ?: ($football ? 7 : 11));
        $maxPlayers = (int) ($settings['squad_max_players'] ?: ($football ? 14 : 16));

        if (count($players) < $minPlayers) {
            return [response()->json([
                'error' => sprintf('Minimum %d players are required. You entered %d.', $minPlayers, count($players)),
            ], 400), []];
        }

        if (count($players) > $maxPlayers) {
            return [response()->json([
                'error' => sprintf('Maximum %d players allowed. You entered %d.', $maxPlayers, count($players)),
            ], 400), []];
        }

        $playerLimit = $this->billing->planLimitFor($tournament->organization_id, 'players');

        if ($playerLimit !== null) {
            $currentPlayers = Player::query()->where('organization_id', $tournament->organization_id)->count();

            if ($currentPlayers + count($players) > $playerLimit) {
                return [response()->json([
                    'error' => "This registration would exceed the organizer's player limit ({$currentPlayers}/{$playerLimit}). Please contact the organizer.",
                ], 400), []];
            }
        }

        $jerseyNumbers = array_filter(array_map(fn ($player) => (int) ($player['jersey_number'] ?? 0), $players));

        if (count(array_unique($jerseyNumbers)) !== count($jerseyNumbers)) {
            return [response()->json([
                'error' => 'Duplicate jersey numbers detected in the team roster. Every player must have a unique number.',
            ], 400), []];
        }

        // Entered from a team manager's portal: the team is theirs, so it shows up
        // on their dashboard and they can settle the fee from there later.
        $managerUserId = $request->user()?->role === 'TEAM_MANAGER' ? $request->user()->id : null;

        if ($managerUserId && Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('manager_user_id', $managerUserId)
            ->where('status', '!=', 'withdrawn')
            ->exists()) {
            return [response()->json(['error' => 'You already have a team in this tournament.'], 409), []];
        }

        $normalizedPhone = preg_replace('/\D+/', '', $data['manager_phone']);
        $alreadyRegistered = Team::query()
            ->where('tournament_id', $tournament->id)
            ->where('status', '!=', 'withdrawn')
            ->get(['manager_phone'])
            ->contains(fn ($team) => preg_replace('/\D+/', '', $team->manager_phone) === $normalizedPhone && $normalizedPhone !== '');

        if ($alreadyRegistered) {
            return [response()->json([
                'error' => 'A team is already registered for this tournament with this manager mobile number. Contact the organizer if you need to make changes.',
            ], 409), []];
        }

        $paymentOption = $data['payment_option'] ?? 'full';
        $options = $this->payments->paymentOptions($tournament);
        $amountToPay = $paymentOption === 'partial'
            ? (float) ($options['partialAmount'] ?: $options['totalFee'])
            : (float) $options['fullAmount'];

        return [null, compact('link', 'tournament', 'data', 'players', 'paymentMethod', 'managerUserId', 'amountToPay', 'paymentOption')];
    }

    /**
     * The pre-payment check, as an endpoint: "would this registration be
     * accepted?" Answered before any money moves.
     */
    public function validateRegistration(Request $request, string $token): JsonResponse
    {
        [$error, $context] = $this->registrationPrecheck($request, $token);

        if ($error) {
            return $error;
        }

        return response()->json([
            'ok' => true,
            'amount_to_pay' => $context['amountToPay'],
        ]);
    }

    /**
     * Accept a public team entry: squad validation, roster creation, ground-fee
     * payment and receipt, all in one transaction.
     */
    public function register(Request $request, string $token): JsonResponse
    {
        // A retry of a registration that already went through — the response
        // was lost on a bad connection, the captain tapped "try again". The
        // payment has been used, and saying so ("already used") to someone
        // whose team *is* registered would send them to the organizer for
        // nothing. Hand back the registration it paid for instead.
        if ($replay = $this->replayedRegistration($request)) {
            return $replay;
        }

        [$error, $context] = $this->registrationPrecheck($request, $token);

        if ($error) {
            $this->recordOrphanedPayment($request, $token, $error);

            return $error;
        }

        [
            'link' => $link, 'tournament' => $tournament, 'data' => $data, 'players' => $players,
            'paymentMethod' => $paymentMethod, 'managerUserId' => $managerUserId,
        ] = $context;

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

        $result = DB::transaction(function () use ($data, $players, $tournament, $link, $paymentOption, $paymentMethod, $payAtGround, $verifiedTransactionId, $request, $managerUserId) {
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
                'manager_user_id' => $managerUserId,
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

        // After the transaction, not inside it: a queued notification must not
        // be rolled back into existence or lost with a retry, and the organizer
        // hearing about a registration is not worth failing one over.
        $this->notifications->dispatch(
            'team_registered',
            Audience::organizers($result['team']->organization_id),
            [
                'team' => $result['team']->name,
                'tournament' => Tournament::find($result['team']->tournament_id)?->name ?? '',
                'manager' => $result['team']->manager_name,
                'fee' => $this->currency((float) ($result['payment']->paid_amount ?? 0)),
            ],
            $result['team']->organization_id,
            'team',
            $result['team']->id,
        );

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

    /**
     * The registration a verified payment already paid for, if this request
     * is a retry of one that succeeded. Matched on the payment id *and* the
     * manager's number, so a payment id alone never reveals someone else's
     * registration.
     */
    private function replayedRegistration(Request $request): ?JsonResponse
    {
        $paymentId = (string) $request->input('razorpay_payment_id', '');

        if ($paymentId === '') {
            return null;
        }

        $payment = RegistrationPayment::query()->where('transaction_id', $paymentId)->first();

        if (! $payment) {
            return null;
        }

        $team = Team::find($payment->team_id);
        $phone = preg_replace('/\D+/', '', (string) $request->input('manager_phone', ''));

        // Not the same entry: fall through, and the normal path refuses the
        // reused payment exactly as it always has, without confirming here
        // that the id belongs to somebody's registration.
        if (! $team || $phone === '' || preg_replace('/\D+/', '', (string) $team->manager_phone) !== $phone) {
            return null;
        }

        return response()->json([
            'team' => $team,
            'payment' => $payment,
            'receipt' => RegistrationReceipt::query()
                ->where('team_id', $team->id)
                ->orderByDesc('created_at')
                ->first(),
            'players' => Player::query()
                ->where('team_id', $team->id)
                ->orderBy('jersey_number')
                ->get(['id', 'full_name', 'jersey_number', 'player_code']),
            'replayed' => true,
            'message' => 'Your team was already registered with this payment. Here is your receipt.',
        ]);
    }

    /**
     * A verified payment arrived with a registration that was then refused.
     *
     * The client checks first so this should be rare — but the situation can
     * change between check and submit (the last slot filled, the same number
     * entered from another phone). The money is real, so it is written to the
     * organizer's audit trail with the reference they need to refund it, and
     * the refusal tells the payer exactly that.
     */
    private function recordOrphanedPayment(Request $request, string $token, JsonResponse &$error): void
    {
        $paymentId = (string) $request->input('razorpay_payment_id', '');
        $orderId = (string) $request->input('razorpay_order_id', '');
        $signature = (string) $request->input('razorpay_signature', '');

        if ($paymentId === '' || $orderId === '' || $signature === '') {
            return;
        }

        $link = RegistrationLink::query()->where('token', $token)->first();
        $tournament = $link ? Tournament::find($link->tournament_id) : null;

        if (! $tournament) {
            return;
        }

        // Only a genuine, verified payment is worth an organizer's attention;
        // anything else is a forged or replayed request.
        try {
            $amount = $this->payments->paymentOptions($tournament);
            $option = $request->input('payment_option') === 'partial' ? 'partial' : 'full';
            $expected = $option === 'partial'
                ? (float) ($amount['partialAmount'] ?: $amount['totalFee'])
                : (float) $amount['fullAmount'];

            if (! $this->gateway->verify('registration', $orderId, $paymentId, $signature, $expected)) {
                return;
            }
        } catch (\Throwable) {
            return;
        }

        $reason = (string) ($error->getData(true)['error'] ?? 'Registration refused');

        Audit::log([
            'organization_id' => $tournament->organization_id,
            'user_id' => 'public',
            'user_name' => (string) $request->input('manager_name', 'Unknown'),
            'user_role' => 'PUBLIC',
            'action' => 'REGISTRATION_PAYMENT_NEEDS_REFUND',
            'entity_type' => 'Tournament',
            'entity_id' => $tournament->id,
            'details' => sprintf(
                'Payment %s (₹%s) from %s (%s) for team [%s] was received but the registration was refused: %s',
                $paymentId,
                number_format($expected, 0),
                (string) $request->input('manager_name', ''),
                (string) $request->input('manager_phone', ''),
                (string) $request->input('team_name', ''),
                $reason,
            ),
            'ip_address' => $request->ip(),
        ]);

        $data = $error->getData(true);
        $data['error'] = $reason.' Your payment (reference '.$paymentId.') was received — the organizer has been notified and will refund it or complete your entry.';
        $data['payment_reference'] = $paymentId;
        $data['refund_pending'] = true;
        $error->setData($data);
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

    /**
     * The team manager's dashboard: every team linked to their account, each
     * with its tournament, organizer, squad, entry-fee status and fixtures.
     */
    public function mine(Request $request): JsonResponse
    {
        $teams = Team::query()
            ->where('manager_user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get();

        if ($teams->isEmpty()) {
            return response()->json([]);
        }

        $teamIds = $teams->pluck('id');
        $tournaments = Tournament::query()->whereIn('id', $teams->pluck('tournament_id'))->get()->keyBy('id');
        $organizations = Organization::query()
            ->whereIn('id', $teams->pluck('organization_id'))
            ->get(['id', 'name', 'slug', 'logo'])
            ->keyBy('id');
        $players = Player::query()->whereIn('team_id', $teamIds)->orderBy('jersey_number')->get()->groupBy('team_id');
        $payments = RegistrationPayment::query()->whereIn('team_id', $teamIds)->get()->keyBy('team_id');
        $receipts = RegistrationReceipt::query()->whereIn('team_id', $teamIds)->get()->keyBy('team_id');

        $matches = GameMatch::query()
            ->where(fn ($q) => $q->whereIn('team_a_id', $teamIds)->orWhereIn('team_b_id', $teamIds))
            ->where('status', '!=', 'cancelled')
            ->orderBy('scheduled_at')
            ->orderBy('match_number')
            ->get();
        $opponentNames = Team::query()
            ->whereIn('id', $matches->pluck('team_a_id')->merge($matches->pluck('team_b_id'))->unique())
            ->pluck('name', 'id');

        return response()->json($teams->map(function (Team $team) use (
            $tournaments, $organizations, $players, $payments, $receipts, $matches, $opponentNames
        ) {
            $tournament = $tournaments->get($team->tournament_id);

            $fixtures = $matches
                ->filter(fn ($m) => $m->team_a_id === $team->id || $m->team_b_id === $team->id)
                ->map(function ($m) use ($team, $opponentNames) {
                    $opponentId = $m->team_a_id === $team->id ? $m->team_b_id : $m->team_a_id;

                    return [
                        'id' => $m->id,
                        'match_number' => $m->match_number,
                        'round_name' => $m->round_name,
                        'scheduled_at' => $m->scheduled_at,
                        'status' => $m->status,
                        'opponent_id' => $opponentId,
                        'opponent_name' => $opponentNames->get($opponentId, 'TBD'),
                        'result_summary' => $m->result_summary,
                        'outcome' => $m->status !== 'completed' ? null
                            : ($m->winner_team_id === null ? 'draw'
                                : ($m->winner_team_id === $team->id ? 'won' : 'lost')),
                    ];
                })
                ->values();

            return [
                'team' => $team,
                'tournament' => $tournament,
                'organization' => $organizations->get($team->organization_id),
                'players' => ($players->get($team->id) ?? collect())->values(),
                'payment' => $payments->get($team->id),
                'receipt' => $receipts->get($team->id),
                'matches' => $fixtures,
            ];
        })->values());
    }

    /**
     * Tournaments a team manager can enter right now: published, taking
     * entries through an active link, not full, and not one they're already in.
     */
    public function openTournaments(Request $request): JsonResponse
    {
        $alreadyIn = Team::query()
            ->where('manager_user_id', $request->user()->id)
            ->where('status', '!=', 'withdrawn')
            ->pluck('tournament_id');

        $links = RegistrationLink::query()
            ->where('status', 'active')
            ->whereNotIn('tournament_id', $alreadyIn)
            ->get()
            ->unique('tournament_id');

        $tournaments = Tournament::query()
            ->whereIn('id', $links->pluck('tournament_id'))
            ->whereNotIn('status', ['draft', 'cancelled', 'completed'])
            ->get()
            ->keyBy('id');

        $entries = Team::query()
            ->whereIn('tournament_id', $tournaments->keys())
            ->where('status', '!=', 'withdrawn')
            ->selectRaw('tournament_id, count(*) as total')
            ->groupBy('tournament_id')
            ->pluck('total', 'tournament_id');

        $organizations = Organization::query()
            ->whereIn('id', $tournaments->pluck('organization_id'))
            ->get(['id', 'name', 'logo'])
            ->keyBy('id');

        $open = $links
            ->map(function (RegistrationLink $link) use ($tournaments, $entries, $organizations) {
                $tournament = $tournaments->get($link->tournament_id);

                if (! $tournament || $this->registrationClosedReason($tournament, $link) !== null) {
                    return null;
                }

                $spotsLeft = max(0, $tournament->max_teams - (int) $entries->get($tournament->id, 0));

                if ($spotsLeft === 0) {
                    return null;
                }

                $options = $this->payments->paymentOptions($tournament);

                return [
                    'registration_token' => $link->token,
                    'spots_left' => $spotsLeft,
                    'entry_fee' => (float) $options['totalFee'],
                    'closes_on' => $link->deadline ?: $tournament->registration_closing,
                    'organization' => $organizations->get($tournament->organization_id),
                    'tournament' => $tournament->only([
                        'id', 'name', 'slug', 'sport_code', 'logo', 'location', 'district',
                        'start_date', 'end_date', 'format', 'max_teams', 'prize_money',
                    ]),
                ];
            })
            ->filter()
            ->sortBy(fn ($entry) => $entry['tournament']['start_date'] ?: '9999')
            ->values();

        return response()->json($open);
    }

    /**
     * What a balance payment charges: the full balance, or half the ground fee
     * when the organizer allows paying in halves. Half is only offered while
     * it's less than the balance — once half is paid, the rest is the balance.
     */
    private function balanceAmount(Tournament $tournament, float $due, float $totalFee, string $option): float
    {
        $half = round($totalFee / 2, 2);
        $halvesAllowed = (bool) ($tournament->payment_config['allow_partial'] ?? false);

        return $option === 'half' && $halvesAllowed && $half > 0 && $half < $due ? $half : $due;
    }

    /**
     * The manager's own team with a fee still to pay; an error response when
     * there is nothing to settle (or it isn't their team).
     */
    private function managedTeamWithBalance(Request $request, string $id): array|JsonResponse
    {
        $team = Team::find($id);

        if (! $team || $team->manager_user_id !== $request->user()->id) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        $payment = RegistrationPayment::query()->where('team_id', $team->id)->first();
        $tournament = Tournament::find($team->tournament_id);
        $due = $payment
            ? (float) $payment->remaining_amount
            : (float) ($tournament ? $this->payments->paymentOptions($tournament)['totalFee'] : 0);

        if (! $tournament || $due <= 0) {
            return response()->json(['error' => 'There is no ground fee left to pay for this team.'], 400);
        }

        $totalFee = $payment
            ? (float) $payment->total_fee
            : (float) $this->payments->paymentOptions($tournament)['totalFee'];

        return [$team, $tournament, $due, $totalFee];
    }

    /**
     * Every ground-fee payment on the manager's teams, newest first: one row
     * per receipt, with what that payment was and the balance it left.
     */
    public function myPayments(Request $request): JsonResponse
    {
        $teams = Team::query()->where('manager_user_id', $request->user()->id)->get(['id', 'name', 'tournament_id'])->keyBy('id');

        $receipts = RegistrationReceipt::query()
            ->whereIn('team_id', $teams->keys())
            ->orderBy('issued_at')
            ->orderBy('id')
            ->get();

        // Older receipts only hold running totals; the step between a team's
        // consecutive receipts is what each payment was.
        $previousPaid = [];
        $rows = $receipts->map(function (RegistrationReceipt $receipt) use (&$previousPaid) {
            $data = $receipt->receipt_data ?? [];
            $paidSoFar = (float) ($data['paid_amount'] ?? 0);
            $amount = array_key_exists('amount_paid_now', $data)
                ? (float) $data['amount_paid_now']
                : $paidSoFar - ($previousPaid[$receipt->team_id] ?? 0);
            $previousPaid[$receipt->team_id] = $paidSoFar;

            return [
                'receipt' => $receipt,
                'team_id' => $receipt->team_id,
                'team_name' => $data['team_name'] ?? '',
                'tournament_name' => $data['tournament_name'] ?? '',
                'organization_name' => $data['organization_name'] ?? '',
                'issued_at' => $receipt->issued_at,
                'amount' => round(max(0, $amount), 2),
                'method' => $data['payment_method'] ?? '',
                'transaction_id' => $data['transaction_id'] ?? '',
                'total_fee' => (float) ($data['total_fee'] ?? 0),
                'paid_to_date' => $paidSoFar,
                'balance_after' => (float) ($data['remaining_balance'] ?? 0),
            ];
        })->reverse()->values();

        $fees = RegistrationPayment::query()->whereIn('team_id', $teams->keys())->get();

        return response()->json([
            'payments' => $rows,
            'totals' => [
                'total_fees' => round((float) $fees->sum('total_fee'), 2),
                'paid' => round((float) $fees->sum('paid_amount'), 2),
                'due' => round((float) $fees->sum('remaining_amount'), 2),
            ],
        ]);
    }

    /** Start online checkout for the ground fee still due on the manager's team. */
    public function balanceOrder(Request $request, string $id): JsonResponse
    {
        $found = $this->managedTeamWithBalance($request, $id);

        if ($found instanceof JsonResponse) {
            return $found;
        }

        [$team, $tournament, $due, $totalFee] = $found;
        $data = $request->validate([
            'method' => ['nullable', 'string'],
            'option' => ['nullable', 'string', 'in:half,full'],
        ]);
        $amount = $this->balanceAmount($tournament, $due, $totalFee, $data['option'] ?? 'full');

        try {
            $order = $this->gateway->createOrder(
                'registration',
                $amount,
                'INR',
                'bal-'.Ids::token(10),
                ['tournament_id' => $tournament->id, 'team_id' => $team->id, 'purpose' => 'ground_fee_balance'],
                $tournament->payment_config['enabled_methods'] ?? Tournament::PAYMENT_METHODS,
                $data['method'] ?? null,
            );
        } catch (\RuntimeException $e) {
            report($e);

            return response()->json(['error' => str_starts_with($e->getMessage(), 'Unable to create')
                ? 'Unable to start payment. Please try again.'
                : $e->getMessage()], 503);
        }

        return response()->json([...$order, 'amount_due' => $due, 'amount' => $amount]);
    }

    /** Record a verified online payment of the ground fee still due. */
    public function payBalance(Request $request, string $id): JsonResponse
    {
        $found = $this->managedTeamWithBalance($request, $id);

        if ($found instanceof JsonResponse) {
            return $found;
        }

        [$team, $tournament, $due, $totalFee] = $found;
        $data = $request->validate([
            'option' => ['nullable', 'string', 'in:half,full'],
            'payment_method' => ['required', 'string', 'in:'.implode(',', PaymentGatewayService::ONLINE_METHODS)],
            'razorpay_payment_id' => ['required', 'string', 'max:255'],
            'razorpay_order_id' => ['required', 'string', 'max:255'],
            'razorpay_signature' => ['required', 'string', 'max:512'],
        ]);

        $amount = $this->balanceAmount($tournament, $due, $totalFee, $data['option'] ?? 'full');

        // The order was opened for exactly this amount; a stale order (the
        // organizer recorded cash meanwhile) no longer matches and is refused.
        if (! $this->gateway->verify('registration', $data['razorpay_order_id'], $data['razorpay_payment_id'], $data['razorpay_signature'], $amount)) {
            return response()->json(['error' => 'Payment verification failed. Please try again.'], 400);
        }

        if (RegistrationPayment::query()->where('transaction_id', $data['razorpay_payment_id'])->exists()) {
            return response()->json(['error' => 'This payment has already been recorded.'], 409);
        }

        $result = $this->payments->processPayment([
            'teamId' => $team->id,
            'tournamentId' => $tournament->id,
            'organizationId' => $team->organization_id,
            'paymentMethod' => $data['payment_method'],
            'paymentOption' => $amount < $due ? 'partial' : 'full',
            'customAmount' => $amount,
            'transactionId' => $data['razorpay_payment_id'],
            'notes' => $amount < $due
                ? 'Half of the ground fee paid online by the team manager'
                : 'Ground fee balance paid online by the team manager',
        ]);

        Audit::log([
            'organization_id' => $team->organization_id,
            'user_id' => $request->user()->id,
            'user_name' => $request->user()->name,
            'user_role' => 'TEAM_MANAGER',
            'action' => 'PAID_GROUND_FEE_BALANCE',
            'entity_type' => 'Team',
            'entity_id' => $team->id,
            'details' => sprintf('Team [%s] paid ₹%s of the ground fee online (₹%s was due)', $team->name, $amount, $due),
            'ip_address' => $request->ip(),
        ]);

        return response()->json($result);
    }

    /**
     * A team manager sets a player's role on their own team: football
     * position, cricket role and styles, captain and wicketkeeper.
     */
    public function updateManagedPlayer(Request $request, string $id, string $playerId): JsonResponse
    {
        $team = Team::find($id);

        if (! $team || $team->manager_user_id !== $request->user()->id) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        $player = Player::query()->where('team_id', $team->id)->whereKey($playerId)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found in this team'], 404);
        }

        $data = $request->validate([
            'football_position' => ['sometimes', 'nullable', 'string', 'max:64'],
            'cricket_role' => ['sometimes', 'nullable', 'string', 'max:64'],
            'cricket_batting_style' => ['sometimes', 'nullable', 'string', 'max:64'],
            'cricket_bowling_style' => ['sometimes', 'nullable', 'string', 'max:64'],
            'is_captain' => ['sometimes', 'boolean'],
            'is_wicketkeeper' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($team, $player, $data) {
            // One captain per team; the team sheet's captain name follows.
            if (($data['is_captain'] ?? false) === true) {
                Player::query()->where('team_id', $team->id)->whereKeyNot($player->id)->update(['is_captain' => false]);
                $team->update(['captain_name' => $player->full_name]);
            }

            $player->fill($data)->save();
        });

        return response()->json(Player::query()->where('team_id', $team->id)->orderBy('jersey_number')->get());
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

        $previousStatus = $team->status;
        $team->fill($data)->save();

        // Only on the change, so re-saving an approved team to set its group
        // does not tell the manager they are in all over again.
        if ($team->status !== $previousStatus) {
            $this->announceTeamDecision($team);
        }

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
            $result = $this->payments->processPayment([
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
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $this->announcePayment($team, $result);

        return response()->json($result);
    }

    /**
     * Confirm a collected instalment to the manager who paid it.
     *
     * This is the receipt a village team keeps: cash handed over at the ground
     * leaves no other trace, and "what did we already pay?" is the argument this
     * prevents.
     *
     * @param  array<string, mixed>  $result
     */
    private function announcePayment(Team $team, array $result): void
    {
        $payment = $result['payment'] ?? null;

        if (! $payment) {
            return;
        }

        $this->notifications->dispatch(
            'payment_received',
            Audience::teamManager($team),
            [
                'team' => $team->name,
                'tournament' => Tournament::find($team->tournament_id)?->name ?? '',
                'amount' => $this->currency((float) ($result['amount_paid_now'] ?? $payment->paid_amount ?? 0)),
                'paid' => $this->currency((float) ($payment->paid_amount ?? 0)),
                'fee' => $this->currency((float) ($payment->total_fee ?? 0)),
                'balance' => $this->currency((float) ($payment->remaining_amount ?? 0)),
                'receipt' => (string) ($result['receipt']->receipt_number ?? $payment->receipt_number ?? ''),
            ],
            $team->organization_id,
            'team',
            $team->id,
        );
    }

    /**
     * Tell a team's manager that their entry was accepted or turned down.
     *
     * Being approved carries what they now owe and when to turn up, because
     * that is the next thing they need — a bare "approved" makes them log in to
     * find out.
     */
    private function announceTeamDecision(Team $team): void
    {
        if (! in_array($team->status, ['approved', 'rejected'], true)) {
            return;
        }

        $tournament = Tournament::find($team->tournament_id);
        $payment = RegistrationPayment::query()->where('team_id', $team->id)->first();
        $organization = Organization::find($team->organization_id);

        $this->notifications->dispatch(
            $team->status === 'approved' ? 'team_approved' : 'team_rejected',
            Audience::teamManager($team),
            [
                'team' => $team->name,
                'tournament' => $tournament?->name ?? '',
                'start_date' => $tournament?->start_date ?? '',
                'venue_line' => $tournament?->location ? ' at '.$tournament->location : '',
                'balance' => $this->currency((float) ($payment->remaining_amount ?? 0)),
                'reason' => (string) ($team->approval_notes ?? ''),
                'contact' => $organization?->phone ?: ($tournament?->phone ?? ''),
            ],
            $team->organization_id,
            'team',
            $team->id,
        );
    }

    private function currency(float $amount): string
    {
        $symbol = \App\Models\PlatformSetting::query()->value('currency_symbol') ?: '₹';

        return $symbol.number_format($amount, 0);
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
