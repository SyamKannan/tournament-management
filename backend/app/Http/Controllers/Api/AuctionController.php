<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Auction;
use App\Models\AuctionBid;
use App\Models\AuctionPlayer;
use App\Models\Notification;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\AuctionService;
use App\Services\Notifications\Audience;
use App\Services\Notifications\NotificationService;
use App\Services\RealtimeBroadcaster;
use App\Support\Audit;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Player auctions: pool registration and approval, then the live bidding room.
 *
 * Every auctioneer action broadcasts to `auction:<id>`, which the bidding
 * console and the auction TV screen both subscribe to.
 */
class AuctionController extends Controller
{
    public function __construct(
        private readonly AuctionService $auctions,
        private readonly RealtimeBroadcaster $realtime,
        private readonly NotificationService $notifications,
    ) {}

    /* ------------------------------------------------------------- Reading */

    public function forTournament(Request $request, string $tournamentId): JsonResponse
    {
        $auction = Auction::query()->where('tournament_id', $tournamentId)->first();

        if (! $auction) {
            return response()->json(['error' => 'No auction found for this tournament'], 404);
        }

        $players = $this->visiblePlayers($request, $auction);

        return response()->json([
            'auction' => $auction,
            'team_purses' => $this->auctions->teamPurses($auction),
            'players' => $players,
            'total_players' => $players->count(),
            'sold_count' => $players->where('status', 'sold')->count(),
            'unsold_count' => $players->where('status', 'unsold')->count(),
            'registered_count' => $players->whereIn('status', ['registered', 'approved'])->count(),
        ]);
    }

    /**
     * Live auction room state: who is on the hammer, what every team can still
     * spend, and the running bid history.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        $players = $this->visiblePlayers($request, $auction);

        return response()->json([
            'auction' => $auction,
            'tournament' => Tournament::find($auction->tournament_id),
            'organization' => Organization::find($auction->organization_id),
            'current_player' => $auction->current_player_id
                ? $players->firstWhere('id', $auction->current_player_id)
                : null,
            'team_purses' => $this->auctions->teamPurses($auction),
            'players' => $players,
            'bid_history' => $auction->bidHistory,
        ]);
    }

    /**
     * Final report: who went for what, which teams spent what, and the headline
     * numbers.
     */
    public function summary(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        $players = $this->visiblePlayers($request, $auction);
        $sold = $players->where('status', 'sold')->sortByDesc('sold_price')->values();
        $totalSpent = (float) $sold->sum('sold_price');
        $paidPlayers = $sold->where('payment_status', 'paid');
        $totalPaid = (float) $paidPlayers->sum(fn ($p) => (float) ($p->payment_amount ?? $p->sold_price ?? 0));
        $totalPending = max(0, $totalSpent - $totalPaid);

        return response()->json([
            'auction' => $auction,
            'tournament' => Tournament::find($auction->tournament_id),
            'organization' => Organization::find($auction->organization_id),
            'stats' => [
                'total_players' => $players->count(),
                'sold_count' => $sold->count(),
                'unsold_count' => $players->where('status', 'unsold')->count(),
                'pending_count' => $players->where('status', 'registered')->count(),
                'approved_count' => $players->whereIn('status', ['approved', 'in_hammer'])->count(),
                'total_spent' => $totalSpent,
                'average_price' => $sold->count() > 0 ? (int) round($totalSpent / $sold->count()) : 0,
                'highest_bid' => $sold->first()->sold_price ?? 0,
                'highest_bid_player' => $sold->first(),
                'total_entitled_amount' => $totalSpent,
                'total_paid_amount' => $totalPaid,
                'total_pending_amount' => $totalPending,
                'paid_players_count' => $paidPlayers->count(),
                'pending_players_count' => $sold->where('payment_status', '!=', 'paid')->count(),
                'settlement_percentage' => $totalSpent > 0 ? round(($totalPaid / $totalSpent) * 100, 1) : 0,
            ],
            'sold_players' => $sold,
            'unsold_players' => $players->where('status', 'unsold')->values(),
            'pending_players' => $players->where('status', 'registered')->values(),
            'approved_players' => $players->whereIn('status', ['approved', 'in_hammer'])->values(),
            'team_purses' => $this->auctions->teamPurses($auction),
            'bid_history' => $auction->bidHistory,
        ]);
    }

