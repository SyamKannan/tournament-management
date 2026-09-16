// Shape of GET /matches/current (the home-page ticker) and the helpers both
// the ticker and its match popup use to read it.
import type { SportCode } from '../types';
import { periodLabel } from './football';

export interface TickerTeam {
  id: string;
  name: string;
  short_name: string;
  logo: string | null;
}

export interface TickerMatch {
  id: string;
  sport_code: SportCode;
  status: string;
  is_live: boolean;
  round_name: string;
  scheduled_at: string;
  result_summary: string | null;
  tournament: { id: string; name: string; slug: string } | null;
  team_a: TickerTeam;
  team_b: TickerTeam;
  football: { team_a_score: number; team_b_score: number; current_half: string } | null;
  cricket: {
    current_innings: number;
    target_runs: number | null;
    /** in batting order: the side batting first, then the chasing side */
    innings: { team_id: string; runs: number; wickets: number; overs: number }[];
  } | null;
}

export const hasStarted = (match: TickerMatch) => match.is_live || match.status === 'completed';

/** "185/4" for a side that has batted, blank for one yet to bat or a match not started. */
export const cricketScore = (match: TickerMatch, teamId: string): string => {
  if (!hasStarted(match) || !match.cricket) return '';
  const index = match.cricket.innings.findIndex(i => i.team_id === teamId);
  const innings = match.cricket.innings[index];
  if (!innings) return '';
  const batting = index === 0 || match.cricket.current_innings >= 2 || match.status === 'completed';
  return batting ? `${innings.runs}/${innings.wickets}` : '';
};

/** The score shown beside a team: goals, or runs/wickets. */
export const teamScore = (match: TickerMatch, side: 'a' | 'b'): string => {
  if (!hasStarted(match)) return '';
  if (match.sport_code === 'football') {
    return match.football ? String(side === 'a' ? match.football.team_a_score : match.football.team_b_score) : '';
  }
  return cricketScore(match, (side === 'a' ? match.team_a : match.team_b).id);
};

/** A short word or two for where the match is. */
export const matchStateLabel = (match: TickerMatch): string => {
  if (match.status === 'completed') return 'Result';
  if (match.status === 'half_time') return 'Half Time';
  if (match.status === 'innings_break') return 'Innings Break';
  if (match.status === 'drinks_break') return 'Drinks';
  if (match.is_live) return match.sport_code === 'football' && match.football ? periodLabel(match.football.current_half) : 'Live';
  if (match.status === 'delayed') return 'Delayed';
  const date = new Date(match.scheduled_at);
  return Number.isNaN(date.getTime())
    ? 'Upcoming'
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
