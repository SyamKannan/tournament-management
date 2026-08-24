import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { wsHub } from '../websocket/server.js';
import type { 
  Auction, AuctionPlayer, AuctionBid, TeamAuctionPurse, 
  Player, User 
} from '../types.js';

export const auctionRouter = Router();

// Helper to compute team purse status for an auction
function computeTeamPurses(auction: Auction): TeamAuctionPurse[] {
  let teams = db.teams.filter(t => t.tournament_id === auction.tournament_id);
  if (teams.length === 0) {
    teams = db.teams.filter(t => t.organization_id === auction.organization_id);
  }
  if (teams.length === 0) {
    teams = db.teams.slice(0, 4);
  }
  const auctionPlayers = db.auction_players.filter(p => p.auction_id === auction.id);

  return teams.map(team => {
    const boughtPlayers = auctionPlayers.filter(p => p.sold_to_team_id === team.id && p.status === 'sold');
    const spentAmount = boughtPlayers.reduce((sum, p) => sum + (p.sold_price || 0), 0);
    const remainingPurse = Math.max(0, auction.team_purse - spentAmount);

    return {
      team_id: team.id,
      team_name: team.name,
      logo: team.logo,
      total_purse: auction.team_purse,
      spent_amount: spentAmount,
      remaining_purse: remainingPurse,
      players_bought_count: boughtPlayers.length,
      max_players: auction.max_players_per_team,
      bought_players: boughtPlayers
    };
  });
}

// 1. Get Auction for Tournament
auctionRouter.get('/tournament/:tournamentId', (req: Request, res: Response) => {
  const auction = db.auctions.find(a => a.tournament_id === req.params.tournamentId) || db.auctions[0];
  if (!auction) {
    return res.status(404).json({ error: 'No auction found for this tournament' });
  }

  const teamPurses = computeTeamPurses(auction);
  const players = db.auction_players.filter(p => p.auction_id === auction.id);

  return res.json({
    auction,
    team_purses: teamPurses,
    players,
    total_players: players.length,
    sold_count: players.filter(p => p.status === 'sold').length,
    unsold_count: players.filter(p => p.status === 'unsold').length,
    registered_count: players.filter(p => p.status === 'registered' || p.status === 'approved').length
  });
});

// 2. Create Auction for Tournament
auctionRouter.post('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const {
    tournament_id,
    title,
    auction_date,
    team_purse = 100000,
    min_bid_increment = 500,
    max_players_per_team = 12,
    min_players_per_team = 7,
    base_prices = []
  } = req.body;

  if (!tournament_id || !title) {
    return res.status(400).json({ error: 'Tournament ID and auction title are required' });
  }

  const tournament = db.tournaments.find(t => t.id === tournament_id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && tournament.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  // Check if auction already exists
  const existing = db.auctions.find(a => a.tournament_id === tournament_id);
  if (existing) {
    return res.status(400).json({ error: 'An auction already exists for this tournament', auction: existing });
  }

  const now = new Date().toISOString();
  const token = (title || 'auction').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);

  const defaultBasePrices = tournament.sport_code === 'cricket' ? [
    { category: 'Icon', price: 20000 },
    { category: 'Category A', price: 10000 },
    { category: 'Category B', price: 5000 },
    { category: 'Category C', price: 2000 },
    { category: 'Emerging', price: 1000 }
  ] : [
    { category: 'Icon', price: 10000 },
    { category: 'Category A', price: 5000 },
    { category: 'Category B', price: 2500 },
    { category: 'Category C', price: 1000 },
    { category: 'Emerging', price: 500 }
  ];

  const newAuction: Auction = {
    id: 'auction_' + Date.now(),
    tournament_id,
    organization_id: tournament.organization_id,
    title,
    token,
    status: 'registration_open',
    auction_date: auction_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    team_purse: Number(team_purse),
    min_bid_increment: Number(min_bid_increment),
    max_players_per_team: Number(max_players_per_team),
    min_players_per_team: Number(min_players_per_team),
    base_prices: base_prices.length > 0 ? base_prices : defaultBasePrices,
    current_player_id: null,
    current_bid_amount: 0,
    current_bid_team_id: null,
    current_bid_team_name: null,
    hammer_state: 'waiting',
    hammer_timer_seconds: 30,
    bid_history: [],
    created_at: now,
    updated_at: now
  };

  db.auctions.push(newAuction);
  db.save();

  return res.status(201).json(newAuction);
});

