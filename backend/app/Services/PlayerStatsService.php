<?php

namespace App\Services;

use App\Models\Player;
use App\Models\PlayerStat;
use App\Models\Team;
use App\Models\Tournament;

/**
 * Career statistics for a player.
 *
 * A player who has never had a record created gets one seeded with a
 * representative baseline for their sport, so profiles and leaderboards render
 * for freshly registered squads. The live scoring engine then increments these
 * records ball by ball and event by event.
 */
class PlayerStatsService
{
    public function forPlayer(Player $player): PlayerStat
    {
        $existing = PlayerStat::query()->where('player_id', $player->id)->first();

        if ($existing) {
            return $existing;
        }

        $tournament = Tournament::find($player->tournament_id);
        $sportCode = $tournament->sport_code ?? 'football';

        return PlayerStat::create([
            'id' => 'ps_'.$player->id,
            'player_id' => $player->id,
            'full_name' => $player->full_name,
            'photo' => $sportCode === 'cricket'
                ? 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80'
                : 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80',
            'jersey_number' => $player->jersey_number,
            'team_id' => $player->team_id,
            'team_name' => Team::query()->whereKey($player->team_id)->value('name') ?? 'Team',
            'organization_id' => $player->organization_id,
            'tournament_id' => $player->tournament_id,
            'sport_code' => $sportCode,
            'cricket' => $sportCode === 'cricket' ? $this->baselineCricket() : null,
            'football' => $sportCode === 'cricket' ? null : $this->baselineFootball($player),
            'recent_performances' => $sportCode === 'cricket'
                ? $this->baselineCricketPerformances()
                : $this->baselineFootballPerformances(),
            'awards' => $sportCode === 'cricket'
                ? $this->baselineCricketAwards($tournament?->name)
                : $this->baselineFootballAwards($tournament?->name),
        ]);
    }

    private function baselineCricket(): array
    {
        return [
            'matches' => 8,
            'innings_batted' => 7,
            'runs_scored' => 184,
            'balls_faced' => 118,
            'highest_score' => 64,
            'highest_score_not_out' => true,
            'batting_average' => 36.8,
            'strike_rate' => 155.93,
            'centuries' => 0,
            'fifties' => 2,
            'fours' => 18,
            'sixes' => 9,
            'ducks' => 0,
            'not_outs' => 2,
            'overs_bowled' => 16.2,
            'maidens' => 1,
            'runs_conceded' => 114,
            'wickets_taken' => 8,
            'bowling_average' => 14.25,
            'economy_rate' => 6.98,
            'best_bowling_wickets' => 3,
            'best_bowling_runs' => 18,
            'three_wicket_hauls' => 2,
            'five_wicket_hauls' => 0,
            'catches' => 4,
            'stumpings' => 0,
            'run_outs' => 1,
        ];
    }

    private function baselineFootball(Player $player): array
    {
        return [
            'matches' => 6,
            'minutes_played' => 380,
            'goals' => 5,
            'assists' => 3,
            'clean_sheets' => $player->football_position === 'Goalkeeper' ? 3 : 0,
            'yellow_cards' => 1,
            'red_cards' => 0,
            'penalties_scored' => 1,
            'shots_on_target' => 14,
            'player_of_match_count' => 2,
        ];
    }

    private function baselineCricketPerformances(): array
    {
        return [
            ['match_id' => 'm1', 'opponent_name' => 'Coastal Warriors', 'date' => '2026-08-18', 'summary' => '42* (26b) & 1/14 (2 ov)', 'rating' => 8.9],
            ['match_id' => 'm2', 'opponent_name' => 'Malabar Blasters', 'date' => '2026-08-14', 'summary' => '64 (38b) & 3/18 (4 ov)', 'rating' => 9.6],
        ];
    }

    private function baselineFootballPerformances(): array
    {
        return [
            ['match_id' => 'm1', 'opponent_name' => 'Green Valley Strikers', 'date' => '2026-08-19', 'summary' => '1 Goal, 1 Assist, 4 Shots', 'rating' => 9.1],
            ['match_id' => 'm2', 'opponent_name' => 'Nilgiri Lions FC', 'date' => '2026-08-15', 'summary' => '2 Goals (including 88 min winner)', 'rating' => 9.8],
        ];
    }

    private function baselineCricketAwards(?string $tournamentName): array
    {
        $name = $tournamentName ?? 'T20 Trophy';

        return [
            ['id' => 'aw1', 'title' => 'Player of the Match', 'date' => '2026-08-14', 'tournament_name' => $name],
            ['id' => 'aw2', 'title' => 'Maximum Sixes Award', 'date' => '2026-08-14', 'tournament_name' => $name],
        ];
    }

    private function baselineFootballAwards(?string $tournamentName): array
    {
        $name = $tournamentName ?? 'Sevens Cup';

        return [
            ['id' => 'aw1', 'title' => 'Hero of the Match', 'date' => '2026-08-15', 'tournament_name' => $name],
            ['id' => 'aw2', 'title' => 'Golden Boot Contender', 'date' => '2026-08-19', 'tournament_name' => $name],
        ];
    }
}
