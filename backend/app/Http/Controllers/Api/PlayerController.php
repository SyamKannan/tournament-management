<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuctionPlayer;
use App\Models\Organization;
use App\Models\Player;
use App\Models\PlayerStat;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\PlayerStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Player profiles, tournament leaderboards and the signed-in player's dashboard.
 */
class PlayerController extends Controller
{
    public function __construct(private readonly PlayerStatsService $stats) {}

    /**
     * Full profile for a squad player, or for someone who only exists in an
     * auction pool so far.
     */
    public function profile(string $id): JsonResponse
    {
        $player = Player::find($id);
        $auctionPlayer = AuctionPlayer::query()
            ->where('player_id', $id)
            ->orWhere('id', $id)
            ->first();

        if (! $player && ! $auctionPlayer) {
            return response()->json(['error' => 'Player not found'], 404);
        }

        $effective = $player ?? $this->playerFromAuctionEntry($auctionPlayer);

        return response()->json([
            'player' => $effective,
            'team' => $effective->team_id ? Team::find($effective->team_id) : null,
            'tournament' => Tournament::find($effective->tournament_id),
            'organization' => Organization::find($effective->organization_id),
            'stats' => $this->stats->forPlayer($effective),
            'auction_info' => $auctionPlayer,
        ]);
    }

    /**
     * Tournament leaderboards — Orange/Purple Cap for cricket, Golden Boot and
     * top playmakers for football.
     */
    public function leaderboard(string $tournamentId): JsonResponse
    {
        $tournament = Tournament::find($tournamentId);

        if (! $tournament) {
            return response()->json(['error' => 'Tournament not found'], 404);
        }

        $players = Player::query()->where('tournament_id', $tournament->id)->get();
        $allStats = $players->map(fn (Player $player) => $this->stats->forPlayer($player));

        return response()->json(
            $tournament->sport_code === 'cricket'
                ? $this->cricketLeaderboard($tournament, $allStats)
                : $this->footballLeaderboard($tournament, $allStats)
        );
    }

    /**
     * The signed-in player's own dashboard.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();

        $player = Player::query()
            ->where('id', $user->id)
            ->orWhere(fn ($query) => $query->whereNotNull('mobile')->where('mobile', $user->phone))
            ->first()
            ?? Player::query()->first();

        if (! $player) {
            return response()->json(['error' => 'Player profile not found'], 404);
        }

        return response()->json([
            'user' => $user->toAuthPayload(),
            'player' => $player,
            'team' => Team::find($player->team_id),
            'tournament' => Tournament::find($player->tournament_id),
            'organization' => Organization::find($player->organization_id),
            'stats' => $this->stats->forPlayer($player),
        ]);
    }

    /* ------------------------------------------------------------- Helpers */

    /**
     * Present an auction-pool entry as a player so profiles render before the
     * player has been bought into a squad.
     */
    private function playerFromAuctionEntry(AuctionPlayer $entry): Player
    {
        return new Player([
            'id' => $entry->id,
            'team_id' => $entry->sold_to_team_id ?? '',
            'tournament_id' => $entry->tournament_id,
            'organization_id' => $entry->organization_id,
            'full_name' => $entry->full_name,
            'jersey_number' => 10,
            'football_position' => $entry->football_position,
            'cricket_role' => $entry->cricket_role,
            'cricket_batting_style' => $entry->cricket_batting_style,
            'cricket_bowling_style' => $entry->cricket_bowling_style,
            'age' => $entry->age,
            'mobile' => $entry->mobile,
            'is_captain' => false,
            'is_wicketkeeper' => false,
            'created_at' => $entry->created_at,
            'updated_at' => $entry->created_at,
        ]);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, PlayerStat>  $allStats
     */
    private function cricketLeaderboard(Tournament $tournament, $allStats): array
    {
        $batters = $allStats
            ->filter(fn (PlayerStat $stat) => is_array($stat->cricket))
            ->sortByDesc(fn (PlayerStat $stat) => $stat->cricket['runs_scored'] ?? 0)
            ->take(10)
            ->map(fn (PlayerStat $stat) => [
                'player_id' => $stat->player_id,
                'full_name' => $stat->full_name,
                'team_name' => $stat->team_name,
                'photo' => $stat->photo,
                'runs' => $stat->cricket['runs_scored'] ?? 0,
                'innings' => $stat->cricket['innings_batted'] ?? 0,
                'average' => $stat->cricket['batting_average'] ?? 0,
                'strike_rate' => $stat->cricket['strike_rate'] ?? 0,
                'fifties' => $stat->cricket['fifties'] ?? 0,
                'sixes' => $stat->cricket['sixes'] ?? 0,
            ])->values();

        $bowlers = $allStats
            ->filter(fn (PlayerStat $stat) => is_array($stat->cricket))
            ->sortByDesc(fn (PlayerStat $stat) => $stat->cricket['wickets_taken'] ?? 0)
            ->take(10)
            ->map(fn (PlayerStat $stat) => [
                'player_id' => $stat->player_id,
                'full_name' => $stat->full_name,
                'team_name' => $stat->team_name,
                'photo' => $stat->photo,
                'wickets' => $stat->cricket['wickets_taken'] ?? 0,
                'overs' => $stat->cricket['overs_bowled'] ?? 0,
                'economy' => $stat->cricket['economy_rate'] ?? 0,
                'best_bowling' => ($stat->cricket['best_bowling_wickets'] ?? 0).'/'.($stat->cricket['best_bowling_runs'] ?? 0),
                'three_wickets' => $stat->cricket['three_wicket_hauls'] ?? 0,
            ])->values();

        return [
            'tournament_id' => $tournament->id,
            'tournament_name' => $tournament->name,
            'sport' => 'cricket',
            'orange_cap' => $batters->first(),
            'purple_cap' => $bowlers->first(),
            'top_batsmen' => $batters,
            'top_bowlers' => $bowlers,
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, PlayerStat>  $allStats
     */
    private function footballLeaderboard(Tournament $tournament, $allStats): array
    {
        $withFootball = $allStats->filter(fn (PlayerStat $stat) => is_array($stat->football));

        $scorers = $withFootball
            ->sortByDesc(fn (PlayerStat $stat) => $stat->football['goals'] ?? 0)
            ->take(10)
            ->map(fn (PlayerStat $stat) => [
                'player_id' => $stat->player_id,
                'full_name' => $stat->full_name,
                'team_name' => $stat->team_name,
                'photo' => $stat->photo,
                'goals' => $stat->football['goals'] ?? 0,
                'assists' => $stat->football['assists'] ?? 0,
                'matches' => $stat->football['matches'] ?? 0,
                'penalties' => $stat->football['penalties_scored'] ?? 0,
                'potm' => $stat->football['player_of_match_count'] ?? 0,
            ])->values();

        $playmakers = $withFootball
            ->sortByDesc(fn (PlayerStat $stat) => $stat->football['assists'] ?? 0)
            ->take(10)
            ->map(fn (PlayerStat $stat) => [
                'player_id' => $stat->player_id,
                'full_name' => $stat->full_name,
                'team_name' => $stat->team_name,
                'photo' => $stat->photo,
                'assists' => $stat->football['assists'] ?? 0,
                'goals' => $stat->football['goals'] ?? 0,
                'matches' => $stat->football['matches'] ?? 0,
            ])->values();

        return [
            'tournament_id' => $tournament->id,
            'tournament_name' => $tournament->name,
            'sport' => 'football',
            'golden_boot' => $scorers->first(),
            'top_playmaker' => $playmakers->first(),
            'top_scorers' => $scorers,
            'top_assists' => $playmakers,
        ];
    }
}
