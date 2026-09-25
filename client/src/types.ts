export type UserRole = 
  | 'SUPER_ADMIN' 
  | 'ORG_ADMIN' 
  | 'TOURNAMENT_MANAGER' 
  | 'SCORER' 
  | 'TEAM_MANAGER' 
  | 'PLAYER'
  | 'PUBLIC_USER';

export type OrganizationType = 
  | 'Sports Club'
  | 'Village Association'
  | 'Panchayat'
  | 'School'
  | 'College'
  | 'Cricket Club'
  | 'Football Club'
  | 'Sports Academy'
  | 'Ground'
  | 'Private Organizer'
  | 'Community Organization'
  | 'Other';

export type OrganizationStatus = 
  | 'pending'
  | 'active'
  | 'suspended'
  | 'expired'
  | 'cancelled';

export type BillingType = 'recurring' | 'one_time';
export type BillingInterval = 'monthly' | 'quarterly' | 'yearly' | 'custom';

/**
 * Payment methods. The online ones (upi/card/netbanking) run through the
 * flow's gateway checkout — Razorpay or the built-in demo checkout, chosen by
 * the super admin. 'pay_at_ground' only applies to tournament ground fees.
 */
export type OnlinePaymentMethod = 'upi' | 'card' | 'netbanking';
export type PaymentMethod = OnlinePaymentMethod | 'pay_at_ground';
export type PaymentFlow = 'subscription' | 'registration';
export type PaymentProvider = 'demo' | 'razorpay';

export interface PaymentGatewayConfig {
  provider: PaymentProvider;
  key_id: string;
  has_key_secret: boolean;
  /** Whether checkout can currently start on this flow. */
  ready: boolean;
  /** Write-only: set to replace the saved secret, omit to keep it. */
  key_secret?: string;
}
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billing_type: BillingType;
  billing_interval?: BillingInterval;
  tournament_limit: number;
  team_limit: number;
  player_limit: number;
  storage_limit_mb: number;
  ad_limit: number;
  features: string[];
  sort_order?: number;
  /** "Most popular" badge; at most one plan holds it. */
  is_popular?: boolean;
  /** "Best value" badge; at most one plan holds it. */
  is_best_value?: boolean;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface PlatformSettings {
  platform_name: string;
  country: string;
  support_email: string;
  support_phone: string;
  currency_symbol: string;
  currency_code: string;
  enable_public_signup: boolean;
  require_admin_approval_for_orgs: boolean;
  grace_period_days: number;
  payment_gateway_mode: 'sandbox' | 'live';
  /** Methods organizers may offer teams for ground fees. */
  enabled_payment_methods: PaymentMethod[];
  /** Methods offered when organizers buy or renew a plan. */
  subscription_payment_methods: OnlinePaymentMethod[];
  payment_gateways: Record<PaymentFlow, PaymentGatewayConfig>;
  footer: FooterContent;
}

export type SocialNetwork = 'facebook' | 'instagram' | 'youtube' | 'x' | 'whatsapp';

/** Landing-page footer, edited by the super admin in Platform Settings. */
export interface FooterContent {
  tagline: string;
  links: { label: string; url: string }[];
  social: Record<SocialNetwork, string>;
  copyright: string;
  show_contact: boolean;
}

/** GET /footer — FooterContent plus the public support contact (null when hidden). */
export interface PublicFooter extends FooterContent {
  platform_name: string;
  support_email: string | null;
  support_phone: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string;
  banner: string;
  type: OrganizationType;
  description: string;
  contact_person: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  village: string;
  panchayat: string;
  municipality: string;
  district: string;
  state: string;
  country: string;
  website: string;
  social_media: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    twitter?: string;
  };
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar: string;
  organization_id?: string;
  /** Password was set by someone else (onboarding, an admin reset); must be replaced at sign-in. */
  must_change_password?: boolean;
  /** Documents (`terms`, `privacy`) this account must accept before the app lets it work. */
  legal_pending?: ('terms' | 'privacy')[];
  /** Accepted some earlier version — so a prompt now is about an update. */
  legal_accepted_before?: boolean;
  /** Set when this session is a super admin looking through the account (impersonation). */
  impersonated_by?: string | null;
}

