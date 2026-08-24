import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { requireTenantAccess } from '../middleware/tenant.js';
import { BillingService } from '../services/billingService.js';
import { Tournament, RegistrationLink } from '../types.js';

export const tournamentRouter = Router();

// Public Tournament Hub (No login required)
tournamentRouter.get('/public/:slug', (req: Request, res: Response) => {
  const tournament = db.tournaments.find(t => t.slug === req.params.slug);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const org = db.organizations.find(o => o.id === tournament.organization_id);
  const teams = db.teams.filter(t => t.tournament_id === tournament.id && t.status === 'approved');
  const matches = db.matches.filter(m => m.tournament_id === tournament.id);
  const standings = db.standings.filter(s => s.tournament_id === tournament.id);
  const sponsors = db.sponsors.filter(s => s.organization_id === tournament.organization_id);
  const announcements = db.announcements.filter(a => a.organization_id === tournament.organization_id && (a.tournament_id === tournament.id || !a.tournament_id));
  const registrationLink = db.registration_links.find(l => l.tournament_id === tournament.id && l.status === 'active');

  // Match details (scores, live states)
  const matchesWithState = matches.map(m => {
    const teamA = db.teams.find(t => t.id === m.team_a_id);
    const teamB = db.teams.find(t => t.id === m.team_b_id);
    const fbState = m.sport_code === 'football' ? db.football_matches.find(f => f.match_id === m.id) : null;
    const crickState = m.sport_code === 'cricket' ? db.cricket_matches.find(c => c.match_id === m.id) : null;
    const venue = m.venue_id ? db.venues.find(v => v.id === m.venue_id) : null;

    return {
      ...m,
      team_a: teamA,
      team_b: teamB,
      venue,
      football_state: fbState,
      cricket_state: crickState
    };
  });

  return res.json({
    tournament,
    organization: org,
    teams,
    matches: matchesWithState,
    standings,
    sponsors,
    announcements,
    registration_link: registrationLink ? {
      token: registrationLink.token,
      status: registrationLink.status,
      max_teams: registrationLink.max_teams,
      current_registrations: registrationLink.current_registrations,
      deadline: registrationLink.deadline
    } : null
  });
});

// List Tournaments (Scoped to tenant or all if Super Admin)
tournamentRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  let list = db.tournaments;
  const targetOrg = req.query.organization_id as string || req.query.orgId as string;

  if (req.user!.role === 'SUPER_ADMIN') {
    if (targetOrg) list = list.filter(t => t.organization_id === targetOrg);
  } else {
    list = list.filter(t => t.organization_id === req.user!.organization_id);
  }

  // Attach metrics & teams count
  const results = list.map(t => {
    const org = db.organizations.find(o => o.id === t.organization_id);
    const teams = db.teams.filter(tm => tm.tournament_id === t.id);
    const regLink = db.registration_links.find(l => l.tournament_id === t.id);
    return {
      ...t,
      organization_name: org?.name,
      teams_count: teams.length,
      approved_teams_count: teams.filter(tm => tm.status === 'approved').length,
      registration_link_token: regLink?.token
    };
  });

  return res.json(results);
});