// 3. Get Single Live Auction Room State (with active player on hammer)
auctionRouter.get('/:id', (req: Request, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id) || db.auctions[0];
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  const tournament = db.tournaments.find(t => t.id === auction.tournament_id) || db.tournaments.find(t => t.organization_id === auction.organization_id) || db.tournaments[0];
  const organization = db.organizations.find(o => o.id === auction.organization_id) || db.organizations[0];
  const teamPurses = computeTeamPurses(auction);
  const players = db.auction_players.filter(p => p.auction_id === auction.id);
  const currentPlayer = auction.current_player_id ? players.find(p => p.id === auction.current_player_id) : null;

  return res.json({
    auction,
    tournament: tournament || {
      id: 'tourney-default',
      name: 'Championship Tournament',
      sport_code: 'football',
      village: 'Nilambur',
      district: 'Malappuram'
    },
    organization: organization || {
      id: 'org-default',
      name: 'Sports Club Association'
    },
    current_player: currentPlayer,
    team_purses: teamPurses,
    players,
    bid_history: auction.bid_history || []
  });
});

// 4. Public Lookup for Sharable Player Auction Registration Link
auctionRouter.get('/public/registration/:token', (req: Request, res: Response) => {
  const auction = db.auctions.find(a => a.token === req.params.token);
  if (!auction) return res.status(404).json({ error: 'Auction registration link not found or expired' });

  const tournament = db.tournaments.find(t => t.id === auction.tournament_id);
  const organization = db.organizations.find(o => o.id === auction.organization_id);
  const registeredCount = db.auction_players.filter(p => p.auction_id === auction.id).length;

  return res.json({
    auction,
    tournament,
    organization,
    registered_players_count: registeredCount
  });
});

// 5. Public Player Self-Registration for Auction
auctionRouter.post('/public/registration/:token', (req: Request, res: Response) => {
  const auction = db.auctions.find(a => a.token === req.params.token);
  if (!auction) return res.status(404).json({ error: 'Auction registration link not found' });

  const {
    full_name,
    mobile,
    email,
    photo,
    age,
    village,
    district,
    sport_code,
    category = 'Category B',
    cricket_role,
    cricket_batting_style,
    cricket_bowling_style,
    football_position,
    football_preferred_foot,
    past_achievements
  } = req.body;

  if (!full_name || !mobile || !age) {
    return res.status(400).json({ error: 'Player name, mobile number, and age are required' });
  }

  // Find base price for category
  const baseCategory = auction.base_prices.find(c => c.category === category) || auction.base_prices[2] || { price: 2000 };
  const now = new Date().toISOString();

  const newAuctionPlayer: AuctionPlayer = {
    id: 'ap_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    auction_id: auction.id,
    tournament_id: auction.tournament_id,
    organization_id: auction.organization_id,
    full_name,
    mobile,
    email,
    photo: photo || (sport_code === 'cricket' 
      ? 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80'),
    age: Number(age),
    village: village || '',
    district: district || 'Malappuram',
    sport_code: sport_code || 'football',
    category,
    base_price: baseCategory.price,
    status: 'registered',
    cricket_role,
    cricket_batting_style,
    cricket_bowling_style,
    football_position,
    football_preferred_foot,
    past_achievements,
    created_at: now
  };

  db.auction_players.push(newAuctionPlayer);
  db.save();

  return res.status(201).json({
    player: newAuctionPlayer,
    message: 'You have registered for the auction successfully! Your registration is under review by the tournament organizers.'
  });
});

// 6. Org Admin Approves / Rejects / Categorizes Registered Player
auctionRouter.put('/players/:playerId/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const player = db.auction_players.find(p => p.id === req.params.playerId);
  if (!player) return res.status(404).json({ error: 'Player not found in auction pool' });

  if (req.user!.role !== 'SUPER_ADMIN' && player.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const { status, category, base_price } = req.body;
  if (status) player.status = status;
  if (category) player.category = category;
  if (base_price) player.base_price = Number(base_price);

  db.save();
  return res.json(player);
});

// 7. Auctioneer Calls Player to the Hammer
auctionRouter.post('/:id/call-player', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  const { player_id } = req.body;
  const player = db.auction_players.find(p => p.id === player_id && p.auction_id === auction.id);
  if (!player) return res.status(404).json({ error: 'Player not found in this auction pool' });

  // Update auction state
  auction.status = 'live';
  auction.current_player_id = player.id;
  auction.current_bid_amount = player.base_price;
  auction.current_bid_team_id = null;
  auction.current_bid_team_name = null;
  auction.hammer_state = 'bidding';
  auction.hammer_timer_seconds = 30;
  auction.bid_history = [];
  auction.updated_at = new Date().toISOString();

  player.status = 'in_hammer';
  db.save();

  const teamPurses = computeTeamPurses(auction);

  // Real-time broadcast to all bidding rooms & stadium screens
  wsHub.broadcastToRoom(`auction:${auction.id}`, 'PLAYER_ON_HAMMER', {
    auction,
    player,
    team_purses: teamPurses
  });

  return res.json({ auction, player, team_purses: teamPurses });
});

