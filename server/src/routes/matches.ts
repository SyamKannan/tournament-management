import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { ScoringEngine } from '../services/scoringEngine.js';
import { wsHub } from '../websocket/server.js';
import { Match } from '../types.js';

export const matchRouter = Router();

// ============================================================================
// 1. FIXTURES & MATCH MANAGEMENT
// ============================================================================

// List Matches for Tournament
matchRouter.get('/tournament/:tournamentId', (req: Request, res: Response) => {
  const matches = db.matches.filter(m => m.tournament_id === req.params.tournamentId);
  
  const enriched = matches.map(m => {
    const teamA = db.teams.find(t => t.id === m.team_a_id);
    const teamB = db.teams.find(t => t.id === m.team_b_id);
    const venue = m.venue_id ? db.venues.find(v => v.id === m.venue_id) : null;
    const fbState = m.sport_code === 'football' ? db.football_matches.find(f => f.match_id === m.id) : null;
    const crickState = m.sport_code === 'cricket' ? db.cricket_matches.find(c => c.match_id === m.id) : null;

    return {
      ...m,
      team_a: teamA,
      team_b: teamB,
      venue,
      football_state: fbState,
      cricket_state: crickState
    };
  });

  return res.json(enriched);
});

// Get Single Match Details (Scorer / Viewer)
matchRouter.get('/:id', (req: Request, res: Response) => {
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const tournament = db.tournaments.find(t => t.id === match.tournament_id);
  const teamA = db.teams.find(t => t.id === match.team_a_id);
  const teamB = db.teams.find(t => t.id === match.team_b_id);
  const playersA = db.players.filter(p => p.team_id === match.team_a_id);
  const playersB = db.players.filter(p => p.team_id === match.team_b_id);
  const venue = match.venue_id ? db.venues.find(v => v.id === match.venue_id) : null;

  const fbState = match.sport_code === 'football' ? ScoringEngine.getOrCreateFootballState(match.id) : null;
  const crickState = match.sport_code === 'cricket' ? ScoringEngine.getOrCreateCricketState(match.id) : null;

  return res.json({
    match,
    tournament,
    team_a: { ...teamA, players: playersA },
    team_b: { ...teamB, players: playersB },
    venue,
    football_state: fbState,
    cricket_state: crickState
  });
});

