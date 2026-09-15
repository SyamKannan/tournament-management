import { useEffect, useRef, useState } from 'react';
import type {
  FootballEvent, FootballMatchState, FootballPeriod, MatchLineupEntry, SportCode, TossDecision,
} from '../types';

export const PERIOD_LABELS: Record<FootballPeriod, string> = {
  '1': '1st Half',
  half_time: 'Half Time',
  '2': '2nd Half',
  extra_1: 'Extra Time 1',
  extra_2: 'Extra Time 2',
  penalties: 'Penalties',
  full_time: 'Full Time',
};

export const periodLabel = (period?: string | null) =>
  PERIOD_LABELS[(period ?? '1') as FootballPeriod] ?? '1st Half';

/** mm:ss, with minutes running past 60 the way a match clock does. */
export const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

/**
 * The match clock, ticking.
 *
 * Counts on from the server's own `clock_seconds` rather than from
 * `timer_started_at_epoch`, so a phone or a stadium PC with its clock set wrong
 * still shows the right minute. Re-anchors whenever a fresh state arrives.
 */
export const useFootballClock = (state?: FootballMatchState | null) => {
  const [, setTick] = useState(0);
  const running = Boolean(state?.is_timer_running);

  // Re-anchored during render on every state object the server sends, even
  // one carrying the same value — it was measured at a later moment. Doing it
  // here rather than in an effect keeps the first frame from showing the old
  // time.
  const anchorRef = useRef<{ state: FootballMatchState | null | undefined; seconds: number; at: number } | null>(null);
  if (!anchorRef.current || anchorRef.current.state !== state) {
    anchorRef.current = {
      state,
      seconds: state?.clock_seconds ?? state?.elapsed_seconds ?? 0,
      at: Date.now(),
    };
  }

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setTick(tick => tick + 1), 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  const { seconds, at } = anchorRef.current;
  return running ? seconds + Math.floor((Date.now() - at) / 1000) : seconds;
};

/** What the toss winner chose, as it reads after "chose to". */
export const tossDecisionPhrase = (decision?: TossDecision | null) => {
  switch (decision) {
    case 'bat': return 'bat';
    case 'bowl': return 'bowl';
    case 'kick_off': return 'take the kick-off';
    case 'ends': return 'choose ends';
    default: return '—';
  }
};

export const TOSS_DECISIONS: Record<SportCode, { value: TossDecision; label: string }[]> = {
  cricket: [
    { value: 'bat', label: 'Bat' },
    { value: 'bowl', label: 'Bowl' },
  ],
  football: [
    { value: 'kick_off', label: 'Take the kick-off' },
    { value: 'ends', label: 'Choose ends' },
  ],
};

/** The side a settled toss put first: batting (cricket) or kicking off (football). */
export const firstTeamId = (match: { batting_first_team_id?: string | null; kick_off_team_id?: string | null }) =>
  match.batting_first_team_id || match.kick_off_team_id || null;

/**
 * Who is on the pitch for one side: the starting sheet, with every recorded
 * substitution applied in order and everyone sent off taken out.
 */
export const onPitchIds = (
  lineups: MatchLineupEntry[],
  events: FootballEvent[],
  teamId: string,
  sentOff: string[],
) => {
  const onPitch = new Set(lineups.filter(row => row.team_id === teamId && row.is_playing).map(row => row.player_id));

  events
    .filter(event => event.team_id === teamId && event.event_type === 'substitution')
    .forEach(event => {
      if (event.sub_out_player_id) onPitch.delete(event.sub_out_player_id);
      if (event.sub_in_player_id) onPitch.add(event.sub_in_player_id);
    });

  sentOff.forEach(id => onPitch.delete(id));
  return onPitch;
};

export const FOOTBALL_EVENT_LABELS: Record<FootballEvent['event_type'], string> = {
  goal: 'Goal',
  penalty_goal: 'Penalty goal',
  own_goal: 'Own goal',
  penalty_missed: 'Penalty missed',
  yellow_card: 'Yellow card',
  red_card: 'Red card',
  substitution: 'Substitution',
  injury: 'Injury',
};

export const FOOTBALL_EVENT_ICONS: Record<FootballEvent['event_type'], string> = {
  goal: '⚽',
  penalty_goal: '⚽',
  own_goal: '⚽',
  penalty_missed: '✖',
  yellow_card: '🟨',
  red_card: '🟥',
  substitution: '🔁',
  injury: '✚',
};