// 8. Place Bid in Live Auction
auctionRouter.post('/:id/place-bid', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  if (auction.status !== 'live' || auction.hammer_state === 'sold' || auction.hammer_state === 'unsold') {
    return res.status(400).json({ error: 'Auction is not currently in an active bidding round' });
  }

  if (!auction.current_player_id) {
    return res.status(400).json({ error: 'No player is currently on the hammer' });
  }

  const { team_id, amount } = req.body;
  const team = db.teams.find(t => t.id === team_id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const player = db.auction_players.find(p => p.id === auction.current_player_id);
  if (!player) return res.status(404).json({ error: 'Active player not found' });

  const bidAmount = Number(amount);
  const minRequired = (auction.current_bid_amount || player.base_price) + (auction.current_bid_team_id ? auction.min_bid_increment : 0);

  if (bidAmount < minRequired && auction.current_bid_team_id) {
    return res.status(400).json({ error: `Minimum bid must be at least ₹${minRequired.toLocaleString()}` });
  }

  // Check Team Purse Limit
  const teamPurses = computeTeamPurses(auction);
  const teamPurse = teamPurses.find(tp => tp.team_id === team.id);
  if (!teamPurse) return res.status(400).json({ error: 'Team purse data missing' });

  if (bidAmount > teamPurse.remaining_purse) {
    return res.status(400).json({ 
      error: `Insufficient purse! Remaining purse: ₹${teamPurse.remaining_purse.toLocaleString()}, Bid attempted: ₹${bidAmount.toLocaleString()}` 
    });
  }

  if (teamPurse.players_bought_count >= auction.max_players_per_team) {
    return res.status(400).json({ error: `Squad full! Maximum ${auction.max_players_per_team} players allowed.` });
  }

  // Record Bid
  const newBid: AuctionBid = {
    id: 'bid_' + Date.now(),
    auction_id: auction.id,
    player_id: player.id,
    team_id: team.id,
    team_name: team.name,
    amount: bidAmount,
    timestamp: new Date().toISOString()
  };

  auction.current_bid_amount = bidAmount;
  auction.current_bid_team_id = team.id;
  auction.current_bid_team_name = team.name;
  auction.hammer_state = 'bidding';
  auction.hammer_timer_seconds = 20; // reset countdown on new bid
  auction.bid_history.unshift(newBid);
  auction.updated_at = new Date().toISOString();

  db.save();

  // Broadcast live bid to all participants
  wsHub.broadcastToRoom(`auction:${auction.id}`, 'BID_PLACED', {
    auction,
    bid: newBid,
    player,
    team_purses: computeTeamPurses(auction)
  });

  return res.json({ auction, bid: newBid, player });
});