// Auto-Generate Fixtures (Round Robin or Knockout)
matchRouter.post('/auto-generate-fixtures', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { tournament_id, format = 'round_robin', start_date } = req.body;
  const tournament = db.tournaments.find(t => t.id === tournament_id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && tournament.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const approvedTeams = db.teams.filter(t => t.tournament_id === tournament_id && t.status === 'approved');
  if (approvedTeams.length < 2) {
    return res.status(400).json({ error: 'At least 2 approved teams are required to generate fixtures' });
  }

  const newMatches: Match[] = [];
  const venues = db.venues.filter(v => v.organization_id === tournament.organization_id);
  const defaultVenueId = venues[0]?.id;
  const baseDate = start_date ? new Date(start_date) : new Date();
  let matchNumber = db.matches.filter(m => m.tournament_id === tournament_id).length + 1;

  if (format === 'knockout') {
    // Single Elimination Bracket
    for (let i = 0; i < approvedTeams.length; i += 2) {
      if (i + 1 < approvedTeams.length) {
        const sched = new Date(baseDate.getTime() + Math.floor(i / 2) * 2 * 60 * 60 * 1000).toISOString();
        const m: Match = {
          id: 'match_' + Date.now() + '_' + i,
          tournament_id: tournament.id,
          organization_id: tournament.organization_id,
          sport_code: tournament.sport_code,
          match_number: matchNumber++,
          round_name: approvedTeams.length <= 4 ? 'Semi-Final' : 'Quarter-Final',
          team_a_id: approvedTeams[i].id,
          team_b_id: approvedTeams[i + 1].id,
          venue_id: defaultVenueId,
          scheduled_at: sched,
          status: 'scheduled',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        newMatches.push(m);
        db.matches.push(m);
      }
    }
  } else {
    // Round Robin (all vs all in group)
    for (let i = 0; i < approvedTeams.length; i++) {
      for (let j = i + 1; j < approvedTeams.length; j++) {
        const sched = new Date(baseDate.getTime() + (newMatches.length * 3) * 60 * 60 * 1000).toISOString();
        const m: Match = {
          id: 'match_' + Date.now() + '_' + i + '_' + j,
          tournament_id: tournament.id,
          organization_id: tournament.organization_id,
          sport_code: tournament.sport_code,
          match_number: matchNumber++,
          round_name: `Group Stage - Match ${newMatches.length + 1}`,
          team_a_id: approvedTeams[i].id,
          team_b_id: approvedTeams[j].id,
          venue_id: defaultVenueId,
          scheduled_at: sched,
          status: 'scheduled',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        newMatches.push(m);
        db.matches.push(m);
      }
    }
  }

  db.logAudit({
    organization_id: tournament.organization_id,
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'GENERATED_FIXTURES',
    entity_type: 'Tournament',
    entity_id: tournament.id,
    details: `Generated ${newMatches.length} fixtures for tournament [${tournament.name}]`
  });

  db.save();
  return res.status(201).json({ matches: newMatches, message: `Successfully generated ${newMatches.length} fixtures!` });
});

// Update Match Info (Schedule, Status, Delay Reason)
matchRouter.put('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && match.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  Object.assign(match, req.body, { updated_at: new Date().toISOString() });

  // Broadcast match status update
  wsHub.broadcastToRoom(`match:${match.id}`, 'MATCH_STATUS_CHANGED', { match });
  wsHub.broadcastToRoom(`scoreboard:${match.id}`, 'MATCH_STATUS_CHANGED', { match });

  db.save();
  return res.json(match);
});

// ============================================================================
// 2. FOOTBALL LIVE SCORING ENGINE ENDPOINTS
// ============================================================================

matchRouter.post('/:id/football/event', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { team_id, player_id, event_type, minute, assist_player_id, sub_in_player_id, sub_out_player_id, extra_info } = req.body;
  const matchId = req.params.id as string;

  try {
    const result = ScoringEngine.addFootballEvent({
      matchId,
      teamId: team_id,
      playerId: player_id,
      eventType: event_type,
      minute: Number(minute) || 0,
      assistPlayerId: assist_player_id,
      subInPlayerId: sub_in_player_id,
      subOutPlayerId: sub_out_player_id,
      extraInfo: extra_info
    });

    const match = db.matches.find(m => m.id === matchId);

    // Broadcast over WebSockets instantly!
    wsHub.broadcastToRoom(`match:${matchId}`, 'SCORE_UPDATED', { match, state: result.state, event: result.event });
    wsHub.broadcastToRoom(`scoreboard:${matchId}`, 'SCORE_UPDATED', { match, state: result.state, event: result.event });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

matchRouter.post('/:id/football/timer', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { action, half, minute } = req.body;
  const matchId = req.params.id as string;

  try {
    const state = ScoringEngine.updateFootballTimer(matchId, action, { half, minute });
    const match = db.matches.find(m => m.id === matchId);

    wsHub.broadcastToRoom(`match:${matchId}`, 'SCORE_UPDATED', { match, state });
    wsHub.broadcastToRoom(`scoreboard:${matchId}`, 'SCORE_UPDATED', { match, state });

    return res.json({ state, match });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

matchRouter.post('/:id/football/undo', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const matchId = req.params.id as string;
  try {
    const state = ScoringEngine.undoLastFootballEvent(matchId);
    const match = db.matches.find(m => m.id === matchId);

    wsHub.broadcastToRoom(`match:${matchId}`, 'SCORE_UPDATED', { match, state });
    wsHub.broadcastToRoom(`scoreboard:${matchId}`, 'SCORE_UPDATED', { match, state });

    return res.json({ state, match });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 3. CRICKET LIVE SCORING ENGINE ENDPOINTS
// ============================================================================

matchRouter.post('/:id/cricket/ball', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { 
    innings, runs_scored, extras, extras_runs, 
    is_wicket, wicket_type, dismissed_player_id, fielder_id, commentary, 
    next_striker_id, striker_id, non_striker_id, bowler_id 
  } = req.body;
  const matchId = req.params.id as string;

  try {
    const result = ScoringEngine.recordCricketBall({
      matchId,
      innings: Number(innings) as 1 | 2,
      runsScored: Number(runs_scored) || 0,
      extras: extras || 'none',
      extrasRuns: Number(extras_runs) || 0,
      isWicket: Boolean(is_wicket),
      wicketType: wicket_type,
      dismissedPlayerId: dismissed_player_id,
      fielderId: fielder_id,
      commentary,
      nextStrikerId: next_striker_id,
      strikerId: striker_id,
      nonStrikerId: non_striker_id,
      bowlerId: bowler_id
    });

    const match = db.matches.find(m => m.id === matchId);

    wsHub.broadcastToRoom(`match:${matchId}`, 'SCORE_UPDATED', { match, state: result.state, delivery: result.delivery });
    wsHub.broadcastToRoom(`scoreboard:${matchId}`, 'SCORE_UPDATED', { match, state: result.state, delivery: result.delivery });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

matchRouter.post('/:id/cricket/undo', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const matchId = req.params.id as string;
  try {
    const state = ScoringEngine.undoLastCricketBall(matchId);
    const match = db.matches.find(m => m.id === matchId);

    wsHub.broadcastToRoom(`match:${matchId}`, 'SCORE_UPDATED', { match, state });
    wsHub.broadcastToRoom(`scoreboard:${matchId}`, 'SCORE_UPDATED', { match, state });

    return res.json({ state, match });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

matchRouter.post('/:id/cricket/switch-innings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const matchId = req.params.id as string;
  try {
    const state = ScoringEngine.switchCricketInnings(matchId);
    const match = db.matches.find(m => m.id === matchId);

    wsHub.broadcastToRoom(`match:${matchId}`, 'SCORE_UPDATED', { match, state });
    wsHub.broadcastToRoom(`scoreboard:${matchId}`, 'SCORE_UPDATED', { match, state });

    return res.json({ state, match });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// 4. DEDICATED 16:9 LARGE SCREEN SCOREBOARD PAYLOAD
// ============================================================================

matchRouter.get('/scoreboard/match/:id', (req: Request, res: Response) => {
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const tournament = db.tournaments.find(t => t.id === match.tournament_id);
  const teamA = db.teams.find(t => t.id === match.team_a_id);
  const teamB = db.teams.find(t => t.id === match.team_b_id);
  const playersA = db.players.filter(p => p.team_id === match.team_a_id);
  const playersB = db.players.filter(p => p.team_id === match.team_b_id);
  const venue = match.venue_id ? db.venues.find(v => v.id === match.venue_id) : null;

  const fbState = match.sport_code === 'football' ? ScoringEngine.getOrCreateFootballState(match.id) : null;
  const crickState = match.sport_code === 'cricket' ? ScoringEngine.getOrCreateCricketState(match.id) : null;

  // Active advertisements and sponsors for big screen broadcast
  const ads = db.advertisements.filter(a => a.organization_id === match.organization_id && a.status === 'active');
  const sponsors = db.sponsors.filter(s => s.organization_id === match.organization_id);
  const urgentAnnouncement = db.announcements.find(a => 
    a.organization_id === match.organization_id && 
    a.is_active_on_scoreboard && 
    (a.tournament_id === match.tournament_id || !a.tournament_id)
  );

  return res.json({
    match,
    tournament,
    team_a: { ...teamA, players: playersA },
    team_b: { ...teamB, players: playersB },
    venue,
    football_state: fbState,
    cricket_state: crickState,
    advertisements: ads,
    sponsors: sponsors,
    announcement: urgentAnnouncement || null
  });
});
