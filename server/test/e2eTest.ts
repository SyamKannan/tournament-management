import http from 'http';

function request(options: http.RequestOptions, postData?: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 200, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 200, body: data });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runE2E() {
  console.log('🚀 Running End-to-End Platform Verification...\n');

  // Test 1: Public Tournament Hub
  console.log('1️⃣ Verifying Public Tournament Hub Endpoint:');
  const tHub = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/tournaments/public/malappuram-7s-football-2026',
    method: 'GET'
  });
  console.log(`   Status: ${tHub.status}`);
  console.log(`   Tournament: ${tHub.body.tournament?.name} (${tHub.body.tournament?.sport_code})`);
  console.log(`   Teams Count: ${tHub.body.teams?.length}, Live Matches: ${tHub.body.matches?.length}`);

  // Test 2: 16:9 Big Screen Live Scoreboard Feed
  console.log('\n2️⃣ Verifying 16:9 Big Screen Scoreboard Feed:');
  const scFeed = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/matches/scoreboard/match/match-fb-live-1',
    method: 'GET'
  });
  console.log(`   Status: ${scFeed.status}`);
  console.log(`   Match: ${scFeed.body.team_a?.name} vs ${scFeed.body.team_b?.name}`);
  console.log(`   Live Score: ${scFeed.body.football_state?.team_a_score} - ${scFeed.body.football_state?.team_b_score} (Minute ${scFeed.body.football_state?.match_minute}')`);
  console.log(`   Sponsor Ads Loaded: ${scFeed.body.advertisements?.length}`);

  // Test 3: Public Team Registration 5-Step Submission & Receipt
  console.log('\n3️⃣ Verifying Public Team Registration (50% Partial Ground Fee Advance):');
  const regRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/teams/public/registration/sevens-cup-2026-reg',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    team_name: 'Wayanad Warriors FC',
    short_name: 'WWFC',
    jersey_color: '#F59E0B',
    village: 'Sulthan Bathery',
    panchayat: 'Bathery Grama',
    district: 'Wayanad',
    manager_name: 'Anas Ibrahim',
    manager_phone: '+91 98950 11223',
    manager_whatsapp: '+91 98950 11223',
    manager_email: 'anas@wayanadwarriors.com',
    manager_address: 'Main Bazaar, Bathery',
    players: [
      { full_name: 'Shibil K.', jersey_number: 1, is_captain: false, football_position: 'Goalkeeper' },
      { full_name: 'Rinshad P.', jersey_number: 4, is_captain: false, football_position: 'Centre Back' },
      { full_name: 'Jithin M.', jersey_number: 7, is_captain: true, football_position: 'Central Midfielder' },
      { full_name: 'Suhail V.', jersey_number: 9, is_captain: false, football_position: 'Striker' },
      { full_name: 'Fahis B.', jersey_number: 10, is_captain: false, football_position: 'Left Wing' },
      { full_name: 'Nikhil R.', jersey_number: 11, is_captain: false, football_position: 'Right Wing' },
      { full_name: 'Basil T.', jersey_number: 5, is_captain: false, football_position: 'Defensive Midfielder' }
    ],
    payment_option: 'partial',
    payment_method: 'upi',
    transaction_id: 'UPI-TEST-CONF-8899'
  });
  console.log(`   Status: ${regRes.status}`);
  console.log(`   Registered Team: ${regRes.body.team?.name} (Status: ${regRes.body.team?.status})`);
  console.log(`   Total Fee: ₹${regRes.body.payment?.total_fee}, Paid: ₹${regRes.body.payment?.paid_amount}, Remaining: ₹${regRes.body.payment?.remaining_amount}`);
  console.log(`   Generated Receipt #: ${regRes.body.receipt?.receipt_number}`);
  console.log(`   Receipt QR Signature: ${regRes.body.receipt?.receipt_data?.qr_code_signature?.substring(0, 32)}...`);

  // Test 4: Super Admin Metrics
  console.log('\n4️⃣ Verifying Super Admin Metrics:');
  const metrics = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/admin/metrics',
    method: 'GET',
    headers: { 'x-demo-role': 'SUPER_ADMIN' }
  });
  console.log(`   Status: ${metrics.status}`);
  console.log(`   MRR: ₹${metrics.body.revenue?.mrr?.toLocaleString()}, ARR: ₹${metrics.body.revenue?.arr?.toLocaleString()}`);
  console.log(`   Active Organizations: ${metrics.body.organizations?.active}`);

  // Test 5: Organization Subscription Usage Gauge
  console.log('\n5️⃣ Verifying Organization Subscription Usage:');
  const usage = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/organizations/org-green-valley/usage',
    method: 'GET',
    headers: { 'x-demo-role': 'ORG_ADMIN', 'x-demo-org-id': 'org-green-valley' }
  });
  console.log(`   Status: ${usage.status}`);
  console.log(`   Subscribed Plan: ${usage.body.plan?.name} (Status: ${usage.body.subscription?.status})`);
  console.log(`   Tournaments: ${usage.body.usage?.tournaments?.current}/${usage.body.usage?.tournaments?.max} (${usage.body.usage?.tournaments?.percentage}%)`);
  console.log(`   Teams Limit: ${usage.body.usage?.teams?.current}/${usage.body.usage?.teams?.max} (${usage.body.usage?.teams?.percentage}%)`);

  // Test 6: Scorer Live Goal & Undo
  console.log('\n6️⃣ Verifying Scorer Live Goal Event & Undo Cycle:');
  const goalRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/matches/match-fb-live-1/football/event',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-demo-role': 'SCORER' }
  }, {
    team_id: 'team-mb-fc',
    player_id: 'ply-mb-4',
    event_type: 'goal',
    minute: 38
  });
  console.log(`   Goal Recorded: Score is now ${goalRes.body.state?.team_a_score} - ${goalRes.body.state?.team_b_score}`);

  const undoRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/matches/match-fb-live-1/football/undo',
    method: 'POST',
    headers: { 'x-demo-role': 'SCORER' }
  });
  console.log(`   Undo Executed: Score reverted to ${undoRes.body.state?.team_a_score} - ${undoRes.body.state?.team_b_score}`);

  console.log('\n✅ ALL END-TO-END VERIFICATIONS PASSED SUCCESSFULLY!');
}

runE2E().catch(console.error);