// 9. Auctioneer Hammers "SOLD!"
auctionRouter.post('/:id/sell-player', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  if (!auction.current_player_id) return res.status(400).json({ error: 'No player on the hammer' });
  const player = db.auction_players.find(p => p.id === auction.current_player_id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  if (!auction.current_bid_team_id) {
    return res.status(400).json({ error: 'No bids placed. Use unsold button instead.' });
  }

  const team = db.teams.find(t => t.id === auction.current_bid_team_id);
  const finalPrice = auction.current_bid_amount || player.base_price;

  // Mark player sold
  player.status = 'sold';
  player.sold_price = finalPrice;
  player.sold_to_team_id = auction.current_bid_team_id;
  player.sold_to_team_name = team?.name || 'Unknown Team';

  // Automatically insert into tournament team squad roster!
  const newRosterPlayer: Player = {
    id: 'pl_' + Date.now(),
    team_id: team!.id,
    tournament_id: auction.tournament_id,
    organization_id: auction.organization_id,
    full_name: player.full_name,
    jersey_number: db.players.filter(p => p.team_id === team!.id).length + 1,
    football_position: player.football_position,
    cricket_role: player.cricket_role,
    cricket_bowling_style: player.cricket_bowling_style,
    cricket_batting_style: player.cricket_batting_style,
    age: player.age,
    mobile: player.mobile,
    is_captain: false,
    is_wicketkeeper: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.players.push(newRosterPlayer);
  player.player_id = newRosterPlayer.id;

  auction.hammer_state = 'sold';
  auction.updated_at = new Date().toISOString();
  db.save();

  const teamPurses = computeTeamPurses(auction);

  // Broadcast SOLD event
  wsHub.broadcastToRoom(`auction:${auction.id}`, 'PLAYER_SOLD', {
    auction,
    player,
    team,
    sold_price: finalPrice,
    team_purses: teamPurses
  });

  return res.json({ auction, player, team, team_purses: teamPurses });
});

// 10. Auctioneer Marks Player "UNSOLD"
auctionRouter.post('/:id/unsold-player', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  if (!auction.current_player_id) return res.status(400).json({ error: 'No player on the hammer' });
  const player = db.auction_players.find(p => p.id === auction.current_player_id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  player.status = 'unsold';
  auction.hammer_state = 'unsold';
  auction.updated_at = new Date().toISOString();
  db.save();

  // Broadcast UNSOLD event
  wsHub.broadcastToRoom(`auction:${auction.id}`, 'PLAYER_UNSOLD', {
    auction,
    player,
    team_purses: computeTeamPurses(auction)
  });

  return res.json({ auction, player });
});

// 11. Accelerated Round: Re-auction Unsold Players with Discounted Base Price
auctionRouter.post('/:id/accelerated-round', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  const unsoldPlayers = db.auction_players.filter(p => p.auction_id === auction.id && p.status === 'unsold');
  if (unsoldPlayers.length === 0) {
    return res.status(400).json({ error: 'No unsold players to re-auction' });
  }

  // Reduce base price by 25% for accelerated round
  unsoldPlayers.forEach(p => {
    p.status = 'approved';
    p.base_price = Math.max(500, Math.round(p.base_price * 0.75));
  });

  auction.accelerated_round_active = true;
  auction.updated_at = new Date().toISOString();
  db.save();

  wsHub.broadcastToRoom(`auction:${auction.id}`, 'ACCELERATED_ROUND_STARTED', {
    auction,
    unsold_count: unsoldPlayers.length,
    team_purses: computeTeamPurses(auction)
  });

  return res.json({ message: `Accelerated round started for ${unsoldPlayers.length} players`, count: unsoldPlayers.length });
});