// Create Tournament (Checks SaaS Plan Limits)
tournamentRouter.post('/', requireAuth, requireTenantAccess(), (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.body.organization_id || req.user!.organization_id;
  if (!orgId) return res.status(400).json({ error: 'Organization ID is required' });

  // 1. Enforce SaaS Plan Limit
  const limitCheck = BillingService.checkLimit(orgId, 'tournaments');
  if (!limitCheck.allowed) {
    return res.status(403).json({ 
      error: limitCheck.reason || 'Tournament creation limit reached for your current subscription plan.',
      limit: limitCheck
    });
  }

  const {
    sport_id,
    sport_code,
    name,
    description,
    location,
    village,
    panchayat,
    district,
    state,
    start_date,
    end_date,
    registration_opening,
    registration_closing,
    format = 'league_knockout',
    max_teams = 8,
    ground_fee = 0,
    payment_config = { allow_partial: true, min_partial_type: 'percentage', min_partial_value: 50 },
    prize_money = 0,
    runner_up_prize = 0,
    contact_person,
    phone,
    whatsapp,
    settings = {}
  } = req.body;

  if (!name || !sport_code) {
    return res.status(400).json({ error: 'Tournament name and sport code are required' });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  const tourneyId = 'tourney_' + Date.now();

  const newTournament: Tournament = {
    id: tourneyId,
    organization_id: orgId,
    sport_id: sport_id || (sport_code === 'football' ? 'sport-football' : 'sport-cricket'),
    sport_code: sport_code as any,
    name,
    slug,
    logo: req.body.logo || (sport_code === 'football' ? 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80' : 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80'),
    banner: req.body.banner || (sport_code === 'football' ? 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&auto=format&fit=crop&q=80' : 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=1200&auto=format&fit=crop&q=80'),
    description: description || '',
    location: location || '',
    village: village || '',
    panchayat: panchayat || '',
    municipality: req.body.municipality || '',
    district: district || '',
    state: state || 'Kerala',
    start_date: start_date || now.split('T')[0],
    end_date: end_date || now.split('T')[0],
    registration_opening: registration_opening || now.split('T')[0],
    registration_closing: registration_closing || now.split('T')[0],
    format,
    max_teams: Number(max_teams),
    ground_fee: Number(ground_fee),
    payment_config: {
      allow_partial: Boolean(payment_config.allow_partial),
      min_partial_type: payment_config.min_partial_type || 'percentage',
      min_partial_value: Number(payment_config.min_partial_value ?? 50)
    },
    prize_money: Number(prize_money),
    runner_up_prize: Number(runner_up_prize),
    contact_person: contact_person || req.user!.name,
    phone: phone || req.user!.phone,
    whatsapp: whatsapp || phone || req.user!.phone,
    status: 'registration_open',
    settings: {
      squad_min_players: settings.squad_min_players || (sport_code === 'football' ? 7 : 11),
      squad_max_players: settings.squad_max_players || (sport_code === 'football' ? 14 : 16),
      max_substitutes: settings.max_substitutes || 5,
      require_detailed_positions: settings.require_detailed_positions !== false,
      football_format: settings.football_format || '7-a-side',
      match_duration_minutes: settings.match_duration_minutes || 60,
      half_duration_minutes: settings.half_duration_minutes || 30,
      extra_time_minutes: settings.extra_time_minutes || 10,
      enable_penalty_shootout: settings.enable_penalty_shootout !== false,
      cricket_format: settings.cricket_format || 'T20',
      total_overs: settings.total_overs || 20,
      powerplay_overs: settings.powerplay_overs || 6,
      max_overs_per_bowler: settings.max_overs_per_bowler || 4,
      enable_super_over: settings.enable_super_over !== false,
      playing_xi_count: settings.playing_xi_count || 11
    },
    has_auction: Boolean(req.body.has_auction),
    created_at: now,
    updated_at: now
  };

  // If auction is enabled, automatically create the auction entity
  if (req.body.has_auction) {
    const defaultBasePrices = sport_code === 'cricket' ? [
      { category: 'Icon' as const, price: 20000 },
      { category: 'Category A' as const, price: 10000 },
      { category: 'Category B' as const, price: 5000 },
      { category: 'Category C' as const, price: 2000 },
      { category: 'Emerging' as const, price: 1000 }
    ] : [
      { category: 'Icon' as const, price: 10000 },
      { category: 'Category A' as const, price: 5000 },
      { category: 'Category B' as const, price: 2500 },
      { category: 'Category C' as const, price: 1000 },
      { category: 'Emerging' as const, price: 500 }
    ];

    const auctionId = 'auction_' + Date.now();
    const auctionToken = slug + '-auction';
    const newAuction = {
      id: auctionId,
      tournament_id: newTournament.id,
      organization_id: orgId,
      title: req.body.auction_title || `${newTournament.name} Official Player Auction`,
      token: auctionToken,
      status: req.body.auction_status || 'upcoming',
      auction_date: req.body.auction_start_time || req.body.auction_date || newTournament.start_date,
      auction_start_time: req.body.auction_start_time || newTournament.start_date,
      auction_end_time: req.body.auction_end_time,
      team_purse: Number(req.body.team_purse || 100000),
      min_bid_increment: Number(req.body.min_bid_increment || 500),
      max_players_per_team: Number(req.body.max_players_per_team || (sport_code === 'football' ? 12 : 16)),
      min_players_per_team: Number(req.body.min_players_per_team || (sport_code === 'football' ? 7 : 11)),
      base_prices: (Array.isArray(req.body.base_prices) && req.body.base_prices.length > 0) ? req.body.base_prices : defaultBasePrices,
      current_player_id: null,
      current_bid_amount: 0,
      current_bid_team_id: null,
      current_bid_team_name: null,
      hammer_state: 'waiting' as const,
      hammer_timer_seconds: 30,
      bid_history: [],
      created_at: now,
      updated_at: now
    };

    db.auctions.push(newAuction as any);
    newTournament.auction_id = auctionId;
    newTournament.auction_status = newAuction.status as any;
    newTournament.auction_start_time = newAuction.auction_start_time;
    newTournament.auction_end_time = newAuction.auction_end_time;
  }

  db.tournaments.push(newTournament);

  // Automatically generate public registration link for direct teams
  const token = slug + '-reg';
  const regLink: RegistrationLink = {
    id: 'link_' + Date.now(),
    tournament_id: newTournament.id,
    organization_id: orgId,
    token,
    status: 'active',
    max_teams: newTournament.max_teams,
    current_registrations: 0,
    deadline: newTournament.registration_closing,
    created_at: now
  };
  db.registration_links.push(regLink);

  db.logAudit({
    organization_id: orgId,
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'CREATED_TOURNAMENT',
    entity_type: 'Tournament',
    entity_id: newTournament.id,
    details: `Created tournament [${newTournament.name}] (${newTournament.sport_code.toUpperCase()}) ${newTournament.has_auction ? 'with Player Auction' : 'with Direct Team Registration'}`
  });

  db.save();
  return res.status(201).json({ tournament: newTournament, registration_link: regLink });
});

// Configure or Toggle Tournament Auction
tournamentRouter.put('/:id/auction', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tourney = db.tournaments.find(t => t.id === req.params.id);
  if (!tourney) return res.status(404).json({ error: 'Tournament not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && tourney.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const {
    has_auction,
    auction_title,
    auction_start_time,
    auction_end_time,
    auction_status,
    team_purse,
    min_bid_increment,
    max_players_per_team,
    min_players_per_team,
    base_prices
  } = req.body;

  tourney.has_auction = Boolean(has_auction);
  const now = new Date().toISOString();

  let auction = db.auctions.find(a => a.tournament_id === tourney.id || a.id === tourney.auction_id);

  if (tourney.has_auction) {
    if (!auction) {
      // Create new auction
      const defaultBasePrices = tourney.sport_code === 'cricket' ? [
        { category: 'Icon' as const, price: 20000 },
        { category: 'Category A' as const, price: 10000 },
        { category: 'Category B' as const, price: 5000 },
        { category: 'Category C' as const, price: 2000 },
        { category: 'Emerging' as const, price: 1000 }
      ] : [
        { category: 'Icon' as const, price: 10000 },
        { category: 'Category A' as const, price: 5000 },
        { category: 'Category B' as const, price: 2500 },
        { category: 'Category C' as const, price: 1000 },
        { category: 'Emerging' as const, price: 500 }
      ];

      auction = {
        id: 'auction_' + Date.now(),
        tournament_id: tourney.id,
        organization_id: tourney.organization_id,
        title: auction_title || `${tourney.name} Official Player Auction`,
        token: tourney.slug + '-auction',
        status: auction_status || 'upcoming',
        auction_date: auction_start_time || tourney.start_date,
        auction_start_time: auction_start_time || tourney.start_date,
        auction_end_time,
        team_purse: Number(team_purse || 100000),
        min_bid_increment: Number(min_bid_increment || 500),
        max_players_per_team: Number(max_players_per_team || (tourney.sport_code === 'football' ? 12 : 16)),
        min_players_per_team: Number(min_players_per_team || (tourney.sport_code === 'football' ? 7 : 11)),
        base_prices: (Array.isArray(base_prices) && base_prices.length > 0) ? base_prices : defaultBasePrices,
        current_player_id: null,
        current_bid_amount: 0,
        current_bid_team_id: null,
        current_bid_team_name: null,
        hammer_state: 'waiting' as const,
        hammer_timer_seconds: 30,
        bid_history: [],
        created_at: now,
        updated_at: now
      };
      db.auctions.push(auction as any);
    } else {
      // Update existing auction
      if (auction_title) auction.title = auction_title;
      if (auction_start_time) {
        auction.auction_start_time = auction_start_time;
        auction.auction_date = auction_start_time;
      }
      if (auction_end_time !== undefined) auction.auction_end_time = auction_end_time;
      if (auction_status) auction.status = auction_status;
      if (team_purse) auction.team_purse = Number(team_purse);
      if (min_bid_increment) auction.min_bid_increment = Number(min_bid_increment);
      if (max_players_per_team) auction.max_players_per_team = Number(max_players_per_team);
      if (min_players_per_team) auction.min_players_per_team = Number(min_players_per_team);
      if (Array.isArray(base_prices) && base_prices.length > 0) auction.base_prices = base_prices;
      auction.updated_at = now;
    }

    tourney.auction_id = auction.id;
    tourney.auction_status = auction.status as any;
    tourney.auction_start_time = auction.auction_start_time;
    tourney.auction_end_time = auction.auction_end_time;
  } else {
    tourney.auction_status = undefined;
  }

  tourney.updated_at = now;
  db.save();

  return res.json({ tournament: tourney, auction });
});

// Get Single Tournament
tournamentRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tourney = db.tournaments.find(t => t.id === req.params.id);
  if (!tourney) return res.status(404).json({ error: 'Tournament not found' });

  // Check tenant access if not super admin
  if (req.user!.role !== 'SUPER_ADMIN' && tourney.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const regLink = db.registration_links.find(l => l.tournament_id === tourney.id);
  return res.json({ tournament: tourney, registration_link: regLink });
});

