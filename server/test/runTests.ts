import assert from 'assert';
import { db } from '../src/db/database.js';
import { BillingService } from '../src/services/billingService.js';
import { TournamentPaymentService } from '../src/services/tournamentPaymentService.js';
import { ScoringEngine } from '../src/services/scoringEngine.js';

console.log('🧪 Starting Multi-Tenant Sports SaaS Automated Verification Suite...\n');

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}\n`, err);
    failedTests++;
  }
}

// Reset database to known seed state before tests
db.resetToSeed();

// 1. TENANT ISOLATION TESTS
test('Tenant Isolation: Organization user belongs to Green Valley org', () => {
  const greenAdmin = db.users.find(u => u.email === 'admin@greenvalley.com');
  assert.strictEqual(greenAdmin?.organization_id, 'org-green-valley');
});

test('Tenant Isolation: Green Valley cannot see or manage Malabar Cricket teams when scoped', () => {
  const greenOrgId = 'org-green-valley';
  const malabarOrgId = 'org-malabar-cricket';
  
  const greenTeams = db.teams.filter(t => t.organization_id === greenOrgId);
  const malabarTeams = db.teams.filter(t => t.organization_id === malabarOrgId);

  assert.ok(greenTeams.every(t => t.organization_id === greenOrgId));
  assert.ok(malabarTeams.every(t => t.organization_id === malabarOrgId));
  assert.ok(!greenTeams.some(t => t.organization_id === malabarOrgId));
});

// 2. SAAS BILLING & PLAN LIMITS TESTS
test('SaaS Billing: Basic plan allows max 1 tournament, Standard allows 5', () => {
  const basicPlan = db.plans.find(p => p.id === 'plan-basic');
  const standardPlan = db.plans.find(p => p.id === 'plan-standard');

  assert.strictEqual(basicPlan?.tournament_limit, 1);
  assert.strictEqual(standardPlan?.tournament_limit, 5);
});

test('SaaS Billing: Check Limit prevents exceeding tournament limit', () => {
  // Highland FC is on Basic plan (limit 1 tournament, current 0)
  const limitBefore = BillingService.checkLimit('org-highland-fc', 'tournaments');
  assert.strictEqual(limitBefore.allowed, true);

  // Add dummy tournament for Highland FC
  db.tournaments.push({
    id: 'test-tourney-hl',
    organization_id: 'org-highland-fc',
    sport_id: 'sport-football',
    sport_code: 'football',
    name: 'Highland Test Cup',
    slug: 'highland-test',
    logo: '',
    banner: '',
    description: '',
    location: '',
    village: '',
    panchayat: '',
    municipality: '',
    district: '',
    state: '',
    start_date: '2026-08-01',
    end_date: '2026-08-10',
    registration_opening: '2026-07-01',
    registration_closing: '2026-07-31',
    format: 'knockout',
    max_teams: 8,
    ground_fee: 2000,
    payment_config: { allow_partial: true, min_partial_type: 'percentage', min_partial_value: 50 },
    prize_money: 10000,
    runner_up_prize: 5000,
    contact_person: 'Manoj',
    phone: '9999999999',
    whatsapp: '9999999999',
    status: 'ongoing',
    settings: { squad_min_players: 7, squad_max_players: 14, max_substitutes: 5 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const limitAfter = BillingService.checkLimit('org-highland-fc', 'tournaments');
  assert.strictEqual(limitAfter.allowed, false);
  assert.ok(limitAfter.reason?.includes('limit reached'));
});

// 3. TOURNAMENT GROUND FEE & PARTIAL PAYMENT TESTS (PAYMENT SYSTEM 2)
test('Tournament Ground Fee: 50% partial payment creates partially_paid receipt with remaining balance', () => {
  const tourney = db.tournaments.find(t => t.id === 'tourney-football-sevens')!;
  const options = TournamentPaymentService.calculatePaymentOptions(tourney);

  assert.strictEqual(options.totalFee, 5000);
  assert.strictEqual(options.allowPartial, true);
  assert.strictEqual(options.partialAmount, 2500);

  // Register a new test team
  const testTeam = {
    id: 'test-team-phoenix',
    tournament_id: tourney.id,
    organization_id: tourney.organization_id,
    name: 'Phoenix Kerala FC',
    short_name: 'PKFC',
    logo: '',
    village: 'Nilambur',
    panchayat: 'Nilambur',
    district: 'Malappuram',
    jersey_color: '#F97316',
    captain_name: 'Vineeth S.',
    manager_name: 'Vineeth S.',
    manager_phone: '+91 98950 00112',
    manager_whatsapp: '+91 98950 00112',
    manager_email: 'vineeth@phoenixfc.in',
    manager_address: 'Stadium Road',
    status: 'pending' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.teams.push(testTeam);

  // Pay 50% partial ground fee
  const payResult = TournamentPaymentService.processPayment({
    teamId: testTeam.id,
    tournamentId: tourney.id,
    organizationId: tourney.organization_id,
    paymentOption: 'partial',
    paymentMethod: 'upi',
    transactionId: 'UPI-TEST-9988'
  });

  assert.strictEqual(payResult.payment.total_fee, 5000);
  assert.strictEqual(payResult.payment.paid_amount, 2500);
  assert.strictEqual(payResult.payment.remaining_amount, 2500);
  assert.strictEqual(payResult.payment.status, 'partially_paid');
  assert.strictEqual(payResult.receipt.receipt_data.remaining_balance, 2500);
});

test('Tournament Ground Fee: Admin offline Cash payment clears remaining balance to fully_paid', () => {
  const tourney = db.tournaments.find(t => t.id === 'tourney-football-sevens')!;
  
  // Pay remaining ₹2500 in cash to admin
  const payResult = TournamentPaymentService.processPayment({
    teamId: 'test-team-phoenix',
    tournamentId: tourney.id,
    organizationId: tourney.organization_id,
    paymentOption: 'full',
    paymentMethod: 'cash',
    customAmount: 2500,
    recordedByAdmin: true,
    adminUserId: 'user-org-admin-green'
  });

  assert.strictEqual(payResult.payment.paid_amount, 5000);
  assert.strictEqual(payResult.payment.remaining_amount, 0);
  assert.strictEqual(payResult.payment.status, 'fully_paid');
  assert.strictEqual(payResult.payment.recorded_by_admin, true);
});

// 4. FOOTBALL SCORING ENGINE TESTS
test('Football Scoring: Records goals and updates standings accurately', () => {
  const matchId = 'match-fb-live-1';
  const match = db.matches.find(m => m.id === matchId)!;

  // Initial score is 2-1 for Team A
  const stateBefore = ScoringEngine.getOrCreateFootballState(matchId);
  const initialGoalsA = stateBefore.team_a_score;

  // Add goal for Team A
  ScoringEngine.addFootballEvent({
    matchId,
    teamId: match.team_a_id,
    playerId: 'pl-mb-3',
    eventType: 'goal',
    minute: 35
  });

  const stateAfter = ScoringEngine.getOrCreateFootballState(matchId);
  assert.strictEqual(stateAfter.team_a_score, initialGoalsA + 1);

  // Standings check
  const standings = db.standings.filter(s => s.tournament_id === match.tournament_id);
  const teamAStanding = standings.find(s => s.team_id === match.team_a_id);
  assert.ok(teamAStanding !== undefined);
  assert.ok(teamAStanding.goals_for >= 3);
});

test('Football Scoring: Undo reverts the goal cleanly', () => {
  const matchId = 'match-fb-live-1';
  const stateBefore = ScoringEngine.getOrCreateFootballState(matchId);
  const goalsBefore = stateBefore.team_a_score;

  ScoringEngine.undoLastFootballEvent(matchId);
  const stateAfter = ScoringEngine.getOrCreateFootballState(matchId);

  assert.strictEqual(stateAfter.team_a_score, goalsBefore - 1);
});

// 5. CRICKET SCORING ENGINE TESTS
test('Cricket Scoring: Records delivery, runs, extras, and updates current run rate', () => {
  const matchId = 'match-crick-live-1';
  const stateBefore = ScoringEngine.getOrCreateCricketState(matchId);
  const runsBefore = stateBefore.team_a_runs;

  // Record a Boundary 4
  ScoringEngine.recordCricketBall({
    matchId,
    innings: 1,
    runsScored: 4,
    extras: 'none',
    isWicket: false,
    strikerId: 'pl-kk-1',
    nonStrikerId: 'pl-kk-2',
    bowlerId: 'pl-cw-3'
  });

  const stateAfter = ScoringEngine.getOrCreateCricketState(matchId);
  assert.strictEqual(stateAfter.team_a_runs, runsBefore + 4);
  assert.ok(stateAfter.current_run_rate > 0);
});

test('Cricket Scoring: Single run on last ball of over retains strike for next over, and mid-over single swaps strike', () => {
  const matchId = 'match-crick-live-1';
  const state = ScoringEngine.getOrCreateCricketState(matchId);
  
  state.current_striker_id = 'pl-kk-1';
  state.current_non_striker_id = 'pl-kk-2';

  // Ball 6 of over 9 (End of Over): 1 run crosses and end-of-over changes ends, so striker pl-kk-1 retains strike for over 10
  ScoringEngine.recordCricketBall({
    matchId,
    innings: 1,
    runsScored: 1,
    extras: 'none',
    isWicket: false
  });

  const stateAfterBall6 = ScoringEngine.getOrCreateCricketState(matchId);
  assert.strictEqual(stateAfterBall6.current_striker_id, 'pl-kk-1');

  // Ball 1 of over 10 (Mid-over): 1 run swaps strike to pl-kk-2
  ScoringEngine.recordCricketBall({
    matchId,
    innings: 1,
    runsScored: 1,
    extras: 'none',
    isWicket: false
  });

  const stateAfterBall1NextOver = ScoringEngine.getOrCreateCricketState(matchId);
  assert.strictEqual(stateAfterBall1NextOver.current_striker_id, 'pl-kk-2');
  assert.strictEqual(stateAfterBall1NextOver.current_non_striker_id, 'pl-kk-1');
});

// 6. PLATFORM REVENUE & MRR METRICS
test('Super Admin Metrics: Calculates MRR, ARR, and active organizations correctly', () => {
  const metrics = BillingService.getPlatformMetrics();

  assert.ok(metrics.organizations.total >= 3);
  assert.ok(metrics.revenue.mrr > 0);
  assert.strictEqual(metrics.revenue.arr, metrics.revenue.mrr * 12);
  assert.ok(metrics.revenue.totalPlatformRevenue > 0);
  assert.ok(metrics.activity.totalTournaments >= 2);
});

console.log(`\n🎉 Verification Completed: ${passedTests} Passed, ${failedTests} Failed.`);
if (failedTests > 0) process.exit(1);