// 12. Update Auction Status (Upcoming, Live, Paused, Completed, Cancelled)
auctionRouter.post('/:id/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  if (req.user!.role !== 'SUPER_ADMIN' && auction.organization_id !== req.user!.organization_id) {
    return res.status(403).json({ error: 'Forbidden: Tenant isolation violation' });
  }

  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  auction.status = status;
  auction.updated_at = new Date().toISOString();

  // Sync tournament
  const tourney = db.tournaments.find(t => t.id === auction.tournament_id);
  if (tourney) {
    tourney.auction_status = status;
    tourney.updated_at = new Date().toISOString();
  }

  db.save();

  // Broadcast status change
  wsHub.broadcastToRoom(`auction:${auction.id}`, 'AUCTION_STATUS_CHANGED', {
    auction,
    status
  });

  return res.json({ message: `Auction status updated to ${status}`, auction });
});

// 13. Approve Player Registration
auctionRouter.post('/:id/players/:playerId/approve', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  const player = db.auction_players.find(p => p.id === req.params.playerId && p.auction_id === auction.id);
  if (!player) return res.status(404).json({ error: 'Player not found in this auction' });

  player.status = 'approved';
  db.save();

  wsHub.broadcastToRoom(`auction:${auction.id}`, 'PLAYER_APPROVED', { player });
  return res.json({ message: 'Player approved for auction pool', player });
});

// 14. Reject Player Registration
auctionRouter.post('/:id/players/:playerId/reject', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  const player = db.auction_players.find(p => p.id === req.params.playerId && p.auction_id === auction.id);
  if (!player) return res.status(404).json({ error: 'Player not found in this auction' });

  player.status = 'rejected';
  db.save();

  wsHub.broadcastToRoom(`auction:${auction.id}`, 'PLAYER_REJECTED', { player });
  return res.json({ message: 'Player registration rejected', player });
});

// 15. Delete Player Registration
auctionRouter.delete('/:id/players/:playerId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  const index = db.auction_players.findIndex(p => p.id === req.params.playerId && p.auction_id === auction.id);
  if (index === -1) return res.status(404).json({ error: 'Player not found' });

  db.auction_players.splice(index, 1);
  db.save();

  wsHub.broadcastToRoom(`auction:${auction.id}`, 'PLAYER_DELETED', { playerId: req.params.playerId });
  return res.json({ message: 'Player removed from auction pool' });
});

// 16. Comprehensive Auction History & Summary Report
auctionRouter.get('/:id/summary', (req: Request, res: Response) => {
  const auction = db.auctions.find(a => a.id === req.params.id) || db.auctions[0];
  if (!auction) return res.status(404).json({ error: 'Auction not found' });

  const tournament = db.tournaments.find(t => t.id === auction.tournament_id) || db.tournaments[0];
  const organization = db.organizations.find(o => o.id === auction.organization_id) || db.organizations[0];
  const players = db.auction_players.filter(p => p.auction_id === auction.id);
  const teamPurses = computeTeamPurses(auction);

  const soldPlayers = players.filter(p => p.status === 'sold').sort((a, b) => (b.sold_price || 0) - (a.sold_price || 0));
  const unsoldPlayers = players.filter(p => p.status === 'unsold');
  const pendingPlayers = players.filter(p => p.status === 'registered');
  const approvedPlayers = players.filter(p => p.status === 'approved' || p.status === 'in_hammer');

  const totalSpent = soldPlayers.reduce((sum, p) => sum + (p.sold_price || 0), 0);
  const highestBidPlayer = soldPlayers.length > 0 ? soldPlayers[0] : null;

  return res.json({
    auction,
    tournament,
    organization,
    stats: {
      total_players: players.length,
      sold_count: soldPlayers.length,
      unsold_count: unsoldPlayers.length,
      pending_count: pendingPlayers.length,
      approved_count: approvedPlayers.length,
      total_spent: totalSpent,
      average_price: soldPlayers.length > 0 ? Math.round(totalSpent / soldPlayers.length) : 0,
      highest_bid: highestBidPlayer?.sold_price || 0,
      highest_bid_player: highestBidPlayer
    },
    sold_players: soldPlayers,
    unsold_players: unsoldPlayers,
    pending_players: pendingPlayers,
    approved_players: approvedPlayers,
    team_purses: teamPurses,
    bid_history: auction.bid_history || []
  });
});