/** The server's list envelope: one page plus what is needed to draw a pager. */
export interface Paginated<T> {
  data: T[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  next_billing_date?: string;
  auto_renew: boolean;
  amount_paid: number;
  currency: string;
  organization_name?: string;
  plan_name?: string;
  plan_price?: number;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  organization_id: string;
  subscription_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  payment_method: string;
  transaction_reference: string;
  billing_name: string;
  billing_email: string;
  billing_address: string;
  created_at: string;
}

export type SportCode = 'football' | 'cricket';

export interface Sport {
  id: string;
  name: string;
  code: SportCode;
  icon: string;
  is_active: boolean;
}

export type TournamentFormat = 'league' | 'knockout' | 'group_stage' | 'league_knockout';
export type TournamentStatus = 
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'upcoming'
  | 'ongoing'
  | 'completed'
  | 'cancelled';

export interface TournamentSettings {
  squad_min_players: number;
  squad_max_players: number;
  max_substitutes: number;
  require_detailed_positions?: boolean;
  
  // Football
  football_format?: '5-a-side' | '7-a-side' | '9-a-side' | '11-a-side';
  match_duration_minutes?: number;
  half_duration_minutes?: number;
  extra_time_minutes?: number;
  enable_penalty_shootout?: boolean;
  points_win?: number;
  points_draw?: number;
  points_loss?: number;

  // Cricket
  cricket_format?: 'T10' | 'T20' | '15 overs' | 'custom';
  total_overs?: number;
  powerplay_overs?: number;
  max_overs_per_bowler?: number;
  enable_super_over?: boolean;
  playing_xi_count?: number;
}

export interface Tournament {
  id: string;
  organization_id: string;
  sport_id: string;
  sport_code: SportCode;
  name: string;
  slug: string;
  logo: string;
  banner: string;
  poster: string;
  description: string;
  location: string;
  village: string;
  panchayat: string;
  municipality: string;
  district: string;
  state: string;
  start_date: string;
  end_date: string;
  registration_opening: string;
  registration_closing: string;
  format: TournamentFormat;
  max_teams: number;
  ground_fee: number;
  payment_config: {
    allow_partial: boolean;
    min_partial_type: 'percentage' | 'fixed';
    min_partial_value: number;
    enabled_methods?: PaymentMethod[];
  };
  prize_money: number;
  runner_up_prize: number;
  contact_person: string;
  phone: string;
  whatsapp: string;
  status: TournamentStatus;
  settings: TournamentSettings;
  has_auction?: boolean; // Controls whether this tournament has an auction or direct team registration
  auction_id?: string;
  auction_status?: AuctionStatus;
  auction_start_time?: string;
  auction_end_time?: string;
  created_at: string;
  updated_at: string;