    /**
     * Everything a team manager's auction page needs, from their own side of
     * the room: their purse, their squad so far, who is on the hammer, whether
     * they currently hold the top bid, and what it would cost to raise it.
     */
    public function myTeam(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        $team = $this->auctions->biddableTeamFor($auction, $request->user());

        if (! $team) {
            return response()->json([
                'error' => 'Your account is not linked to a team in this tournament.',
            ], 403);
        }

        $purse = collect($this->auctions->teamPurses($auction))->firstWhere('team_id', $team->id);
        $currentPlayer = $auction->current_player_id ? AuctionPlayer::find($auction->current_player_id) : null;

        $leading = $auction->current_bid_team_id === $team->id;
        $biddingOpen = $auction->status === 'live'
            && ! in_array($auction->hammer_state, ['sold', 'unsold'], true)
            && $currentPlayer !== null;

        // What the next valid bid costs: the base price if nobody has bid yet,
        // otherwise the standing bid plus the increment.
        $nextBid = $currentPlayer
            ? ($auction->current_bid_team_id
                ? (float) $auction->current_bid_amount + (float) $auction->min_bid_increment
                : (float) ($auction->current_bid_amount ?: $currentPlayer->base_price))
            : 0.0;

        $remaining = (float) ($purse['remaining_purse'] ?? 0);
        $squadFull = ($purse['players_bought_count'] ?? 0) >= $auction->max_players_per_team;

        return response()->json([
            'auction' => $auction,
            'tournament' => Tournament::find($auction->tournament_id),
            'team' => $team,
            'purse' => $purse,
            'current_player' => $currentPlayer,
            'squad' => AuctionPlayer::query()
                ->where('auction_id', $auction->id)
                ->where('sold_to_team_id', $team->id)
                ->where('status', 'sold')
                ->get(),
            'bidding' => [
                'open' => $biddingOpen,
                'is_leading' => $leading,
                'leading_team_name' => $auction->current_bid_team_name,
                'current_bid' => (float) $auction->current_bid_amount,
                'next_bid' => $nextBid,
                'can_afford' => $nextBid <= $remaining,
                'squad_full' => $squadFull,
                'blocked_reason' => match (true) {
                    ! $biddingOpen => 'Waiting for the auctioneer to call a player.',
                    $squadFull => 'Your squad is full.',
                    $nextBid > $remaining => 'Not enough purse left for the next bid.',
                    $leading => 'You already hold the top bid.',
                    default => null,
                },
            ],
            'my_bids' => AuctionBid::query()
                ->where('auction_id', $auction->id)
                ->where('team_id', $team->id)
                ->orderByDesc('sequence')
                ->limit(25)
                ->get(),
            'bid_history' => $auction->bidHistory,
        ]);
    }

    /**
     * The auctions a team manager is entitled to join.
     */
    public function myAuctions(Request $request): JsonResponse
    {
        $teams = Team::query()->where('manager_user_id', $request->user()->id)->get();

        if ($teams->isEmpty()) {
            return response()->json([]);
        }

        $auctions = Auction::query()->whereIn('tournament_id', $teams->pluck('tournament_id'))->get();
        $tournaments = Tournament::query()->whereIn('id', $teams->pluck('tournament_id'))->get()->keyBy('id');

        return response()->json($auctions->map(function (Auction $auction) use ($teams, $tournaments) {
            $team = $teams->firstWhere('tournament_id', $auction->tournament_id);
            $purse = collect($this->auctions->teamPurses($auction))->firstWhere('team_id', $team?->id);

            return [
                'auction' => $auction,
                'tournament' => $tournaments->get($auction->tournament_id),
                'team' => $team,
                'purse' => $purse,
            ];
        })->values());
    }

    /* --------------------------------------------------------- Player pool */

    public function publicRegistrationPage(string $token): JsonResponse
    {
        $auction = Auction::query()->where('token', $token)->first();

        if (! $auction) {
            return response()->json(['error' => 'Auction registration link not found or expired'], 404);
        }

        return response()->json([
            'auction' => $auction,
            'tournament' => Tournament::find($auction->tournament_id),
            'organization' => Organization::find($auction->organization_id),
            'registered_players_count' => AuctionPlayer::query()->where('auction_id', $auction->id)->count(),
        ]);
    }

