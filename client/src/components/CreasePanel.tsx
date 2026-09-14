import React from 'react';
import type { MatchLineupEntry } from '../types';
import { ArrowLeftRight } from 'lucide-react';

interface CreasePanelProps {
  batters: MatchLineupEntry[];
  bowlers: MatchLineupEntry[];
  strikerId?: string | null;
  nonStrikerId?: string | null;
  bowlerId?: string | null;
  /** Players already dismissed this innings — they can't come back in. */
  dismissedIds: string[];
  onChange: (field: 'striker' | 'nonStriker' | 'bowler', playerId: string) => void;
  onSwap: () => void;
}

/**
 * Who is at the crease and who is bowling.
 *
 * Every delivery is recorded against these three players, so the scorer names
 * them before the keypad unlocks. Without it the runs and wickets belong to
 * nobody, which is exactly what used to happen: the console posted whatever
 * the state row held, and nothing ever put anyone in it.
 */
export const CreasePanel: React.FC<CreasePanelProps> = ({
  batters,
  bowlers,
  strikerId,
  nonStrikerId,
  bowlerId,
  dismissedIds,
  onChange,
  onSwap,
}) => {
  const ready = Boolean(strikerId && nonStrikerId && bowlerId);

  const batterOptions = (exclude?: string | null) =>
    batters.filter(row => !dismissedIds.includes(row.player_id) && row.player_id !== exclude);

  return (
    <div className="p-5 rounded-3xl glass-panel border border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">At the Crease</span>
        <button
          onClick={onSwap}
          disabled={!strikerId || !nonStrikerId}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-40"
          title="Swap the ends without recording a ball"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Swap Ends</span>
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block text-slate-400 mb-1 font-semibold">Striker *</label>
          <select
            value={strikerId || ''}
            onChange={event => onChange('striker', event.target.value)}
            className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
          >
            <option value="">Select batter…</option>
            {batterOptions(nonStrikerId).map(row => (
              <option key={row.player_id} value={row.player_id}>
                #{row.player.jersey_number} {row.player.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-semibold">Non-striker</label>
          <select
            value={nonStrikerId || ''}
            onChange={event => onChange('nonStriker', event.target.value)}
            className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
          >
            <option value="">Select batter…</option>
            {batterOptions(strikerId).map(row => (
              <option key={row.player_id} value={row.player_id}>
                #{row.player.jersey_number} {row.player.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-semibold">Bowler</label>
          <select
            value={bowlerId || ''}
            onChange={event => onChange('bowler', event.target.value)}
            className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
          >
            <option value="">Select bowler…</option>
            {bowlers.map(row => (
              <option key={row.player_id} value={row.player_id}>
                #{row.player.jersey_number} {row.player.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!ready && (
        <p className="text-[11px] text-amber-400 font-semibold">
          Name both batters and the bowler to unlock the scoring keypad — every ball is recorded against them.
        </p>
      )}
    </div>
  );
};
