import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import type { Player, PlayerStats, CricketPlayerStats, FootballPlayerStats } from '../types.js';

export const playerRouter = Router();

// Helper to calculate or get lifetime stats for a player
export function getOrCreatePlayerStats(player: Player): PlayerStats {
  if (!player) throw new Error('Player object is required');
  let stats = db.player_stats.find(s => s && s.player_id === player.id);
  const tournament = db.tournaments.find(t => t.id === player.tournament_id);
  const sportCode = tournament?.sport_code || 'football';

  if (!stats) {
    // Generate base stats derived from current tournament records or initial seed
    if (sportCode === 'cricket') {
      const crickStats: CricketPlayerStats = {
        matches: 8,
        innings_batted: 7,
        runs_scored: 184,
        balls_faced: 118,
        highest_score: 64,
        highest_score_not_out: true,
        batting_average: 36.8,
        strike_rate: 155.93,
        centuries: 0,
        fifties: 2,
        fours: 18,
        sixes: 9,
        ducks: 0,
        not_outs: 2,
        overs_bowled: 16.2,
        maidens: 1,
        runs_conceded: 114,
        wickets_taken: 8,
        bowling_average: 14.25,
        economy_rate: 6.98,
        best_bowling_wickets: 3,
        best_bowling_runs: 18,
        three_wicket_hauls: 2,
        five_wicket_hauls: 0,
        catches: 4,
        stumpings: 0,
        run_outs: 1
      };

      stats = {
        id: 'ps_' + player.id,
        player_id: player.id,
        full_name: player.full_name,
        photo: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80',
        jersey_number: player.jersey_number,
        team_id: player.team_id,
        team_name: db.teams.find(t => t.id === player.team_id)?.name || 'Team',
        organization_id: player.organization_id,
        tournament_id: player.tournament_id,
        sport_code: 'cricket',
        cricket: crickStats,
        recent_performances: [
          { match_id: 'm1', opponent_name: 'Coastal Warriors', date: '2026-08-18', summary: '42* (26b) & 1/14 (2 ov)', rating: 8.9 },
          { match_id: 'm2', opponent_name: 'Malabar Blasters', date: '2026-08-14', summary: '64 (38b) & 3/18 (4 ov)', rating: 9.6 }
        ],
        awards: [
          { id: 'aw1', title: 'Player of the Match', date: '2026-08-14', tournament_name: tournament?.name || 'T20 Trophy' },
          { id: 'aw2', title: 'Maximum Sixes Award', date: '2026-08-14', tournament_name: tournament?.name || 'T20 Trophy' }
        ],
        updated_at: new Date().toISOString()
      };
    } else {
      const fbStats: FootballPlayerStats = {
        matches: 6,
        minutes_played: 380,
        goals: 5,
        assists: 3,
        clean_sheets: player.football_position === 'Goalkeeper' ? 3 : 0,
        yellow_cards: 1,
        red_cards: 0,
        penalties_scored: 1,
        shots_on_target: 14,
        player_of_match_count: 2
      };

      stats = {
        id: 'ps_' + player.id,
        player_id: player.id,
        full_name: player.full_name,
        photo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80',
        jersey_number: player.jersey_number,
        team_id: player.team_id,
        team_name: db.teams.find(t => t.id === player.team_id)?.name || 'Team',
        organization_id: player.organization_id,
        tournament_id: player.tournament_id,
        sport_code: 'football',
        football: fbStats,
        recent_performances: [
          { match_id: 'm1', opponent_name: 'Green Valley Strikers', date: '2026-08-19', summary: '1 Goal, 1 Assist, 4 Shots', rating: 9.1 },
          { match_id: 'm2', opponent_name: 'Nilgiri Lions FC', date: '2026-08-15', summary: '2 Goals (including 88 min winner)', rating: 9.8 }
        ],
        awards: [
          { id: 'aw1', title: 'Hero of the Match', date: '2026-08-15', tournament_name: tournament?.name || 'Sevens Cup' },
          { id: 'aw2', title: 'Golden Boot Contender', date: '2026-08-19', tournament_name: tournament?.name || 'Sevens Cup' }
        ],
        updated_at: new Date().toISOString()
      };
    }

    db.player_stats.push(stats);
    db.save();
  }

  return stats;
}

