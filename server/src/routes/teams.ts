import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { TournamentPaymentService } from '../services/tournamentPaymentService.js';
import { Team, Player } from '../types.js';

export const teamRouter = Router();

// ============================================================================
// 1. PUBLIC TEAM REGISTRATION FLOW (Mobile-First 5-Step Wizard)
// ============================================================================

// Get Registration Page Data by Public Token
teamRouter.get('/public/registration/:token', (req: Request, res: Response) => {
  const link = db.registration_links.find(l => l.token === req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired registration link' });

  const tournament = db.tournaments.find(t => t.id === link.tournament_id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const org = db.organizations.find(o => o.id === tournament.organization_id);
  const paymentOptions = TournamentPaymentService.calculatePaymentOptions(tournament);
  const currentTeamsCount = db.teams.filter(t => t.tournament_id === tournament.id && t.status !== 'withdrawn').length;

  return res.json({
    link,
    tournament,
    organization: org,
    payment_options: paymentOptions,
    current_teams_count: currentTeamsCount,
    is_full: currentTeamsCount >= tournament.max_teams
  });
});

// Submit Public Team Registration
teamRouter.post('/public/registration/:token', (req: Request, res: Response) => {
  const link = db.registration_links.find(l => l.token === req.params.token && l.status === 'active');
  if (!link) return res.status(400).json({ error: 'Registration link is inactive or invalid' });

  const tournament = db.tournaments.find(t => t.id === link.tournament_id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const currentTeams = db.teams.filter(t => t.tournament_id === tournament.id && t.status !== 'withdrawn');
  if (currentTeams.length >= tournament.max_teams) {
    return res.status(400).json({ error: `Tournament registration is full (Max ${tournament.max_teams} teams)` });
  }

  const {
    team_name,
    short_name,
    logo,
    village,
    panchayat,
    district,
    jersey_color,
    secondary_jersey_color,
    captain_name,
    manager_name,
    manager_phone,
    manager_whatsapp,
    manager_email,
    manager_address,
    players = [],
    payment_option = 'full',
    payment_method = 'upi',
    transaction_id
  } = req.body;

  // Validation
  if (!team_name || !manager_name || !manager_phone) {
    return res.status(400).json({ error: 'Team name, manager name, and manager mobile number are required' });
  }

  // Player limits validation
  const minPlayers = tournament.settings.squad_min_players || (tournament.sport_code === 'football' ? 7 : 11);
  const maxPlayers = tournament.settings.squad_max_players || (tournament.sport_code === 'football' ? 14 : 16);

  if (players.length < minPlayers) {
    return res.status(400).json({ error: `Minimum ${minPlayers} players are required. You entered ${players.length}.` });
  }
  if (players.length > maxPlayers) {
    return res.status(400).json({ error: `Maximum ${maxPlayers} players allowed. You entered ${players.length}.` });
  }

  // Check duplicate jersey numbers
  const jerseyNumbers = players.map((p: any) => Number(p.jersey_number)).filter(Boolean);
  const uniqueJerseys = new Set(jerseyNumbers);
  if (uniqueJerseys.size !== jerseyNumbers.length) {
    return res.status(400).json({ error: 'Duplicate jersey numbers detected in the team roster. Every player must have a unique number.' });
  }

  const teamId = 'team_' + Date.now();
  const now = new Date().toISOString();

  const newTeam: Team = {
    id: teamId,
    tournament_id: tournament.id,
    organization_id: tournament.organization_id,
    name: team_name,
    short_name: short_name || team_name.substring(0, 4).toUpperCase(),
    logo: logo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80',
    village: village || '',
    panchayat: panchayat || '',
    district: district || '',
    jersey_color: jersey_color || '#3B82F6',
    secondary_jersey_color,
    captain_name: captain_name || (players[0]?.full_name ?? manager_name),
    manager_name,
    manager_phone,
    manager_whatsapp: manager_whatsapp || manager_phone,
    manager_email: manager_email || '',
    manager_address: manager_address || '',
    status: 'pending',
    group_name: 'Group A',
    created_at: now,
    updated_at: now
  };

  db.teams.push(newTeam);

  // Insert Players
  players.forEach((p: any, idx: number) => {
    const newPlayer: Player = {
      id: 'pl_' + Date.now() + '_' + idx,
      team_id: teamId,
      tournament_id: tournament.id,
      organization_id: tournament.organization_id,
      full_name: p.full_name,
      photo: p.photo,
      age: p.age ? Number(p.age) : undefined,
      dob: p.dob,
      mobile: p.mobile,
      jersey_number: Number(p.jersey_number) || (idx + 1),
      is_captain: Boolean(p.is_captain || (idx === 0)),
      is_wicketkeeper: Boolean(p.is_wicketkeeper),
      football_position: p.football_position,
      cricket_role: p.cricket_role,
      cricket_bowling_style: p.cricket_bowling_style,
      cricket_batting_style: p.cricket_batting_style,
      created_at: now,
      updated_at: now
    };
    db.players.push(newPlayer);
  });

  // Process Tournament Ground Fee Payment (Payment System 2)
  const paymentResult = TournamentPaymentService.processPayment({
    teamId: newTeam.id,
    tournamentId: tournament.id,
    organizationId: tournament.organization_id,
    paymentOption: payment_option === 'partial' ? 'partial' : 'full',
    paymentMethod: payment_method || 'online',
    transactionId: transaction_id || 'ONLINE_TXN_' + Math.random().toString(36).substring(2, 9).toUpperCase(),
    notes: `Public registration ground fee payment (${payment_option.toUpperCase()})`
  });

  // Update link registrations counter
  link.current_registrations += 1;

  db.logAudit({
    organization_id: tournament.organization_id,
    user_id: teamId,
    user_name: manager_name,
    user_role: 'TEAM_MANAGER',
    action: 'REGISTERED_TEAM_PUBLIC',
    entity_type: 'Team',
    entity_id: newTeam.id,
    details: `Team [${newTeam.name}] registered for tournament [${tournament.name}]. Ground Fee Paid: ₹${paymentResult.payment.paid_amount}`
  });

  db.save();

  return res.status(201).json({
    team: newTeam,
    payment: paymentResult.payment,
    receipt: paymentResult.receipt,
    message: 'Team registered successfully! Download or print your official registration receipt.'
  });
});

// ============================================================================
// 2. ORGANIZATION ADMIN TEAM & ROSTER MANAGEMENT
// ============================================================================

// List Teams for a Tournament
teamRouter.get('/tournament/:tournamentId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tourney = db.tournaments.find(t => t.id === req.params.tournamentId);
  if (!tourney) return res.status(404).json({ error: 'Tournament not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && tourney.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const teams = db.teams.filter(t => t.tournament_id === req.params.tournamentId);
  const enriched = teams.map(t => {
    const players = db.players.filter(p => p.team_id === t.id);
    const payment = db.registration_payments.find(p => p.team_id === t.id && p.tournament_id === t.tournament_id);
    const receipt = db.registration_receipts.find(r => r.team_id === t.id && r.tournament_id === t.tournament_id);
    return {
      ...t,
      players_count: players.length,
      players,
      payment,
      receipt
    };
  });

  return res.json(enriched);
});

// Get Single Team Details
teamRouter.get('/:id', (req: Request, res: Response) => {
  const team = db.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const players = db.players.filter(p => p.team_id === team.id);
  const payment = db.registration_payments.find(p => p.team_id === team.id);
  const receipt = db.registration_receipts.find(r => r.team_id === team.id);
  const tournament = db.tournaments.find(t => t.id === team.tournament_id);

  return res.json({ team, players, payment, receipt, tournament });
});

// Update Team Approval Status (Admin action)
teamRouter.put('/:id/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const team = db.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && team.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const { status, approval_notes, group_name } = req.body;
  if (status) team.status = status;
  if (approval_notes !== undefined) team.approval_notes = approval_notes;
  if (group_name !== undefined) team.group_name = group_name;
  team.updated_at = new Date().toISOString();

  db.logAudit({
    organization_id: team.organization_id,
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'UPDATED_TEAM_STATUS',
    entity_type: 'Team',
    entity_id: team.id,
    details: `Changed team [${team.name}] status to [${team.status}]`
  });

  db.save();
  return res.json(team);
});

// Record Ground Fee Payment (Offline Cash/UPI or Online verify)
teamRouter.post('/:id/record-payment', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const team = db.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && team.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const { payment_method, amount, transaction_id, notes, payment_option } = req.body;

  try {
    const result = TournamentPaymentService.processPayment({
      teamId: team.id,
      tournamentId: team.tournament_id,
      organizationId: team.organization_id,
      paymentOption: payment_option || 'full',
      paymentMethod: payment_method || 'cash',
      customAmount: amount ? Number(amount) : undefined,
      transactionId: transaction_id,
      notes: notes || 'Recorded by tournament administrator',
      recordedByAdmin: true,
      adminUserId: req.user!.id
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Get Registration Receipt
teamRouter.get('/:id/receipt', (req: Request, res: Response) => {
  const receipt = db.registration_receipts.find(r => r.team_id === req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
  return res.json(receipt);
});

// Add Player to Team
teamRouter.post('/:id/players', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const team = db.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const { full_name, jersey_number, football_position, cricket_role, cricket_bowling_style, cricket_batting_style, age, mobile } = req.body;
  if (!full_name || !jersey_number) {
    return res.status(400).json({ error: 'Player name and jersey number are required' });
  }

  const newPlayer: Player = {
    id: 'pl_' + Date.now(),
    team_id: team.id,
    tournament_id: team.tournament_id,
    organization_id: team.organization_id,
    full_name,
    jersey_number: Number(jersey_number),
    football_position,
    cricket_role,
    cricket_bowling_style,
    cricket_batting_style,
    age: age ? Number(age) : undefined,
    mobile,
    is_captain: Boolean(req.body.is_captain),
    is_wicketkeeper: Boolean(req.body.is_wicketkeeper),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.players.push(newPlayer);
  db.save();
  return res.status(201).json(newPlayer);
});