  // Enriched fields
  organization_name?: string;
  teams_count?: number;
  approved_teams_count?: number;
  registration_link_token?: string;
}

export interface RegistrationLink {
  id: string;
  tournament_id: string;
  organization_id: string;
  token: string;
  status: 'active' | 'disabled' | 'expired';
  max_teams: number;
  current_registrations: number;
  deadline?: string;
  created_at: string;
}

export type TeamStatus = 'pending' | 'changes_required' | 'approved' | 'rejected' | 'suspended' | 'withdrawn';

export interface Team {
  id: string;
  tournament_id: string;
  organization_id: string;
  name: string;
  short_name: string;
  logo: string;
  village: string;
  panchayat: string;
  district: string;
  jersey_color: string;
  secondary_jersey_color?: string;
  captain_name: string;
  manager_name: string;
  manager_phone: string;
  manager_whatsapp: string;
  manager_email: string;
  manager_address: string;
  status: TeamStatus;
  approval_notes?: string;
  group_name?: string;
  created_at: string;
  updated_at: string;
  players_count?: number;
  players?: Player[];
  payment?: RegistrationPayment;
  receipt?: RegistrationReceipt;
}

export type FootballPosition = 
  | 'Goalkeeper'
  | 'Centre Back'
  | 'Left Back'
  | 'Right Back'
  | 'Defensive Midfielder'
  | 'Central Midfielder'
  | 'Attacking Midfielder'
  | 'Left Wing'
  | 'Right Wing'
  | 'Striker';

export type CricketRole = 
  | 'Batter'
  | 'Bowler'
  | 'All-rounder'
  | 'Wicketkeeper'
  | 'Wicketkeeper + Batter';

export type CricketBowlingStyle = 
  | 'Fast'
  | 'Medium Fast'
  | 'Medium'
  | 'Off Spin'
  | 'Leg Spin'
  | 'Left-arm Orthodox'
  | 'Left-arm Wrist Spin'
  | 'None';

export type CricketBattingStyle = 'Right Hand' | 'Left Hand';

export interface Player {
  id: string;
  /** "Player Stats" code (e.g. SP-7K4Q2), shared by all of one person's squad entries */
  player_code?: string;
  team_id: string;
  tournament_id: string;
  organization_id: string;
  full_name: string;
  photo?: string;
  age?: number;
  dob?: string;
  mobile?: string;
  jersey_number: number;
  is_captain: boolean;
  is_wicketkeeper?: boolean;
  football_position?: FootballPosition;
  cricket_role?: CricketRole;
  cricket_bowling_style?: CricketBowlingStyle;
  cricket_batting_style?: CricketBattingStyle;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 
  | 'unpaid'
  | 'payment_pending'
  | 'partially_paid'
  | 'fully_paid'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface RegistrationPayment {
  id: string;
  team_id: string;
  tournament_id: string;
  organization_id: string;
  total_fee: number;
  paid_amount: number;
  remaining_amount: number;
  payment_option: 'full' | 'partial';
  status: PaymentStatus;
  payment_method: 'online' | 'cash' | 'upi' | 'bank_transfer' | 'other';
  transaction_id: string;
  receipt_number: string;
  notes?: string;
  recorded_by_admin: boolean;
  recorded_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface RegistrationReceipt {
  id: string;
  payment_id: string;
  team_id: string;
  tournament_id: string;
  organization_id: string;
  receipt_number: string;
  issued_at: string;
  receipt_data: {
    tournament_name: string;
    organization_name: string;
    team_name: string;
    manager_name: string;
    manager_phone: string;
    total_fee: number;
    paid_amount: number;
    remaining_balance: number;
    payment_method: string;
    transaction_id: string;
    status: PaymentStatus;
    qr_code_signature: string;
  };
}

export interface Venue {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  village: string;
  panchayat: string;
  district: string;
  google_maps_url?: string;
  created_at: string;
}

export type MatchStatus = 
  | 'scheduled'
  | 'toss'
  | 'in_progress'
  | 'half_time'
  | 'innings_break'
  | 'drinks_break'
  | 'delayed'
  | 'completed'
  | 'abandoned'
  | 'cancelled';

export interface Match {
  id: string;
  tournament_id: string;
  organization_id: string;
  sport_code: SportCode;
  match_number: number;
  round_name: string;
  team_a_id: string;
  team_b_id: string;
  venue_id?: string;
  scheduled_at: string;
  status: MatchStatus;
  delay_reason?: string;
  winner_team_id?: string;
  result_summary?: string;
  man_of_the_match_player_id?: string;
  toss_caller_team_id?: string | null;
  toss_call?: 'heads' | 'tails' | null;
  toss_result?: 'heads' | 'tails' | null;
  toss_winner_team_id?: string | null;
  toss_decision?: TossDecision | null;
  toss_method?: 'digital' | 'manual' | null;
  toss_time?: string | null;
  batting_first_team_id?: string | null;
  /** Football: the side kicking off, as the toss decided. */
  kick_off_team_id?: string | null;
  /** What the big screen is showing; `auto` follows `status` as it always did. */
  scoreboard_stage?: ScoreboardStage;
  /** Squad-reveal position: -1 plays, anything else holds on that many players. */
  scoreboard_cursor?: number;
  scoreboard_stage_at?: string | null;
  created_at: string;
  updated_at: string;
  team_a?: Team;
  team_b?: Team;
  venue?: Venue | null;
  football_state?: FootballMatchState | null;
  cricket_state?: CricketMatchState | null;
}

/** The segments a stadium display can be pointed at from the scorer console. */
export type ScoreboardStage = 'auto' | 'toss' | 'lineups' | 'live' | 'scorecard' | 'ad' | 'announcement';

/**
 * Response of POST /matches/{id}/scoreboard/stage, and the payload of every
 * SCOREBOARD_STAGE_CHANGED broadcast.
 */
export interface ScoreboardState {
  match_id: string;
  stage: ScoreboardStage;
  /** `stage` with `auto` already resolved against the match status. */
  resolved_stage: Exclude<ScoreboardStage, 'auto'>;
  cursor: number;
  stage_at: string | null;
  reveal_interval_seconds: number;
  /** The ad or announcement filling the screen, for those two stages. */
  item_id: string | null;
  item: Advertisement | Announcement | null;
  /** When the item comes off by itself; null while held or when none is up. */
  ends_at: string | null;
}

/**
 * One player's place in a single match's team sheet. `id` is null for the
 * default sheet the server derives from the squad when none has been saved.
 */
export interface MatchLineupEntry {
  id: string | null;
  match_id: string;
  team_id: string;
  player_id: string;
  batting_order: number;
  is_playing: boolean;
  is_captain: boolean;
  is_wicketkeeper: boolean;
  player: Player;
}

export interface ScorecardBattingRow {
  player_id: string;
  name: string;
  jersey_number?: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: number;
  has_batted: boolean;
  is_out: boolean;
  /** Traditional shorthand, e.g. "c Anas b Rahul". */
  dismissal: string | null;
}

export interface ScorecardBowlingRow {
  player_id: string;
  name: string;
  jersey_number?: number;
  /** Overs.balls notation — "3.4" is three overs and four balls. */
  overs: string;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}

/** One innings of the card derived from the delivery log; never stored. */
export interface ScorecardInnings {
  innings: 1 | 2;
  batting_team_id: string;
  bowling_team_id: string;
  runs: number;
  wickets: number;
  overs: number;
  extras: number;
  batting: ScorecardBattingRow[];
  bowling: ScorecardBowlingRow[];
}

/** Response shape of GET/POST /matches/{id}/toss/* — mirrors the toss fields on `Match`. */
export interface TossResult {
  match_id: string;
  toss_caller_team_id: string | null;
  toss_call: 'heads' | 'tails' | null;
  toss_result: 'heads' | 'tails' | null;
  toss_winner_team_id: string | null;
  toss_decision: TossDecision | null;
  toss_method: 'digital' | 'manual' | null;
  toss_time: string | null;
  batting_first_team_id: string | null;
  kick_off_team_id: string | null;
}

/** Cricket: bat or bowl. Football: take the kick-off, or choose ends. */
export type TossDecision = 'bat' | 'bowl' | 'kick_off' | 'ends';

export type FootballEventType = 
  | 'goal'
  | 'own_goal'
  | 'penalty_goal'
  | 'penalty_missed'
  | 'yellow_card'
  | 'red_card'
  | 'substitution'
  | 'injury';

export interface FootballEvent {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string;
  event_type: FootballEventType;
  minute: number;
  assist_player_id?: string | null;
  sub_in_player_id?: string | null;
  sub_out_player_id?: string | null;
  extra_info?: string | null;
  created_at: string;
}

export interface FootballMatchState {
  id: string;
  match_id: string;
  team_a_score: number;
  team_b_score: number;
  team_a_penalties?: number;
  team_b_penalties?: number;
  current_half: FootballPeriod;
  match_minute: number;
  /** The clock as it stood when last stopped. */
  elapsed_seconds: number;
  /** The clock when the server answered; count on from here while it runs. */
  clock_seconds: number;
  is_timer_running: boolean;
  timer_started_at_epoch?: number | null;
  events: FootballEvent[];
}

export type FootballPeriod = '1' | 'half_time' | '2' | 'extra_1' | 'extra_2' | 'penalties' | 'full_time';

export interface FootballCardGoal {
  event_id: string;
  minute: number;
  type: 'goal' | 'penalty_goal' | 'own_goal';
  player_id: string | null;
  name: string | null;
  assist_player_id: string | null;
  assist_name: string | null;
}

export interface FootballCardBooking {
  event_id: string;
  minute: number;
  type: 'yellow_card' | 'red_card';
  player_id: string | null;
  name: string | null;
}

export interface FootballCardSubstitution {
  event_id: string;
  minute: number;
  in_player_id: string | null;
  in_name: string | null;
  out_player_id: string | null;
  out_name: string | null;
}

/**
 * One side of the football match card derived from the event log; never
 * stored. Goals sit under the side they counted for, own goals included.
 */
export interface FootballScorecardSide {
  team_id: string;
  score: number;
  goals: FootballCardGoal[];
  cards: FootballCardBooking[];
  substitutions: FootballCardSubstitution[];
  missed_penalties: { event_id: string; minute: number; player_id: string | null; name: string | null }[];
}

export interface CricketDelivery {
  id: string;
  match_id: string;
  innings: 1 | 2;
  over_number: number;
  ball_number: number;
  bowler_id: string;
  striker_id: string;
  non_striker_id: string;
  runs_scored: number;
  extras: 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'none';
  extras_runs: number;
  is_wicket: boolean;
  wicket_type?: string;
  dismissed_player_id?: string;
  fielder_id?: string;
  commentary?: string;
  created_at: string;
}

export interface CricketMatchState {
  id: string;
  match_id: string;
  total_overs: number;
  toss_winner_team_id?: string;
  toss_decision?: TossDecision;
  current_innings: 1 | 2;
  batting_team_id: string;
  bowling_team_id: string;
  team_a_runs: number;
  team_a_wickets: number;
  team_a_overs: number;
  team_b_runs: number;
  team_b_wickets: number;
  team_b_overs: number;
  current_striker_id?: string;
  current_non_striker_id?: string;
  current_bowler_id?: string;
  target_runs?: number;
  required_run_rate?: number;
  current_run_rate?: number;
  deliveries: CricketDelivery[];
}

export interface Standing {
  id: string;
  tournament_id: string;
  organization_id: string;
  team_id: string;
  group_name?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  no_result: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  runs_scored: number;
  overs_faced: number;
  runs_conceded: number;
  overs_bowled: number;
  net_run_rate: number;
  points: number;
  form: string[];
  rank: number;
  team_name?: string;
  team_logo?: string;
}

export interface Sponsor {
  id: string;
  organization_id: string;
  name: string;
  logo: string;
  website?: string;
  tier: 'title' | 'main' | 'gold' | 'silver' | 'local';
  description?: string;
  phone?: string;
  email?: string;
  created_at: string;
}

export interface Advertisement {
  id: string;
  organization_id: string;
  match_id: string | null;
  title: string;
  business_name: string;
  media_type: 'image' | 'banner' | 'video_card' | 'sponsor_card' | 'full_screen';
  media_url: string;
  logo_url?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  priority: number;
  /** Seconds on the big screen once pushed; 0 holds until switched back. */
  duration_seconds: number;
  status: 'active' | 'inactive' | 'scheduled';
  created_at: string;
}

export interface Announcement {
  id: string;
  organization_id: string;
  tournament_id?: string;
  match_id: string | null;
  title: string;
  message: string;
  type: 'general' | 'urgent_match_delay' | 'venue_change' | 'registration_alert';
  /** Seconds on the big screen once pushed; 0 holds until switched back. */
  duration_seconds: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id?: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  ip_address?: string;
  created_at: string;
}

// ============================================================================
// PLAYER AUCTION SYSTEM TYPES
// ============================================================================

export type AuctionStatus = 'draft' | 'upcoming' | 'registration_open' | 'registration_closed' | 'live' | 'paused' | 'completed' | 'cancelled';
export type AuctionHammerState = 'waiting' | 'bidding' | 'going_once' | 'going_twice' | 'sold' | 'unsold';
export type AuctionPlayerStatus = 'registered' | 'approved' | 'in_hammer' | 'sold' | 'unsold' | 'rejected';
export type AuctionCategory = 'Icon' | 'Category A' | 'Category B' | 'Category C' | 'Emerging';

export interface AuctionBid {
  id: string;
  auction_id: string;
  player_id: string;
  team_id: string;
  team_name: string;
  amount: number;
  timestamp: string;
}

export interface AuctionPlayer {
  id: string;
  auction_id: string;
  tournament_id: string;
  organization_id: string;
  player_id?: string;
  user_id?: string;
  full_name: string;
  mobile: string;
  email?: string;
  photo: string;
  age: number;
  village: string;
  district: string;
  sport_code: SportCode;
  category: AuctionCategory;
  base_price: number;
  sold_price?: number;
  sold_to_team_id?: string;
  sold_to_team_name?: string;
  status: AuctionPlayerStatus;
  payment_status?: 'pending' | 'paid';
  payment_amount?: number;
  payment_method?: 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other';
  payment_reference?: string;
  payment_notes?: string;
  paid_at?: string;
  paid_by_user_id?: string;
  cricket_role?: CricketRole;
  cricket_batting_style?: CricketBattingStyle;
  cricket_bowling_style?: CricketBowlingStyle;
  football_position?: FootballPosition;
  football_preferred_foot?: 'left' | 'right' | 'both';
  past_achievements?: string;
  created_at: string;
}

export interface TeamDisbursementSummary {
  team_id: string;
  team_name: string;
  logo?: string;
  manager_name?: string;
  manager_phone?: string;
  virtual_purse: number;
  virtual_spent: number;
  virtual_remaining: number;
  players_acquired_count: number;
  total_player_entitlement: number;
  paid_amount: number;
  pending_amount: number;
  paid_count: number;
  pending_count: number;
}

export interface AuctionPaymentSummary {
  total_sold_players: number;
  total_entitled_amount: number;
  total_paid_amount: number;
  total_pending_amount: number;
  paid_players_count: number;
  pending_players_count: number;
  settlement_percentage: number;
  average_player_payout: number;
  highest_payout: number;
  highest_payout_player?: AuctionPlayer;
}

export interface AuctionPaymentReport {
  auction: Auction;
  tournament?: Tournament;
  organization?: Organization;
  summary: AuctionPaymentSummary;
  team_summaries: TeamDisbursementSummary[];
  sold_players: AuctionPlayer[];
  virtual_money_disclaimer?: string;
}

export interface TeamAuctionPurse {
  team_id: string;
  team_name: string;
  logo?: string;
  total_purse: number;
  spent_amount: number;
  remaining_purse: number;
  players_bought_count: number;
  max_players: number;
  bought_players: AuctionPlayer[];
}

export interface Auction {
  id: string;
  tournament_id: string;
  organization_id: string;
  title: string;
  token: string; // public registration link token
  status: AuctionStatus;
  auction_date: string;
  team_purse: number; // e.g. ₹100,000
  min_bid_increment: number; // e.g. ₹500
  max_players_per_team: number;
  min_players_per_team: number;
  base_prices: {
    category: AuctionCategory;
    price: number;
  }[];
  current_player_id?: string | null;
  current_bid_amount?: number;
  current_bid_team_id?: string | null;
  current_bid_team_name?: string | null;
  hammer_state: AuctionHammerState;
  hammer_timer_seconds: number;
  bid_history: AuctionBid[];
  accelerated_round_active?: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// COMPREHENSIVE PLAYER CAREER & TOURNAMENT STATISTICS
// ============================================================================

// Every number is derived from the scoring logs on the server. Ratios with
// nothing to divide by (an average with no dismissals, an economy with no
// balls bowled) are null, not zero.

export interface CricketPlayerStats {
  matches: number;
  innings_batted: number;
  runs_scored: number;
  balls_faced: number;
  highest_score: number | null;
  highest_score_not_out: boolean;
  batting_average: number | null;
  strike_rate: number | null;
  centuries: number;
  fifties: number;
  fours: number;
  sixes: number;
  ducks: number;
  not_outs: number;
  innings_bowled: number;
  balls_bowled: number;
  /** overs.balls notation: 16.2 is sixteen overs and two balls */
  overs_bowled: number;
  maidens: number;
  runs_conceded: number;
  wickets_taken: number;
  bowling_average: number | null;
  economy_rate: number | null;
  bowling_strike_rate: number | null;
  best_bowling_wickets: number | null;
  best_bowling_runs: number | null;
  /** three or four wickets in a match */
  three_wicket_hauls: number;
  five_wicket_hauls: number;
  catches: number;
  stumpings: number;
  run_outs: number;
  player_of_match_count: number;
}

export interface FootballPlayerStats {
  matches: number;
  goals: number;
  penalties_scored: number;
  penalties_missed: number;
  own_goals: number;
  assists: number;
  goals_per_match: number | null;
  clean_sheets: number;
  yellow_cards: number;
  red_cards: number;
  player_of_match_count: number;
}

export interface PlayerAward {
  id: string;
  title: string;
  match_id: string;
  opponent_name: string | null;
  date: string;
  tournament_id: string;
  tournament_name: string;
}

/** One match from a player's point of view. */
export interface PlayerMatchPerformance {
  match_id: string;
  match_number: number;
  round_name: string;
  date: string;
  status: string;
  tournament_id: string;
  tournament_name: string;
  sport_code: SportCode;
  team_id: string;
  team_name: string | null;
  opponent_team_id: string;
  opponent_name: string;
  result: 'won' | 'lost' | 'drawn' | 'tied' | null;
  result_summary: string | null;
  player_of_match: boolean;
  /** scorebook shorthand, e.g. "42* (26) & 1/14 (2.0 ov)" or "2 goals (1 pen)" */
  summary: string;
  cricket?: {
    batting: { runs: number; balls: number; fours: number; sixes: number; not_out: boolean; strike_rate: number | null } | null;
    bowling: { overs: number; balls: number; maidens: number; runs: number; wickets: number; economy: number | null } | null;
    fielding: { catches: number; stumpings: number; run_outs: number };
  };
  football?: {
    goals: number;
    penalty_goals: number;
    penalties_missed: number;
    own_goals: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
    clean_sheet: boolean;
  };
}

export interface PlayerStats {
  id: string;
  player_id: string;
  full_name: string;
  player_code?: string | null;
  photo?: string | null;
  jersey_number?: number;
  team_id?: string | null;
  team_name?: string | null;
  organization_id: string;
  tournament_id?: string;
  sport_code: SportCode;
  cricket?: CricketPlayerStats | null;
  football?: FootballPlayerStats | null;
  /** the last five matches, newest first */
  recent_performances?: PlayerMatchPerformance[];
  awards?: PlayerAward[];
  updated_at: string;
}

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface PlayerCareer {
  linked_to_account: boolean;
  tournaments_count: number;
  cricket: CricketPlayerStats | null;
  football: FootballPlayerStats | null;
  tournaments: {
    tournament: { id: string; name: string; slug: string; sport_code: SportCode; status: string; start_date: string };
    player_id: string;
    team_id: string;
    team_name: string | null;
    stats: CricketPlayerStats | FootballPlayerStats;
  }[];
  awards: PlayerAward[];
}

export interface TournamentPlayerStatsRow {
  player_id: string;
  full_name: string;
  photo: string | null;
  jersey_number: number;
  team_id: string;
  team_name: string | null;
  role: string | null;
  is_captain: boolean;
  stats: CricketPlayerStats | FootballPlayerStats;
}

export interface TournamentPlayerStatsResponse {
  tournament: { id: string; name: string; slug: string; sport_code: SportCode };
  sport: SportCode;
  sort: string;
  sort_options: string[];
  data: TournamentPlayerStatsRow[];
  meta: PageMeta;
}