    /**
     * Player self-entry into the auction pool via the shared link. Lands as
     * `registered` and waits for the organizer to approve.
     */
    public function publicRegister(Request $request, string $token): JsonResponse
    {
        $auction = Auction::query()->where('token', $token)->first();

        if (! $auction) {
            return response()->json(['error' => 'Auction registration link not found'], 404);
        }

        // Late entries during a live auction still land for approval; only a
        // closed, finished or cancelled auction turns people away.
        if (in_array($auction->status, ['registration_closed', 'completed', 'cancelled'], true)) {
            return response()->json(['error' => 'Registration for this auction is closed.'], 400);
        }

        $data = $request->validate([
            'full_name' => ['required', 'string', 'max:255'],
            'mobile' => ['required', 'string', 'max:64'],
            'age' => ['required', 'integer', 'min:1'],
            'email' => ['nullable', 'email', 'max:255'],
            'photo' => ['nullable', 'string'],
            'village' => ['nullable', 'string', 'max:255'],
            'district' => ['nullable', 'string', 'max:255'],
            'sport_code' => ['nullable', 'string', 'in:football,cricket'],
            'category' => ['nullable', 'string', 'in:Icon,Category A,Category B,Category C,Emerging'],
            'cricket_role' => ['nullable', 'string', 'max:64'],
            'cricket_batting_style' => ['nullable', 'string', 'max:64'],
            'cricket_bowling_style' => ['nullable', 'string', 'max:64'],
            'football_position' => ['nullable', 'string', 'max:64'],
            'football_preferred_foot' => ['nullable', 'string', 'in:left,right,both'],
            'past_achievements' => ['nullable', 'string'],
        ], [
            'full_name.required' => 'Player name, mobile number, and age are required',
            'mobile.required' => 'Player name, mobile number, and age are required',
            'age.required' => 'Player name, mobile number, and age are required',
        ]);

        // Same person, same pool: compare the last ten digits so "+91 98…" and
        // "98…" count as one number.
        $lastTen = fn ($mobile) => substr(preg_replace('/\D/', '', (string) $mobile), -10);
        $alreadyRegistered = AuctionPlayer::query()
            ->where('auction_id', $auction->id)
            ->where('status', '!=', 'rejected')
            ->pluck('mobile')
            ->contains(fn ($mobile) => $lastTen($mobile) === $lastTen($data['mobile']));

        if ($alreadyRegistered) {
            return response()->json(['error' => 'This mobile number is already registered for this auction.'], 409);
        }

        $sportCode = $data['sport_code'] ?? 'football';
        $category = $data['category'] ?? 'Category B';
        $basePrices = $auction->base_prices ?? [];

        $matched = collect($basePrices)->firstWhere('category', $category)
            ?? ($basePrices[2] ?? ['price' => 2000]);

        $player = AuctionPlayer::create([
            'id' => Ids::unique('ap'),
            'auction_id' => $auction->id,
            'tournament_id' => $auction->tournament_id,
            'organization_id' => $auction->organization_id,
            'full_name' => $data['full_name'],
            'mobile' => $data['mobile'],
            'email' => $data['email'] ?? null,
            'photo' => $data['photo'] ?? ($sportCode === 'cricket'
                ? 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80'
                : 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80'),
            'age' => (int) $data['age'],
            'village' => $data['village'] ?? '',
            'district' => $data['district'] ?? 'Malappuram',
            'sport_code' => $sportCode,
            'category' => $category,
            'base_price' => (float) $matched['price'],
            'status' => 'registered',
            'cricket_role' => $data['cricket_role'] ?? null,
            'cricket_batting_style' => $data['cricket_batting_style'] ?? null,
            'cricket_bowling_style' => $data['cricket_bowling_style'] ?? null,
            'football_position' => $data['football_position'] ?? null,
            'football_preferred_foot' => $data['football_preferred_foot'] ?? null,
            'past_achievements' => $data['past_achievements'] ?? null,
        ]);

        return response()->json([
            'player' => $player,
            'message' => 'You have registered for the auction successfully! Your registration is under review by the tournament organizers.',
        ], 201);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tournament_id' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'auction_date' => ['nullable', 'string'],
            'team_purse' => ['nullable', 'numeric', 'min:0'],
            'min_bid_increment' => ['nullable', 'numeric', 'min:0'],
            'max_players_per_team' => ['nullable', 'integer', 'min:1'],
            'min_players_per_team' => ['nullable', 'integer', 'min:1'],
            'base_prices' => ['nullable', 'array'],
        ], [
            'tournament_id.required' => 'Tournament ID and auction title are required',
            'title.required' => 'Tournament ID and auction title are required',
        ]);

        $tournament = Tournament::find($data['tournament_id']);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        if ($denied = $this->denyForeignTenant($request, $tournament->organization_id)) {
            return $denied;
        }

        $existing = Auction::query()->where('tournament_id', $tournament->id)->first();

        if ($existing) {
            return response()->json([
                'error' => 'An auction already exists for this tournament',
                'auction' => $existing,
            ], 400);
        }

        $auction = $this->auctions->createForTournament($tournament, [
            ...$data,
            'token' => Ids::slug($data['title'] ?: 'auction').'-'.base_convert((string) Ids::millis(), 10, 36),
            'status' => 'registration_open',
            'auction_date' => $data['auction_date'] ?? now()->addDays(7)->format('Y-m-d\TH:i:s.v\Z'),
        ]);