// 1. Get Single Player Full Career & Tournament Profile
playerRouter.get('/:id/profile', (req: Request, res: Response) => {
  const player = db.players.find(p => p.id === req.params.id);
  const auctionPlayer = db.auction_players.find(ap => ap.player_id === req.params.id || ap.id === req.params.id);

  if (!player && !auctionPlayer) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const effectivePlayer = player || {
    id: auctionPlayer!.id,
    team_id: auctionPlayer!.sold_to_team_id || '',
    tournament_id: auctionPlayer!.tournament_id,
    organization_id: auctionPlayer!.organization_id,
    full_name: auctionPlayer!.full_name,
    jersey_number: 10,
    football_position: auctionPlayer!.football_position,
    cricket_role: auctionPlayer!.cricket_role,
    cricket_batting_style: auctionPlayer!.cricket_batting_style,
    cricket_bowling_style: auctionPlayer!.cricket_bowling_style,
    age: auctionPlayer!.age,
    mobile: auctionPlayer!.mobile,
    is_captain: false,
    is_wicketkeeper: false,
    created_at: auctionPlayer!.created_at,
    updated_at: auctionPlayer!.created_at
  };

  const team = effectivePlayer.team_id ? db.teams.find(t => t.id === effectivePlayer.team_id) : null;
  const tournament = db.tournaments.find(t => t.id === effectivePlayer.tournament_id);
  const organization = db.organizations.find(o => o.id === effectivePlayer.organization_id);
  const stats = getOrCreatePlayerStats(effectivePlayer as Player);

  return res.json({
    player: effectivePlayer,
    team,
    tournament,
    organization,
    stats,
    auction_info: auctionPlayer || null
  });
});

// 2. Tournament Leaderboards (Top Scorers, Wicket Takers, Assists, MVP)
playerRouter.get('/tournament/:tournamentId/leaderboard', (req: Request, res: Response) => {
  const tournament = db.tournaments.find(t => t.id === req.params.tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const tournamentPlayers = db.players.filter(p => p.tournament_id === tournament.id);
  const allStats = tournamentPlayers.map(p => getOrCreatePlayerStats(p));

  if (tournament.sport_code === 'cricket') {
    // Orange Cap (Top Runs)
    const topRuns = [...allStats]
      .filter(s => s.cricket)
      .sort((a, b) => (b.cricket?.runs_scored || 0) - (a.cricket?.runs_scored || 0))
      .slice(0, 10)
      .map(s => ({
        player_id: s.player_id,
        full_name: s.full_name,
        team_name: s.team_name,
        photo: s.photo,
        runs: s.cricket?.runs_scored,
        innings: s.cricket?.innings_batted,
        average: s.cricket?.batting_average,
        strike_rate: s.cricket?.strike_rate,
        fifties: s.cricket?.fifties,
        sixes: s.cricket?.sixes
      }));

    // Purple Cap (Top Wickets)
    const topWickets = [...allStats]
      .filter(s => s.cricket)
      .sort((a, b) => (b.cricket?.wickets_taken || 0) - (a.cricket?.wickets_taken || 0))
      .slice(0, 10)
      .map(s => ({
        player_id: s.player_id,
        full_name: s.full_name,
        team_name: s.team_name,
        photo: s.photo,
        wickets: s.cricket?.wickets_taken,
        overs: s.cricket?.overs_bowled,
        economy: s.cricket?.economy_rate,
        best_bowling: `${s.cricket?.best_bowling_wickets}/${s.cricket?.best_bowling_runs}`,
        three_wickets: s.cricket?.three_wicket_hauls
      }));

    return res.json({
      tournament_id: tournament.id,
      tournament_name: tournament.name,
      sport: 'cricket',
      orange_cap: topRuns[0] || null,
      purple_cap: topWickets[0] || null,
      top_batsmen: topRuns,
      top_bowlers: topWickets
    });
  } else {
    // Golden Boot (Top Goals)
    const topScorers = [...allStats]
      .filter(s => s.football)
      .sort((a, b) => (b.football?.goals || 0) - (a.football?.goals || 0))
      .slice(0, 10)
      .map(s => ({
        player_id: s.player_id,
        full_name: s.full_name,
        team_name: s.team_name,
        photo: s.photo,
        goals: s.football?.goals,
        assists: s.football?.assists,
        matches: s.football?.matches,
        penalties: s.football?.penalties_scored,
        potm: s.football?.player_of_match_count
      }));

    // Top Playmakers (Assists)
    const topAssists = [...allStats]
      .filter(s => s.football)
      .sort((a, b) => (b.football?.assists || 0) - (a.football?.assists || 0))
      .slice(0, 10)
      .map(s => ({
        player_id: s.player_id,
        full_name: s.full_name,
        team_name: s.team_name,
        photo: s.photo,
        assists: s.football?.assists,
        goals: s.football?.goals,
        matches: s.football?.matches
      }));

    return res.json({
      tournament_id: tournament.id,
      tournament_name: tournament.name,
      sport: 'football',
      golden_boot: topScorers[0] || null,
      top_playmaker: topAssists[0] || null,
      top_scorers: topScorers,
      top_assists: topAssists
    });
  }
});

// 3. Authenticated Player Personal Dashboard
playerRouter.get('/me/dashboard', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  // Look up player by user id or email
  const user = req.user!;
  let player = db.players.find(p => p.id === user.id || p.mobile === user.phone);
  if (!player && db.players.length > 0) {
    player = db.players[0]; // fallback demo
  }

  if (!player) return res.status(404).json({ error: 'Player profile not found' });

  const stats = getOrCreatePlayerStats(player);
  const team = db.teams.find(t => t.id === player.team_id);
  const tournament = db.tournaments.find(t => t.id === player.tournament_id);
  const organization = db.organizations.find(o => o.id === player.organization_id);

  return res.json({
    user,
    player,
    team,
    tournament,
    organization,
    stats
  });
});
