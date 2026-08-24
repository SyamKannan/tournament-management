<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Auction;
use App\Models\AuctionBid;
use App\Models\AuctionPlayer;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\AuctionService;
use App\Services\RealtimeBroadcaster;
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
    ) {}

    /* ------------------------------------------------------------- Reading */

    public function forTournament(string $tournamentId): JsonResponse
    {
        $auction = Auction::query()->where('tournament_id', $tournamentId)->first() ?? Auction::query()->first();

        if (! $auction) {
            return response()->json(['error' => 'No auction found for this tournament'], 404);
        }

        $players = AuctionPlayer::query()->where('auction_id', $auction->id)->get();

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
    public function show(string $id): JsonResponse
    {
        $auction = Auction::find($id) ?? Auction::query()->first();

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        $players = AuctionPlayer::query()->where('auction_id', $auction->id)->get();

        return response()->json([
            'auction' => $auction,
            'tournament' => Tournament::find($auction->tournament_id)
                ?? Tournament::query()->where('organization_id', $auction->organization_id)->first()
                ?? Tournament::query()->first(),
            'organization' => Organization::find($auction->organization_id) ?? Organization::query()->first(),
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
    public function summary(string $id): JsonResponse
    {
        $auction = Auction::find($id) ?? Auction::query()->first();

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        $players = AuctionPlayer::query()->where('auction_id', $auction->id)->get();
        $sold = $players->where('status', 'sold')->sortByDesc('sold_price')->values();
        $totalSpent = (float) $sold->sum('sold_price');

        return response()->json([
            'auction' => $auction,
            'tournament' => Tournament::find($auction->tournament_id) ?? Tournament::query()->first(),
            'organization' => Organization::find($auction->organization_id) ?? Organization::query()->first(),
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
            ],
            'sold_players' => $sold,
            'unsold_players' => $players->where('status', 'unsold')->values(),
            'pending_players' => $players->where('status', 'registered')->values(),
            'approved_players' => $players->whereIn('status', ['approved', 'in_hammer'])->values(),
            'team_purses' => $this->auctions->teamPurses($auction),
            'bid_history' => $auction->bidHistory,
        ]);
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

        if ($denied = $this->denyForeignTenant($request, $player->organization_id)) {
            return $denied;
        }

        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:registered,approved,in_hammer,sold,unsold,rejected'],
            'category' => ['sometimes', 'string', 'in:Icon,Category A,Category B,Category C,Emerging'],
            'base_price' => ['sometimes', 'numeric', 'min:0'],
        ]);

        $player->fill($data)->save();

        return response()->json($player);
    }

    public function approvePlayer(string $id, string $playerId): JsonResponse
    {
        return $this->setPoolStatus($id, $playerId, 'approved', 'PLAYER_APPROVED', 'Player approved for auction pool');
    }

    public function rejectPlayer(string $id, string $playerId): JsonResponse
    {
        return $this->setPoolStatus($id, $playerId, 'rejected', 'PLAYER_REJECTED', 'Player registration rejected');
    }

    public function removePlayer(string $id, string $playerId): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        $player = AuctionPlayer::query()->whereKey($playerId)->where('auction_id', $auction->id)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
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

        $data = $request->validate(['player_id' => ['required', 'string']]);

        $player = AuctionPlayer::query()->whereKey($data['player_id'])->where('auction_id', $auction->id)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found in this auction pool'], 404);
        }

        DB::transaction(function () use ($auction, $player) {
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
            'team_id' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'min:0'],
        ]);

        $team = Team::find($data['team_id']);

        if (! $team) {
            return response()->json(['error' => 'Team not found'], 404);
        }

        $player = AuctionPlayer::find($auction->current_player_id);

        if (! $player) {
            return response()->json(['error' => 'Active player not found'], 404);
        }

        $bidAmount = (float) $data['amount'];
        $hasStandingBid = (bool) $auction->current_bid_team_id;
        $minimumRequired = ($auction->current_bid_amount ?: $player->base_price)
            + ($hasStandingBid ? $auction->min_bid_increment : 0);

        if ($hasStandingBid && $bidAmount < $minimumRequired) {
            return response()->json([
                'error' => 'Minimum bid must be at least ₹'.number_format($minimumRequired),
            ], 400);
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
    public function sellPlayer(string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if (! $auction->current_player_id) {
            return response()->json(['error' => 'No player on the hammer'], 400);
        }

        $player = AuctionPlayer::find($auction->current_player_id);

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
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

        return response()->json([
            'auction' => $auction,
            'player' => $player,
            'team' => $team,
            'team_purses' => $purses,
        ]);
    }

    public function unsoldPlayer(string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        if (! $auction->current_player_id) {
            return response()->json(['error' => 'No player on the hammer'], 400);
        }

        $player = AuctionPlayer::find($auction->current_player_id);

        if (! $player) {
            return response()->json(['error' => 'Player not found'], 404);
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
     * Return every unsold player to the pool at a 25% discount for a second,
     * faster round.
     */
    public function acceleratedRound(string $id): JsonResponse
    {
        $auction = Auction::find($id);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
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

        if ($denied = $this->denyForeignTenant($request, $auction->organization_id)) {
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

    private function setPoolStatus(string $auctionId, string $playerId, string $status, string $event, string $message): JsonResponse
    {
        $auction = Auction::find($auctionId);

        if (! $auction) {
            return response()->json(['error' => 'Auction not found'], 404);
        }

        $player = AuctionPlayer::query()->whereKey($playerId)->where('auction_id', $auction->id)->first();

        if (! $player) {
            return response()->json(['error' => 'Player not found in this auction'], 404);
        }

        $player->status = $status;
        $player->save();

        $this->realtime->toRoom("auction:{$auction->id}", $event, ['player' => $player]);

        return response()->json(['message' => $message, 'player' => $player]);
    }
}