        return response()->json($auction, 201);
    }

    public function updatePlayerStatus(Request $request, string $playerId): JsonResponse
    {
        $player = AuctionPlayer::find($playerId);

        if (! $player) {
            return response()->json(['error' => 'Player not found in auction pool'], 404);
        }

        $auction = Auction::find($player->auction_id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        // Sold and on-the-hammer are reached only through the live room, which
        // also writes the squad and bid state that go with them.
        if ($request->has('status') && in_array($player->status, ['sold', 'in_hammer'], true)) {
            return response()->json(['error' => 'A player who is sold or on the hammer cannot be changed here.'], 400);
        }

        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:registered,approved,unsold,rejected'],
            'category' => ['sometimes', 'string', 'in:Icon,Category A,Category B,Category C,Emerging'],
            'base_price' => ['sometimes', 'numeric', 'min:0'],
        ]);

        $player->fill($data)->save();

        return response()->json($player);
    }

    public function approvePlayer(Request $request, string $id, string $playerId): JsonResponse
    {
        return $this->setPoolStatus($request, $id, $playerId, 'approved', 'PLAYER_APPROVED', 'Player approved for auction pool');
    }

    public function rejectPlayer(Request $request, string $id, string $playerId): JsonResponse
    {
        return $this->setPoolStatus($request, $id, $playerId, 'rejected', 'PLAYER_REJECTED', 'Player registration rejected');
    }

    public function removePlayer(Request $request, string $id, string $playerId): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $player = AuctionPlayer::query()->whereKey($playerId)->where('auction_id', $auction->id)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
        }

        if (in_array($player->status, ['sold', 'in_hammer'], true)) {
            return response()->json(['error' => 'A player who is sold or on the hammer cannot be removed.'], 400);
        }

        $player->delete();

        $this->realtime->toRoom("auction:{$auction->id}", 'PLAYER_DELETED', ['playerId' => $playerId]);

        return response()->json(['message' => 'Player removed from auction pool']);
    }

    /* ------------------------------------------------------- Live auction */

    /**
     * Put a player on the hammer: opens bidding at their base price and clears
     * the previous player's bid history.
     */
    public function callPlayer(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $data = $request->validate(['player_id' => ['required', 'string']]);

        $player = AuctionPlayer::query()->whereKey($data['player_id'])->where('auction_id', $auction->id)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found in this auction pool'], 404);
        }

        if (! in_array($player->status, ['registered', 'approved', 'unsold'], true)) {
            return response()->json(['error' => "This player cannot be called — their status is {$player->status}."], 400);
        }

        if ($auction->hammer_state === 'bidding' && $auction->current_bid_team_id && $auction->current_player_id !== $player->id) {
            return response()->json(['error' => 'The player on the hammer has live bids. Sell them or mark them unsold first.'], 400);
        }

        DB::transaction(function () use ($auction, $player) {
            // A player left on the hammer without bids goes back to the pool.
            AuctionPlayer::query()
                ->where('auction_id', $auction->id)
                ->where('status', 'in_hammer')
                ->whereKeyNot($player->id)
                ->update(['status' => 'approved']);

            AuctionBid::query()->where('auction_id', $auction->id)->delete();

            $auction->fill([
                'status' => 'live',
                'current_player_id' => $player->id,
                'current_bid_amount' => $player->base_price,
                'current_bid_team_id' => null,
                'current_bid_team_name' => null,
                'hammer_state' => 'bidding',
                'hammer_timer_seconds' => 30,
            ])->save();

            $player->status = 'in_hammer';
            $player->save();
        });

        $auction->refresh();
        $purses = $this->auctions->teamPurses($auction);

        $this->realtime->toRoom("auction:{$auction->id}", 'PLAYER_ON_HAMMER', [
            'auction' => $auction,
            'player' => $player,
            'team_purses' => $purses,
        ]);

        return response()->json(['auction' => $auction, 'player' => $player, 'team_purses' => $purses]);
    }

    /**
     * Place a bid, enforcing the minimum increment, the team's remaining purse
     * and its squad cap.
     */
    public function placeBid(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($auction->status !== 'live' || in_array($auction->hammer_state, ['sold', 'unsold'], true)) {
            return response()->json(['error' => 'Auction is not currently in an active bidding round'], 400);
        }

        if (! $auction->current_player_id) {
            return response()->json(['error' => 'No player is currently on the hammer'], 400);
        }

        $data = $request->validate([
            'team_id' => ['nullable', 'string'],
            'amount' => ['required', 'numeric', 'min:0'],
        ]);

        // A team manager always bids for their own team. Trusting `team_id`
        // from the request would let one manager spend a rival's purse.
        $ownTeam = $this->auctions->biddableTeamFor($auction, $request->user());

        if ($request->user()->role === 'TEAM_MANAGER' && ! $ownTeam) {
            return response()->json([
                'error' => 'Your account is not linked to a team in this tournament.',
            ], 403);
        }

        // Anyone else placing a bid is the organizer entering it from the floor.
        if (! $ownTeam && ($denied = $this->denyNonAuctioneer($request, $auction))) {
            return $denied;
        }

        $team = $ownTeam ?? (isset($data['team_id']) ? Team::find($data['team_id']) : null);

        if (! $team) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        if ($team->tournament_id !== $auction->tournament_id) {
            return response()->json(['error' => 'That team is not entered in this tournament.'], 403);
        }

        $player = AuctionPlayer::find($auction->current_player_id);

        if (! $player) {
            return response()->json(['error' => 'Active player not found'], 404);
        }

        $bidAmount = (float) $data['amount'];
        $hasStandingBid = (bool) $auction->current_bid_team_id;
        $minimumRequired = $hasStandingBid
            ? (float) $auction->current_bid_amount + (float) $auction->min_bid_increment
            : (float) $player->base_price;

        if ($bidAmount < $minimumRequired) {
            return response()->json([
                'error' => ($hasStandingBid ? 'Minimum bid must be at least ₹' : 'Opening bid must be at least the base price of ₹')
                    .number_format($minimumRequired),
            ], 400);
        }

        if ($auction->current_bid_team_id === $team->id) {
            return response()->json(['error' => "{$team->name} already holds the top bid."], 400);
        }

        $purse = collect($this->auctions->teamPurses($auction))->firstWhere('team_id', $team->id);

        if (! $purse) {
            return response()->json(['error' => 'Team purse data missing'], 400);
        }

        if ($bidAmount > $purse['remaining_purse']) {
            return response()->json([
                'error' => sprintf(
                    'Insufficient purse! Remaining purse: ₹%s, Bid attempted: ₹%s',
                    number_format($purse['remaining_purse']),
                    number_format($bidAmount)
                ),
            ], 400);
        }

        if ($purse['players_bought_count'] >= $auction->max_players_per_team) {
            return response()->json([
                'error' => "Squad full! Maximum {$auction->max_players_per_team} players allowed.",
            ], 400);
        }

        $bid = DB::transaction(function () use ($auction, $player, $team, $bidAmount) {
            // Two teams bidding in the same instant: re-read under a lock so the
            // later bid is judged against the one that just landed.
            $locked = Auction::query()->whereKey($auction->id)->lockForUpdate()->first();

            if ($locked->current_player_id !== $player->id
                || $locked->hammer_state !== 'bidding'
                || $locked->current_bid_team_id === $team->id
                || ($locked->current_bid_team_id
                    && $bidAmount < (float) $locked->current_bid_amount + (float) $locked->min_bid_increment)) {
                return null;
            }

            $bid = AuctionBid::create([
                'id' => Ids::unique('bid'),
                'auction_id' => $auction->id,
                'player_id' => $player->id,
                'team_id' => $team->id,
                'team_name' => $team->name,
                'amount' => $bidAmount,
                'timestamp' => Ids::now(),
                'sequence' => ((int) AuctionBid::query()->where('auction_id', $auction->id)->max('sequence')) + 1,
            ]);

            $auction->fill([
                'current_bid_amount' => $bidAmount,
                'current_bid_team_id' => $team->id,
                'current_bid_team_name' => $team->name,
                'hammer_state' => 'bidding',
                // A fresh bid restarts a shorter countdown.
                'hammer_timer_seconds' => 20,
            ])->save();

            return $bid;
        });

        if (! $bid) {
            return response()->json(['error' => 'Another bid landed first. Check the new price and bid again.'], 409);
        }

        $auction->refresh();

        $this->realtime->toRoom("auction:{$auction->id}", 'BID_PLACED', [
            'auction' => $auction,
            'bid' => $bid,
            'player' => $player,
            'team_purses' => $this->auctions->teamPurses($auction),
        ]);

        return response()->json(['auction' => $auction, 'bid' => $bid, 'player' => $player]);
    }

    /**
     * Hammer down. Marks the player sold at the standing bid and adds them
     * straight into the buying team's tournament squad.
     */
    public function sellPlayer(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        if (! $auction->current_player_id) {
            return response()->json(['error' => 'No player on the hammer'], 400);
        }

        $player = AuctionPlayer::find($auction->current_player_id);

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
        }

        if ($auction->hammer_state !== 'bidding' || $player->status !== 'in_hammer') {
            return response()->json(['error' => 'This player has already been sold or marked unsold. Call the next player.'], 400);
        }

        if (! $auction->current_bid_team_id) {
            return response()->json(['error' => 'No bids placed. Use unsold button instead.'], 400);
        }

        $team = Team::find($auction->current_bid_team_id);
        $finalPrice = $auction->current_bid_amount ?: $player->base_price;

        DB::transaction(function () use ($auction, $player, $team, $finalPrice) {
            $player->fill([
                'status' => 'sold',
                'sold_price' => $finalPrice,
                'sold_to_team_id' => $auction->current_bid_team_id,
                'sold_to_team_name' => $team?->name ?? 'Unknown Team',
                'payment_status' => 'pending',
                'payment_amount' => $finalPrice,
            ]);

            if ($team) {
                $rosterPlayer = Player::create([
                    'id' => Ids::unique('pl'),
                    'team_id' => $team->id,
                    'tournament_id' => $auction->tournament_id,
                    'organization_id' => $auction->organization_id,
                    'full_name' => $player->full_name,
                    'jersey_number' => Player::query()->where('team_id', $team->id)->count() + 1,
                    'football_position' => $player->football_position,
                    'cricket_role' => $player->cricket_role,
                    'cricket_bowling_style' => $player->cricket_bowling_style,
                    'cricket_batting_style' => $player->cricket_batting_style,
                    'age' => $player->age,
                    'mobile' => $player->mobile,
                    'is_captain' => false,
                    'is_wicketkeeper' => false,
                ]);

                $player->player_id = $rosterPlayer->id;
            }

            $player->save();

            $auction->hammer_state = 'sold';
            $auction->save();
        });

        $auction->refresh();
        $purses = $this->auctions->teamPurses($auction);

        $this->realtime->toRoom("auction:{$auction->id}", 'PLAYER_SOLD', [
            'auction' => $auction,
            'player' => $player,
            'team' => $team,
            'sold_price' => $finalPrice,
            'team_purses' => $purses,
        ]);

        // The player is usually not in the room — they registered through a
        // share link and are waiting to hear. One message per player per
        // auction, so a corrected sale does not tell them twice.
        $this->notifications->dispatch(
            'auction_player_sold',
            Audience::player($player),
            [
                'player' => $player->full_name,
                'team' => $team?->name ?? '',
                'price' => number_format((float) $finalPrice, 0),
                'tournament' => Tournament::find($auction->tournament_id)?->name ?? '',
            ],
            $auction->organization_id,
            'auction_player',
            $player->id,
            // Keyed on the team and price too: a sale undone and made again to
            // a different team is a different message the player must get,
            // while the same sale repeated still sends only once.
            "auction_player_sold:{$auction->id}:{$player->id}:{$auction->current_bid_team_id}:{$finalPrice}",
        );

        return response()->json([
            'auction' => $auction,
            'player' => $player,
            'team' => $team,
            'team_purses' => $purses,
        ]);
    }

    public function unsoldPlayer(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        if (! $auction->current_player_id) {
            return response()->json(['error' => 'No player on the hammer'], 400);
        }

        $player = AuctionPlayer::find($auction->current_player_id);

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
        }

        if ($auction->hammer_state !== 'bidding' || $player->status !== 'in_hammer') {
            return response()->json(['error' => 'This player has already been sold or marked unsold. Call the next player.'], 400);
        }

        $player->status = 'unsold';
        $player->save();

        $auction->hammer_state = 'unsold';
        $auction->save();
        $auction->refresh();

        $this->realtime->toRoom("auction:{$auction->id}", 'PLAYER_UNSOLD', [
            'auction' => $auction,
            'player' => $player,
            'team_purses' => $this->auctions->teamPurses($auction),
        ]);

        return response()->json(['auction' => $auction, 'player' => $player]);
    }

    /**
     * Undo the hammer: put the player just sold (or just marked unsold) back
     * up for bidding, exactly where the bidding stood.
     *
     * Scoring has always had undo; the auction, where one tap commits a team's
     * purse in front of a full room, had none, so a mis-tap or a double-tap on
     * a slow connection was permanent. This reverses only the *latest* result —
     * the player still on the hammer — and only before anything has been built
     * on it: once the next player is called, or money has been taken for the
     * sale, the room has moved on and a correction is the organizer's call.
     */
    public function reopenHammer(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        if (! $auction->current_player_id || ! in_array($auction->hammer_state, ['sold', 'unsold'], true)) {
            return response()->json([
                'error' => 'There is no result to undo. Only the most recent sale or unsold call can be reopened, before the next player is called.',
            ], 409);
        }

        $player = AuctionPlayer::find($auction->current_player_id);

        if (! $player || ! in_array($player->status, ['sold', 'unsold'], true)) {
            return response()->json(['error' => 'That result has already been changed.'], 409);
        }

        if ($player->status === 'sold' && $player->payment_status === 'paid') {
            return response()->json([
                'error' => 'A payment has already been recorded for this sale. Mark the payment as pending first, then reopen.',
            ], 409);
        }

        if ($player->player_id && DB::table('match_lineups')->where('player_id', $player->player_id)->exists()) {
            return response()->json([
                'error' => 'This player has already been named in a match lineup, so the sale can no longer be undone here.',
            ], 409);
        }

        $previous = [
            'status' => $player->status,
            'team' => $player->sold_to_team_name,
            'price' => $player->sold_price,
        ];

        DB::transaction(function () use ($auction, $player) {
            // The roster entry the sale created goes with it — otherwise the
            // team keeps a player it no longer bought.
            if ($player->player_id) {
                Player::query()->whereKey($player->player_id)->delete();
            }

            // A "you were sold" message still waiting in the queue must not go
            // out for a sale that no longer stands.
            Notification::query()
                ->where('event', 'auction_player_sold')
                ->where('related_type', 'auction_player')
                ->where('related_id', $player->id)
                ->where('status', 'queued')
                ->update(['status' => 'skipped', 'error' => 'Sale was undone before the message was sent']);

            $player->fill([
                'status' => 'in_hammer',
                'sold_price' => null,
                'sold_to_team_id' => null,
                'sold_to_team_name' => null,
                'payment_status' => 'pending',
                'payment_amount' => null,
                'player_id' => null,
            ])->save();

            // The bid that stood when the hammer fell is still on the auction
            // row — the sale never cleared it — so bidding resumes from there.
            $auction->hammer_state = 'bidding';
            $auction->save();
        });

        $auction->refresh();
        $purses = $this->auctions->teamPurses($auction);

        $actor = $request->user();
        Audit::log([
            'organization_id' => $auction->organization_id,
            'user_id' => $actor?->id ?? '',
            'user_name' => $actor?->name ?? '',
            'user_role' => $actor?->role ?? '',
            'action' => 'AUCTION_HAMMER_REOPENED',
            'entity_type' => 'AuctionPlayer',
            'entity_id' => $player->id,
            'details' => $previous['status'] === 'sold'
                ? sprintf('Undid the sale of [%s] to [%s] for %s; bidding reopened.', $player->full_name, $previous['team'], $previous['price'])
                : sprintf('Undid the unsold call on [%s]; bidding reopened.', $player->full_name),
            'ip_address' => $request->ip(),
        ]);

        $this->realtime->toRoom("auction:{$auction->id}", 'HAMMER_REOPENED', [
            'auction' => $auction,
            'player' => $player,
            'team_purses' => $purses,
        ]);

        return response()->json([
            'auction' => $auction,
            'player' => $player,
            'team_purses' => $purses,
        ]);
    }

    /**
     * Return every unsold player to the pool at a 25% discount for a second,
     * faster round.
     */
    public function acceleratedRound(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $unsold = AuctionPlayer::query()
            ->where('auction_id', $auction->id)
            ->where('status', 'unsold')
            ->get();

        if ($unsold->isEmpty()) {
            return response()->json(['error' => 'No unsold players to re-auction'], 400);
        }

        DB::transaction(function () use ($unsold, $auction) {
            foreach ($unsold as $player) {
                $player->status = 'approved';
                $player->base_price = max(500, round($player->base_price * 0.75));
                $player->save();
            }

            $auction->accelerated_round_active = true;
            $auction->save();
        });

        $auction->refresh();

        $this->realtime->toRoom("auction:{$auction->id}", 'ACCELERATED_ROUND_STARTED', [
            'auction' => $auction,
            'unsold_count' => $unsold->count(),
            'team_purses' => $this->auctions->teamPurses($auction),
        ]);

        return response()->json([
            'message' => sprintf('Accelerated round started for %d players', $unsold->count()),
            'count' => $unsold->count(),
        ]);
    }

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        // Changing an auction's status is an auctioneer action, so the role
        // matters as well as the tenant — a team manager shares the
        // organization but must not be able to cancel the auction.
        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $data = $request->validate([
            'status' => ['required', 'string', 'in:draft,upcoming,registration_open,registration_closed,live,paused,completed,cancelled'],
        ], [
            'status.required' => 'Status is required',
        ]);

        DB::transaction(function () use ($auction, $data) {
            $auction->status = $data['status'];
            $auction->save();

            Tournament::query()
                ->whereKey($auction->tournament_id)
                ->update(['auction_status' => $data['status'], 'updated_at' => now()]);
        });

        $auction->refresh();

        $this->realtime->toRoom("auction:{$auction->id}", 'AUCTION_STATUS_CHANGED', [
            'auction' => $auction,
            'status' => $data['status'],
        ]);

        return response()->json([
            'message' => "Auction status updated to {$data['status']}",
            'auction' => $auction,
        ]);
    }

    /**
     * Post-auction player payment report and settlement summary.
     *
     * In virtual-money auctions, team purses are bidding points. After the auction
     * finishes, the final hammer price forms the player's real-money entitlement.
     * This endpoint produces the full disbursement roster and settlement status.
     */
    public function paymentReport(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        // Phone numbers and money owed — for the organizer only.
        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $tournament = Tournament::find($auction->tournament_id);
        $organization = Organization::find($auction->organization_id);
        $players = AuctionPlayer::query()->where('auction_id', $auction->id)->get();
        $soldPlayers = $players->where('status', 'sold')->sortByDesc('sold_price')->values();

        $totalEntitled = (float) $soldPlayers->sum('sold_price');
        $paidPlayers = $soldPlayers->where('payment_status', 'paid');
        $pendingPlayers = $soldPlayers->where('payment_status', '!=', 'paid');
        $totalPaid = (float) $paidPlayers->sum(fn ($p) => (float) ($p->payment_amount ?? $p->sold_price ?? 0));
        $totalPending = max(0, $totalEntitled - $totalPaid);

        // Group disbursements by acquiring team
        $teams = Team::query()->where('tournament_id', $auction->tournament_id)->get();
        if ($teams->isEmpty()) {
            $teams = Team::query()->where('organization_id', $auction->organization_id)->get();
        }

        $teamSummaries = $teams->map(function (Team $team) use ($soldPlayers, $auction) {
            $teamSold = $soldPlayers->where('sold_to_team_id', $team->id);
            $entitled = (float) $teamSold->sum('sold_price');
            $paid = (float) $teamSold->where('payment_status', 'paid')->sum(fn ($p) => (float) ($p->payment_amount ?? $p->sold_price ?? 0));
            $pending = max(0, $entitled - $paid);

            return [
                'team_id' => $team->id,
                'team_name' => $team->name,
                'logo' => $team->logo,
                'manager_name' => $team->manager_name ?? '',
                'manager_phone' => $team->manager_phone ?? '',
                'virtual_purse' => $auction->team_purse,
                'virtual_spent' => $entitled,
                'virtual_remaining' => max(0, $auction->team_purse - $entitled),
                'players_acquired_count' => $teamSold->count(),
                'total_player_entitlement' => $entitled,
                'paid_amount' => $paid,
                'pending_amount' => $pending,
                'paid_count' => $teamSold->where('payment_status', 'paid')->count(),
                'pending_count' => $teamSold->where('payment_status', '!=', 'paid')->count(),
            ];
        })->values()->all();

        return response()->json([
            'auction' => $auction,
            'tournament' => $tournament,
            'organization' => $organization,
            'summary' => [
                'total_sold_players' => $soldPlayers->count(),
                'total_entitled_amount' => $totalEntitled,
                'total_paid_amount' => $totalPaid,
                'total_pending_amount' => $totalPending,
                'paid_players_count' => $paidPlayers->count(),
                'pending_players_count' => $pendingPlayers->count(),
                'settlement_percentage' => $totalEntitled > 0 ? round(($totalPaid / $totalEntitled) * 100, 1) : 0,
                'average_player_payout' => $soldPlayers->count() > 0 ? (int) round($totalEntitled / $soldPlayers->count()) : 0,
                'highest_payout' => (float) ($soldPlayers->first()?->sold_price ?? 0),
                'highest_payout_player' => $soldPlayers->first(),
            ],
            'team_summaries' => $teamSummaries,
            'sold_players' => $soldPlayers,
            'virtual_money_disclaimer' => 'Virtual money used during bidding has no cash value. Real-money disbursements to players are settled separately by the tournament organizer.',
        ]);
    }

    /**
     * Record or toggle a player's real-money payment settlement status.
     */
    public function updatePlayerPayment(Request $request, string $id, string $playerId): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $player = AuctionPlayer::query()->whereKey($playerId)->where('auction_id', $auction->id)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found in this auction pool'], 404);
        }

        $data = $request->validate([
            'payment_status' => ['required', 'string', 'in:pending,paid'],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'in:cash,upi,bank_transfer,cheque,other'],
            'payment_reference' => ['nullable', 'string', 'max:255'],
            'payment_notes' => ['nullable', 'string', 'max:1000'],
            'paid_at' => ['nullable', 'string'],
        ]);

        $status = $data['payment_status'];
        $amount = isset($data['payment_amount']) ? (float) $data['payment_amount'] : ($player->sold_price ?? $player->base_price);
        $paidAt = $status === 'paid' ? ($data['paid_at'] ?? now()->format('Y-m-d\TH:i:s.v\Z')) : null;

        $player->fill([
            'payment_status' => $status,
            'payment_amount' => $amount,
            'payment_method' => $status === 'paid' ? ($data['payment_method'] ?? $player->payment_method ?? 'cash') : null,
            'payment_reference' => $status === 'paid' ? ($data['payment_reference'] ?? $player->payment_reference) : null,
            'payment_notes' => $data['payment_notes'] ?? $player->payment_notes,
            'paid_at' => $paidAt,
            'paid_by_user_id' => $status === 'paid' ? $request->user()->id : null,
        ])->save();

        $this->realtime->toRoom("auction:{$auction->id}", 'PLAYER_PAYMENT_UPDATED', [
            'player' => $player,
            'payment_status' => $status,
        ]);

        return response()->json([
            'message' => "Player payment marked as {$status}",
            'player' => $player,
        ]);
    }

    /**
     * Batch update payment settlement status for multiple or all sold players.
     */
    public function bulkUpdatePayments(Request $request, string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $data = $request->validate([
            'player_ids' => ['nullable', 'array'],
            'player_ids.*' => ['string'],
            'payment_status' => ['required', 'string', 'in:pending,paid'],
            'payment_method' => ['nullable', 'string', 'in:cash,upi,bank_transfer,cheque,other'],
            'payment_reference' => ['nullable', 'string', 'max:255'],
            'payment_notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $query = AuctionPlayer::query()
            ->where('auction_id', $auction->id)
            ->where('status', 'sold');

        if (! empty($data['player_ids'])) {
            $query->whereIn('id', $data['player_ids']);
        }

        $players = $query->get();
        $status = $data['payment_status'];
        $now = now()->format('Y-m-d\TH:i:s.v\Z');
        $userId = $request->user()->id;

        DB::transaction(function () use ($players, $status, $data, $now, $userId) {
            foreach ($players as $player) {
                $player->fill([
                    'payment_status' => $status,
                    'payment_amount' => $player->sold_price ?? $player->base_price,
                    'payment_method' => $status === 'paid' ? ($data['payment_method'] ?? 'cash') : null,
                    'payment_reference' => $status === 'paid' ? ($data['payment_reference'] ?? null) : null,
                    'payment_notes' => $data['payment_notes'] ?? null,
                    'paid_at' => $status === 'paid' ? $now : null,
                    'paid_by_user_id' => $status === 'paid' ? $userId : null,
                ])->save();
            }
        });

        $this->realtime->toRoom("auction:{$auction->id}", 'PLAYER_PAYMENTS_BULK_UPDATED', [
            'payment_status' => $status,
            'count' => $players->count(),
        ]);

        return response()->json([
            'message' => "Updated payment status to {$status} for {$players->count()} players",
            'count' => $players->count(),
        ]);
    }

    /**
     * Auctioneer controls belong to whoever runs the tournament. Team managers
     * take part in the auction; they do not conduct it.
     */
    /**
     * The auction pool, with contact details only for the organizer running it —
     * the arena, TV screen and public hub read these endpoints anonymously.
     */
    private function visiblePlayers(Request $request, Auction $auction): \Illuminate\Support\Collection
    {
        $players = AuctionPlayer::query()->where('auction_id', $auction->id)->get();

        if ($request->user() && ! $this->denyNonAuctioneer($request, $auction)) {
            return $players;
        }

        return $players->each(fn (AuctionPlayer $player) => $player->makeHidden(['mobile', 'email']));
    }

    private function denyNonAuctioneer(Request $request, Auction $auction): ?JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        if ($user->role === 'SUPER_ADMIN') {
            return null;
        }

        if ($user->role !== 'ORG_ADMIN' || $auction->organization_id !== $user->organization_id) {
            return response()->json([
                'error' => 'Only the tournament organizer can run the auction.',
            ], 403);
        }

        return null;
    }

    private function setPoolStatus(Request $request, string $auctionId, string $playerId, string $status, string $event, string $message): JsonResponse
    {
        $auction = Auction::find($auctionId);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if ($denied = $this->denyNonAuctioneer($request, $auction)) {
            return $denied;
        }

        $player = AuctionPlayer::query()->whereKey($playerId)->where('auction_id', $auction->id)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found in this auction'], 404);
        }

        if (in_array($player->status, ['sold', 'in_hammer'], true)) {
            return response()->json(['error' => 'A player who is sold or on the hammer cannot be changed.'], 400);
        }

        $player->status = $status;
        $player->save();

        $this->realtime->toRoom("auction:{$auction->id}", $event, ['player' => $player]);

        return response()->json(['message' => $message, 'player' => $player]);
    }
}
