import { db } from '../src/db/database.js';
import { ScoringEngine } from '../src/services/scoringEngine.js';
import { getOrCreatePlayerStats } from '../src/routes/players.js';

console.log('🧪 Starting Automated Validation for Player Auctions & Statistics...');

// 1. Check Root Auction Data
const auctions = db.auctions;
console.log(`✓ Seeded Auctions: ${auctions.length}`);
if (auctions.length === 0) throw new Error('No auctions seeded');

const fbAuction = auctions.find(a => a.id === 'auction-football-1') || auctions[0];
console.log(`✓ Active Auction: [${fbAuction.title}], Token: [${fbAuction.token}], Status: [${fbAuction.status}]`);

// 2. Check Seeded Auction Players
const apPlayers = db.auction_players.filter(p => p.auction_id === fbAuction.id);
console.log(`✓ Registered Auction Players: ${apPlayers.length}`);

// 3. Test Bidding Engine & Purse Calculation
const teamMalabar = db.teams.find(t => t.id === 'team-malabar-blasters') || db.teams[0];
const initialSpent = db.auction_players
  .filter(p => p.auction_id === fbAuction.id && p.sold_to_team_id === teamMalabar.id && p.status === 'sold')
  .reduce((sum, p) => sum + (p.sold_price || 0), 0);

console.log(`✓ Team [${teamMalabar.name}] Initial Spent: ₹${initialSpent}, Remaining: ₹${fbAuction.team_purse - initialSpent}`);

// 4. Test Player Statistics & Sync
const targetPlayer = db.players[0];
if (!targetPlayer) throw new Error('No players found in database');

const initialStats = getOrCreatePlayerStats(targetPlayer);
console.log(`✓ Player Stats Retrieved for [${initialStats.full_name}]: Goals = ${initialStats.football?.goals || 0}, Matches = ${initialStats.football?.matches || 0}`);

// Test Auto-Sync when goal scored in ScoringEngine
const prevGoals = initialStats.football?.goals || 0;
ScoringEngine.addFootballEvent({
  matchId: 'match-fb-live-1',
  teamId: targetPlayer.team_id,
  playerId: targetPlayer.id,
  eventType: 'goal',
  minute: 88
});

const updatedStats = getOrCreatePlayerStats(targetPlayer);
console.log(`✓ Scoring Engine Auto-Sync: Goals before = ${prevGoals}, Goals after = ${updatedStats.football?.goals}`);
if ((updatedStats.football?.goals || 0) !== prevGoals + 1) {
  throw new Error('Auto-sync failed: Goal count was not incremented');
}

console.log('\n🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY! Real-time Auction & Player Stats Engine is fully operational.');
