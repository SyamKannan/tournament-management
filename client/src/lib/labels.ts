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
};

/** Turns a stored code into words a person would write: "registration_open" → "Registration open". */
export const label = (value: string | null | undefined): string => {
  if (!value) return '';
  if (OVERRIDES[value]) return OVERRIDES[value];
  if (!/[_]/.test(value) && value !== value.toLowerCase() && value !== value.toUpperCase()) return value;
  const words = value.replace(/_+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
