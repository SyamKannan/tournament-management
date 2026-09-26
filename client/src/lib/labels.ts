// Stored codes (in_progress, SUPER_ADMIN, bank_transfer) are for the API, not for people.
// Anything shown on screen goes through `label()` so nobody ever reads an underscore.

const OVERRIDES: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Club Admin',
  TOURNAMENT_MANAGER: 'Tournament Manager',
  TEAM_MANAGER: 'Team Manager',
  SCORER: 'Scorer',
  PLAYER: 'Player',
  PUBLIC_USER: 'Visitor',

  in_progress: 'Live',
  toss: 'Toss',
  half_time: 'Half time',
  full_time: 'Full time',
  innings_break: 'Innings break',
  drinks_break: 'Drinks break',
  past_due: 'Payment overdue',
  changes_required: 'Needs changes',
  in_hammer: 'Under the hammer',
  going_once: 'Going once',
  going_twice: 'Going twice',
  league_knockout: 'League + knockout',
  group_stage: 'Group stage',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  no_ball: 'No ball',
  leg_bye: 'Leg bye',
  kick_off: 'Kick-off',

  // Tournament stages the API works out for the club's cards (TournamentController::stage).
  live: 'Live now',
  teams_full: 'Teams full',
  fixtures_ready: 'Fixtures ready',
  matches_finished: 'All matches played',

  // Notification events, where the automatic wording reads like a database
  // column ("Auction player sold", "Subscription expiring").
  fee_due_reminder: 'Entry fee reminder',
  auction_player_sold: 'Player sold at auction',
  subscription_expiring: 'Plan about to expire',
  subscription_expired: 'Plan expired',
};

/** Turns a stored code into words a person would write: "registration_open" → "Registration open". */
export const label = (value: string | null | undefined): string => {
  if (!value) return '';
  if (OVERRIDES[value]) return OVERRIDES[value];
  if (!/[_]/.test(value) && value !== value.toLowerCase() && value !== value.toUpperCase()) return value;
  const words = value.replace(/_+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The game a tournament plays, from its settings: "T20 Cricket", "6-over Cricket", "7-a-side Football". */
export const tournamentGame = (t: { sport_code?: string; settings?: Record<string, any> | null }): string => {
  const s = t.settings ?? {};
  if (t.sport_code === 'football') {
    return s.football_format ? `${s.football_format} Football` : 'Football';
  }
  const format = String(s.cricket_format ?? '');
  if (/^T\d+$/i.test(format)) return `${format.toUpperCase()} Cricket`;
  const overs = Number(s.total_overs);
  return overs > 0 ? `${overs}-over Cricket` : 'Cricket';
};
