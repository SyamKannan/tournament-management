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
 * Ground-fee methods an organizer can accept for a tournament, chosen at
 * creation time. 'upi' opens a real Razorpay Checkout (UPI/cards/netbanking/
 * wallets) once the backend has gateway keys configured.
 */
export type PaymentMethod = 'upi' | 'pay_at_ground';
export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'expired';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billing_type: BillingType;
  billing_interval?: BillingInterval;
  trial_days: number;
  tournament_limit: number;
  team_limit: number;
  player_limit: number;
  storage_limit_mb: number;
  ad_limit: number;
  features: string[];
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
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
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  trial_end_date?: string;
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
  created_at: string;
  updated_at: string;
  team_a?: Team;
  team_b?: Team;
  venue?: Venue | null;
  football_state?: FootballMatchState | null;
  cricket_state?: CricketMatchState | null;
}

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
  assist_player_id?: string;
  sub_in_player_id?: string;
  sub_out_player_id?: string;
  extra_info?: string;
  created_at: string;
}

export interface FootballMatchState {
  id: string;
  match_id: string;
  team_a_score: number;
  team_b_score: number;
  team_a_penalties?: number;
  team_b_penalties?: number;
  current_half: '1' | '2' | 'extra_1' | 'extra_2' | 'penalties' | 'full_time';
  match_minute: number;
  is_timer_running: boolean;
  timer_started_at_epoch?: number;
  events: FootballEvent[];
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
  toss_decision?: 'bat' | 'bowl';
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
  title: string;
  business_name: string;
  media_type: 'image' | 'banner' | 'video_card' | 'sponsor_card' | 'full_screen';
  display_placement?: 'ticker_banner' | 'break_screen' | 'goal_popup' | 'all';
  media_url: string;
  logo_url?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  priority: number;
  duration_seconds: number;
  status: 'active' | 'inactive' | 'scheduled';
  created_at: string;
}

export interface Announcement {
  id: string;
  organization_id: string;
  tournament_id?: string;
  title: string;
  message: string;
  type: 'general' | 'urgent_match_delay' | 'venue_change' | 'registration_alert';
  is_active_on_scoreboard: boolean;
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

export interface CricketPlayerStats {
  matches: number;
  innings_batted: number;
  runs_scored: number;
  balls_faced: number;
  highest_score: number;
  highest_score_not_out: boolean;
  batting_average: number;
  strike_rate: number;
  centuries: number;
  fifties: number;
  fours: number;
  sixes: number;
  ducks: number;
  not_outs: number;
  overs_bowled: number;
  maidens: number;
  runs_conceded: number;
  wickets_taken: number;
  bowling_average: number;
  economy_rate: number;
  best_bowling_wickets: number;
  best_bowling_runs: number;
  three_wicket_hauls: number;
  five_wicket_hauls: number;
  catches: number;
  stumpings: number;
  run_outs: number;
}

export interface FootballPlayerStats {
  matches: number;
  minutes_played: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  yellow_cards: number;
  red_cards: number;
  penalties_scored: number;
  shots_on_target: number;
  player_of_match_count: number;
}

export interface PlayerStats {
  id: string;
  player_id: string;
  user_id?: string;
  full_name: string;
  photo?: string;
  jersey_number?: number;
  team_id?: string;
  team_name?: string;
  organization_id: string;
  tournament_id?: string; // null for career stats, or specific tournament
  sport_code: SportCode;
  cricket?: CricketPlayerStats;
  football?: FootballPlayerStats;
  recent_performances?: {
    match_id: string;
    opponent_name: string;
    date: string;
    summary: string;
    rating?: number;
  }[];
  awards?: {
    id: string;
    title: string;
    date: string;
    tournament_name: string;
  }[];
  updated_at: string;
}

