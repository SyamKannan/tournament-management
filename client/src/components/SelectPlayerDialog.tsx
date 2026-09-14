import React, { useEffect } from 'react';
import type { MatchLineupEntry } from '../types';
import { UserPlus } from 'lucide-react';

interface SelectPlayerDialogProps {
  title: string;
  subtitle?: string;
  options: MatchLineupEntry[];
  /** Accent for the action — a batter walking in, or a bowler taking over. */
  tone?: 'emerald' | 'cyan';
  onSelect: (playerId: string) => void;
  /** Closing without choosing falls back to the crease panel. */
  onCancel: () => void;
}

const TONES = {
  emerald: {
    ring: 'ring-emerald-500/30',
    bg: 'bg-emerald-500/10',
    icon: 'text-emerald-400',
    row: 'hover:border-emerald-500 hover:bg-emerald-500/10',
  },
  cyan: {
    ring: 'ring-cyan-500/30',
    bg: 'bg-cyan-500/10',
    icon: 'text-cyan-400',
    row: 'hover:border-cyan-500 hover:bg-cyan-500/10',
  },
};

/**
 * Asks the scorer for the one player the match is waiting on.
 *
 * Raised by the console itself the moment the crease is short — a batter out,
 * an over finished, an innings just begun — rather than left as a banner the
 * scorer has to notice. Scoring is blocked until it is answered anyway, so the
 * question may as well be put directly.
 *
 * A list of tap targets rather than a dropdown: this is used one-handed at the
 * boundary rope, between balls.
 */
export const SelectPlayerDialog: React.FC<SelectPlayerDialogProps> = ({
  title,
  subtitle,
  options,
  tone = 'emerald',
  onSelect,
  onCancel,
}) => {
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

  const palette = TONES[tone];

  return (
    <div
      className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-player-title"
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in" onClick={onCancel} aria-hidden="true" />

      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-slate-900 ring-1 ring-slate-700/70 shadow-2xl shadow-black/60 p-6 animate-dialog-in">
        <div className="flex items-start gap-4">
          <div className={`shrink-0 w-11 h-11 rounded-xl grid place-items-center ring-1 ${palette.ring} ${palette.bg}`}>
            <UserPlus className={`w-5 h-5 ${palette.icon}`} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="select-player-title" className="text-base font-bold text-white font-heading">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
        </div>

        <div className="mt-5 space-y-2 max-h-[52vh] overflow-y-auto pr-1">
          {options.length === 0 && (
            <p className="text-sm text-slate-500 py-4 text-center">
              Nobody is left to choose. Check the team sheet under Toss &amp; Squads.
            </p>
          )}

          {options.map(row => (
            <button
              key={row.player_id}
              onClick={() => onSelect(row.player_id)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left transition-colors ${palette.row}`}
            >
              <span className="w-9 h-9 shrink-0 rounded-xl bg-slate-900 border border-slate-800 grid place-items-center font-mono font-black text-slate-400 text-xs">
                {row.player.jersey_number ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-white text-sm truncate">{row.player.full_name}</span>
                {(row.player.cricket_role || row.is_captain || row.is_wicketkeeper) && (
                  <span className="block text-[11px] text-slate-500 truncate">
                    {[
                      row.player.cricket_role,
                      row.is_captain ? 'Captain' : null,
                      row.is_wicketkeeper ? 'Wicketkeeper' : null,
                    ].filter(Boolean).join(' • ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-slate-600">#{row.batting_order}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700"
        >
          Choose later
        </button>
      </div>
    </div>
  );
};