// Update Tournament
tournamentRouter.put('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tourney = db.tournaments.find(t => t.id === req.params.id);
  if (!tourney) return res.status(404).json({ error: 'Tournament not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && tourney.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  Object.assign(tourney, req.body, { updated_at: new Date().toISOString() });

  db.logAudit({
    organization_id: tourney.organization_id,
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'UPDATED_TOURNAMENT',
    entity_type: 'Tournament',
    entity_id: tourney.id,
    details: `Updated tournament [${tourney.name}]`
  });

  db.save();
  return res.json(tourney);
});

// Delete Tournament
tournamentRouter.delete('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const index = db.tournaments.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Tournament not found' });

  const tourney = db.tournaments[index];
  if (req.user!.role !== 'SUPER_ADMIN' && tourney.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  db.tournaments.splice(index, 1);

  db.logAudit({
    organization_id: tourney.organization_id,
    user_id: req.user!.id,
    user_name: req.user!.name,
    user_role: req.user!.role,
    action: 'DELETED_TOURNAMENT',
    entity_type: 'Tournament',
    entity_id: req.params.id as string,
    details: `Deleted tournament [${tourney.name}]`
  });

  db.save();
  return res.json({ message: 'Tournament deleted successfully' });
});

// Registration Link Generator & Status Toggle
tournamentRouter.post('/:id/registration-link', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const tourney = db.tournaments.find(t => t.id === req.params.id);
  if (!tourney) return res.status(404).json({ error: 'Tournament not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && tourney.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  let link = db.registration_links.find(l => l.tournament_id === tourney.id);
  const { action, status, customToken } = req.body;

  if (action === 'regenerate') {
    const newToken = (customToken || tourney.slug + '-reg-' + Math.random().toString(36).substring(2, 6));
    if (link) {
      link.token = newToken;
      link.status = 'active';
    } else {
      link = {
        id: 'link_' + Date.now(),
        tournament_id: tourney.id,
        organization_id: tourney.organization_id,
        token: newToken,
        status: 'active',
        max_teams: tourney.max_teams,
        current_registrations: db.teams.filter(t => t.tournament_id === tourney.id).length,
        deadline: tourney.registration_closing,
        created_at: new Date().toISOString()
      };
      db.registration_links.push(link);
    }
  } else if (link && status) {
    link.status = status;
  }

  db.save();
  return res.json(link);
});
