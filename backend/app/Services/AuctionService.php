<?php

namespace App\Services;

use App\Models\Auction;
use App\Models\AuctionPlayer;
use App\Models\Team;
use App\Models\Tournament;
use App\Support\Ids;

/**
 * Auction setup and the derived views the live arena depends on.
 *
 * The bidding actions themselves live in the controller, since each one also
 * broadcasts to the room; this class owns the parts that are pure derivation —
 * default pricing, and how much of its purse each team has left.
 */
class AuctionService
{
    /**
     * Starting prices per category, scaled to the sport's typical purse.
     *
     * @return array<int, array{category: string, price: int}>
     */
    public function defaultBasePrices(string $sportCode): array
    {
        return $sportCode === 'cricket'
            ? [
                ['category' => 'Icon', 'price' => 20000],
                ['category' => 'Category A', 'price' => 10000],
                ['category' => 'Category B', 'price' => 5000],
                ['category' => 'Category C', 'price' => 2000],
                ['category' => 'Emerging', 'price' => 1000],
            ]
            : [
                ['category' => 'Icon', 'price' => 10000],
                ['category' => 'Category A', 'price' => 5000],
                ['category' => 'Category B', 'price' => 2500],
                ['category' => 'Category C', 'price' => 1000],
                ['category' => 'Emerging', 'price' => 500],
            ];
    }

    /**
     * Create the auction that belongs to a tournament, applying sport-aware
     * defaults for anything the organizer did not specify.
     *
     * @param  array<string, mixed>  $overrides
     */
    public function createForTournament(Tournament $tournament, array $overrides = []): Auction
    {
        $football = $tournament->sport_code === 'football';
        $basePrices = $overrides['base_prices'] ?? null;

        return Auction::create([
            'id' => Ids::timestamped('auction'),
            'tournament_id' => $tournament->id,
            'organization_id' => $tournament->organization_id,
            'title' => $overrides['auction_title'] ?? $overrides['title'] ?? $tournament->name.' Official Player Auction',
            'token' => $overrides['token'] ?? $tournament->slug.'-auction',
            'status' => $overrides['auction_status'] ?? $overrides['status'] ?? 'upcoming',
            'auction_date' => $overrides['auction_start_time'] ?? $overrides['auction_date'] ?? $tournament->start_date,
            'auction_start_time' => $overrides['auction_start_time'] ?? $tournament->start_date,
            'auction_end_time' => $overrides['auction_end_time'] ?? null,
            'team_purse' => (float) ($overrides['team_purse'] ?? 100000),
            'min_bid_increment' => (float) ($overrides['min_bid_increment'] ?? 500),
            'max_players_per_team' => (int) ($overrides['max_players_per_team'] ?? ($football ? 12 : 16)),
            'min_players_per_team' => (int) ($overrides['min_players_per_team'] ?? ($football ? 7 : 11)),
            'base_prices' => is_array($basePrices) && $basePrices !== []
                ? $basePrices
                : $this->defaultBasePrices($tournament->sport_code),
            'current_player_id' => null,
            'current_bid_amount' => 0,
            'current_bid_team_id' => null,
            'current_bid_team_name' => null,
            'hammer_state' => 'waiting',
            'hammer_timer_seconds' => 30,
        ]);
    }

    /**
     * The team a given user is allowed to bid for in this auction.
     *
     * Only team managers are bound to a single team; organizers and super
     * admins run the auction rather than bid in it, so they get null.
     */
    public function biddableTeamFor(Auction $auction, ?\App\Models\User $user): ?Team
    {
        if (! $user || $user->role !== 'TEAM_MANAGER') {
            return null;
        }

        return Team::query()
            ->where('manager_user_id', $user->id)
            ->where('tournament_id', $auction->tournament_id)
            ->first()
            ?? Team::query()->where('manager_user_id', $user->id)->first();
    }

    /**
     * How much each competing team has spent and has left.
     *
     * Falls back progressively — tournament teams, then any team in the
     * organization — so a purse table still renders while an auction is being
     * set up ahead of team approvals.
     *
     * @return array<int, array<string, mixed>>
     */
    public function teamPurses(Auction $auction): array
    {
        $teams = Team::query()->where('tournament_id', $auction->tournament_id)->get();

        if ($teams->isEmpty()) {
            $teams = Team::query()->where('organization_id', $auction->organization_id)->get();
        }

        if ($teams->isEmpty()) {
            $teams = Team::query()->limit(4)->get();
        }

        $soldPlayers = AuctionPlayer::query()
            ->where('auction_id', $auction->id)
            ->where('status', 'sold')
            ->get()
            ->groupBy('sold_to_team_id');

        return $teams->map(function (Team $team) use ($auction, $soldPlayers) {
            $bought = $soldPlayers->get($team->id) ?? collect();
            $spent = (float) $bought->sum('sold_price');

            return [
                'team_id' => $team->id,
                'team_name' => $team->name,
                'logo' => $team->logo,
                'total_purse' => $auction->team_purse,
                'spent_amount' => $spent,
                'remaining_purse' => max(0, $auction->team_purse - $spent),
                'players_bought_count' => $bought->count(),
                'max_players' => $auction->max_players_per_team,
                'bought_players' => $bought->values(),
            ];
        })->values()->all();
    }
}
