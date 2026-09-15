import React, { useEffect, useState } from 'react';
import type { Player } from '../types';
import { ArrowDown, ArrowUp, Repeat } from 'lucide-react';

interface SubstitutionDialogProps {
  teamName: string;
  /** Players the console believes are on the pitch for this side. */
  onPitch: Player[];
  /** Everyone else in the squad who may still come on. */
  bench: Player[];
  busy?: boolean;
  onConfirm: (change: { sub_out_player_id: string; sub_in_player_id: string }) => void;
  onCancel: () => void;
}

/**
 * One change for one side: who goes off, who comes on.
 *
 * Both lists are tap targets, like the cricket player prompts, because this is
 * done on a phone on the touchline. A player already on the pitch is never
 * offered as the one coming on, and nobody sent off is offered at all.
 */
export const SubstitutionDialog: React.FC<SubstitutionDialogProps> = ({
  teamName,
  onPitch,
  bench,
  busy,
  onConfirm,
  onCancel,
}) => {
  const [offId, setOffId] = useState('');
  const [onId, setOnId] = useState('');

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

  const list = (
    players: Player[],
    selected: string,
    select: (id: string) => void,
    tone: 'rose' | 'emerald',
    empty: string,
  ) => (
    <div className="space-y-1.5 max-h-[32vh] overflow-y-auto pr-1">
      {players.length === 0 && <p className="text-xs text-slate-500 py-3 text-center">{empty}</p>}
      {players.map(player => (
        <button
          key={player.id}
          type="button"
          onClick={() => select(player.id)}
          className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs transition-colors ${
            selected === player.id
              ? tone === 'rose'
                ? 'bg-rose-500/15 border-rose-500 text-white'
                : 'bg-emerald-500/15 border-emerald-500 text-white'
              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
          }`}
        >
          <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-900 border border-slate-800 grid place-items-center font-mono font-black text-slate-400">
            {player.jersey_number ?? '—'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold truncate">{player.full_name}</span>
            {player.football_position && (
              <span className="block text-[10px] text-slate-500 truncate">{player.football_position}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="substitution-title">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in" onClick={onCancel} aria-hidden="true" />

      <div className="relative w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl bg-slate-900 ring-1 ring-slate-700/70 shadow-2xl shadow-black/60 p-5 sm:p-6 animate-dialog-in">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl grid place-items-center ring-1 ring-cyan-500/30 bg-cyan-500/10">
            <Repeat className="w-5 h-5 text-cyan-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="substitution-title" className="text-base font-bold text-white font-heading">Substitution</h2>
            <p className="text-xs text-slate-400 truncate">{teamName}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-rose-300 mb-2 flex items-center gap-1">
              <ArrowDown className="w-3.5 h-3.5" /> Coming off
            </div>
            {list(onPitch, offId, setOffId, 'rose', 'Nobody is marked as on the pitch. Check the team sheet.')}
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-emerald-300 mb-2 flex items-center gap-1">
              <ArrowUp className="w-3.5 h-3.5" /> Coming on
            </div>
            {list(bench, onId, setOnId, 'emerald', 'Nobody is left on the bench.')}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!offId || !onId || offId === onId || busy}
            onClick={() => onConfirm({ sub_out_player_id: offId, sub_in_player_id: onId })}
            className="py-2.5 rounded-xl text-sm font-black text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Make the change
          </button>
        </div>
      </div>
    </div>
  );
};
