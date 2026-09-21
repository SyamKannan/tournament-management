import React, { useEffect, useState } from 'react';
import type { MatchLineupEntry } from '../types';
import { AlertTriangle } from 'lucide-react';

/** What the scorer settles before a wicket can be recorded. */
export interface WicketDetails {
  wicket_type: string;
  dismissed_player_id: string;
  fielder_id?: string;
  next_striker_id?: string;
  /** Runs completed before the dismissal — only a run out can carry any. */
  runs_scored: number;
}

interface WicketDialogProps {
  batters: MatchLineupEntry[];
  fielders: MatchLineupEntry[];
  strikerId?: string | null;
  nonStrikerId?: string | null;
  dismissedIds: string[];
  onCancel: () => void;
  onConfirm: (details: WicketDetails) => void;
}

const DISMISSALS: { value: string; label: string; needsFielder: boolean }[] = [
  { value: 'bowled', label: 'Bowled', needsFielder: false },
  { value: 'caught', label: 'Caught', needsFielder: true },
  { value: 'lbw', label: 'LBW', needsFielder: false },
  { value: 'run_out', label: 'Run Out', needsFielder: true },
  { value: 'stumped', label: 'Stumped', needsFielder: true },
  { value: 'hit_wicket', label: 'Hit Wicket', needsFielder: false },
  { value: 'caught_and_bowled', label: 'Caught & Bowled', needsFielder: false },
  { value: 'retired_hurt', label: 'Retired Hurt', needsFielder: false },
  { value: 'obstructing_field', label: 'Obstructing the Field', needsFielder: false },
];

/**
 * Everything a wicket needs recording against a name: how the batter went, who
 * caught or ran them out, and who walks in next.
 *
 * Asked for at the moment it happens rather than patched up afterwards — the
 * delivery row is what the scorecard is read back out of, so a dismissal
 * without a dismissed player can't be reconstructed later.
 */
export const WicketDialog: React.FC<WicketDialogProps> = ({
  batters,
  fielders,
  strikerId,
  nonStrikerId,
  dismissedIds,
  onCancel,
  onConfirm,
}) => {
  const [type, setType] = useState('bowled');
  const [dismissedId, setDismissedId] = useState(strikerId || '');
  const [fielderId, setFielderId] = useState('');
  const [nextStrikerId, setNextStrikerId] = useState('');
  const [runsCompleted, setRunsCompleted] = useState(0);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handler);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  const selected = DISMISSALS.find(entry => entry.value === type);

  // A run out can take either batter; everything else is the striker's.
  const candidates = batters.filter(
    row => row.player_id === strikerId || (type === 'run_out' && row.player_id === nonStrikerId)
  );

  // Whoever is already out, plus the two at the crease, can't be the next in.
  const nextInOptions = batters.filter(
    row =>
      !dismissedIds.includes(row.player_id) &&
      row.player_id !== strikerId &&
      row.player_id !== nonStrikerId
  );

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wicket-title"
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in" onClick={onCancel} aria-hidden="true" />

      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-slate-900 ring-1 ring-slate-700/70 shadow-2xl shadow-black/60 p-5 sm:p-6 max-h-[92dvh] overflow-y-auto animate-dialog-in">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-11 h-11 rounded-xl grid place-items-center bg-rose-500/10 ring-1 ring-rose-500/30">
            <AlertTriangle className="w-5 h-5 text-rose-400" aria-hidden="true" />
          </div>
          <div>
            <h2 id="wicket-title" className="text-base font-bold text-white font-heading">Record a wicket</h2>
            <p className="mt-1 text-sm text-slate-400">This ball is credited to the bowler and the batter you name.</p>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-xs">
          <div>
            <label htmlFor="wicketdialog-how-out" className="block text-slate-400 mb-1 font-semibold">How out</label>
            <select id="wicketdialog-how-out"
              value={type}
              onChange={event => setType(event.target.value)}
              className="w-full px-3 py-2 rounded-xl glass-input bg-slate-950 text-white"
            >
              {DISMISSALS.map(entry => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wicketdialog-batter-out" className="block text-slate-400 mb-1 font-semibold">Batter out</label>
              <select id="wicketdialog-batter-out"
                value={dismissedId}
                onChange={event => setDismissedId(event.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input bg-slate-950 text-white"
              >
                {candidates.map(row => (
                  <option key={row.player_id} value={row.player_id}>{row.player.full_name}</option>
                ))}
              </select>
            </div>

            {selected?.needsFielder && (
              <div>
                <label htmlFor="wicketdialog-field" className="block text-slate-400 mb-1 font-semibold">
                  {type === 'stumped' ? 'Wicketkeeper' : 'Fielder'}
                </label>
                <select id="wicketdialog-field"
                  value={fielderId}
                  onChange={event => setFielderId(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input bg-slate-950 text-white"
                >
                  <option value="">Not recorded</option>
                  {fielders.map(row => (
                    <option key={row.player_id} value={row.player_id}>{row.player.full_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {type === 'run_out' && (
            <div>
              <label htmlFor="wicketdialog-runs-completed-before-the-run-ou" className="block text-slate-400 mb-1 font-semibold">Runs completed before the run out</label>
              <input id="wicketdialog-runs-completed-before-the-run-ou"
                type="number"
                min={0}
                max={6}
                value={runsCompleted}
                onChange={event => setRunsCompleted(Math.max(0, Number(event.target.value)))}
                className="w-full px-3 py-2 rounded-xl glass-input bg-slate-950 text-white font-mono"
              />
            </div>
          )}

          <div>
            <label htmlFor="wicketdialog-next-batter-in" className="block text-slate-400 mb-1 font-semibold">Next batter in</label>
            <select id="wicketdialog-next-batter-in"
              value={nextStrikerId}
              onChange={event => setNextStrikerId(event.target.value)}
              className="w-full px-3 py-2 rounded-xl glass-input bg-slate-950 text-white"
            >
              <option value="">Decide after the ball</option>
              {nextInOptions.map(row => (
                <option key={row.player_id} value={row.player_id}>
                  #{row.player.jersey_number} {row.player.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            disabled={!dismissedId}
            onClick={() => onConfirm({
              wicket_type: type,
              dismissed_player_id: dismissedId,
              fielder_id: fielderId || undefined,
              next_striker_id: nextStrikerId || undefined,
              runs_scored: type === 'run_out' ? runsCompleted : 0,
            })}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/40 disabled:opacity-50"
          >
            Record wicket
          </button>
        </div>
      </div>
    </div>
  );
};
