// Display helpers for player statistics. The API sends null for a ratio with
// nothing to divide by (no dismissals, no balls bowled), which reads as a dash.
import type { CricketPlayerStats, PlayerMatchPerformance } from '../types';

export const PLAYER_PHOTO_FALLBACK = {
  football: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80',
  cricket: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80',
} as const;

export const playerPhoto = (photo: string | null | undefined, sport: 'football' | 'cricket' = 'football') =>
  photo || PLAYER_PHOTO_FALLBACK[sport];

/** A number, or a dash when there is nothing to show. */
export const stat = (value: number | null | undefined, digits?: number): string => {
  if (value === null || value === undefined) return '–';
  return digits === undefined ? String(value) : value.toFixed(digits);
};

/** Overs in cricket notation — 16.2, never 16.20. */
export const overs = (value: number | null | undefined): string =>
  value === null || value === undefined ? '–' : value.toFixed(1);

export const highestScore = (s: CricketPlayerStats): string =>
  s.highest_score === null ? '–' : `${s.highest_score}${s.highest_score_not_out ? '*' : ''}`;

export const bestBowling = (s: CricketPlayerStats): string =>
  s.best_bowling_wickets === null ? '–' : `${s.best_bowling_wickets}/${s.best_bowling_runs}`;

export const RESULT_STYLES: Record<NonNullable<PlayerMatchPerformance['result']>, string> = {
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  lost: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  drawn: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  tied: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

/** "24 Aug 2026" from an ISO timestamp or a plain date; anything unparseable passes through. */
export const matchDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
