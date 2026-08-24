import { Router, Response } from 'express';
import { db } from '../db/database.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';

export const reportRouter = Router();

// Financial Report: Ground Fee Collections
reportRouter.get('/financials/:tournamentId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tournament = db.tournaments.find(t => t.id === req.params.tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const teams = db.teams.filter(t => t.tournament_id === tournament.id);
  const payments = db.registration_payments.filter(p => p.tournament_id === tournament.id);

  let totalExpected = 0;
  let totalCollected = 0;
  let totalPending = 0;

  const rows = teams.map(team => {
    const pay = payments.find(p => p.team_id === team.id);
    const expected = tournament.ground_fee || 0;
    const paid = pay ? pay.paid_amount : 0;
    const pending = Math.max(0, expected - paid);

    totalExpected += expected;
    totalCollected += paid;
    totalPending += pending;

    return {
      team_id: team.id,
      team_name: team.name,
      manager_name: team.manager_name,
      manager_phone: team.manager_phone,
      total_fee: expected,
      paid_amount: paid,
      remaining_amount: pending,
      status: pay ? pay.status : 'unpaid',
      payment_method: pay ? pay.payment_method : 'N/A',
      transaction_id: pay ? pay.transaction_id : 'N/A',
      receipt_number: pay ? pay.receipt_number : 'N/A'
    };
  });

  return res.json({
    tournament: {
      id: tournament.id,
      name: tournament.name,
      ground_fee: tournament.ground_fee,
      sport: tournament.sport_code
    },
    summary: {
      total_teams: teams.length,
      total_expected: totalExpected,
      total_collected: totalCollected,
      total_pending: totalPending,
      collection_percentage: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0
    },
    records: rows
  });
});

// Teams & Player Rosters Report
reportRouter.get('/teams-roster/:tournamentId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tournament = db.tournaments.find(t => t.id === req.params.tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const teams = db.teams.filter(t => t.tournament_id === tournament.id);
  const data = teams.map(team => {
    const players = db.players.filter(p => p.team_id === team.id);
    return {
      team: {
        id: team.id,
        name: team.name,
        short_name: team.short_name,
        village: team.village,
        captain: team.captain_name,
        manager: team.manager_name,
        phone: team.manager_phone,
        status: team.status
      },
      players: players.map(p => ({
        name: p.full_name,
        jersey: p.jersey_number,
        position: p.football_position || p.cricket_role || 'Player',
        style: p.cricket_bowling_style || p.cricket_batting_style || '',
        captain: p.is_captain ? 'Captain' : ''
      }))
    };
  });

  return res.json({ tournament_name: tournament.name, teams: data });
});
