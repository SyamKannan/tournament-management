import React from 'react';
import { Trophy } from 'lucide-react';
import type { Tournament } from '../../types';

interface TournamentPickerProps {
  tournaments: Tournament[];
  value: string;
  onChange: (tournamentId: string) => void;
  label?: string;
}

/**
 * Switches the tournament a workspace page is showing.
 *
 * Pages that load a list of tournaments and act on one of them need this;
 * without it an organizer running several events can only ever see whichever
 * one happened to be selected first.
 *
 * Hidden when there is only one tournament, since there is nothing to choose.
 */
export const TournamentPicker: React.FC<TournamentPickerProps> = ({
  tournaments,
  value,
  onChange,
  label = 'Tournament',
}) => {
  if (tournaments.length <= 1) return null;

  return (
    <div className="flex items-center gap-2.5">
      <label htmlFor="tournament-picker" className="sr-only">{label}</label>
      <div className="relative flex items-center">
        <Trophy className="absolute left-3 w-4 h-4 text-emerald-400 pointer-events-none" aria-hidden="true" />
        <select
          id="tournament-picker"
          value={value}
          onChange={event => onChange(event.target.value)}
          className="appearance-none pl-9 pr-9 py-2.5 rounded-xl bg-slate-900 border border-slate-700
                     text-sm font-semibold text-white cursor-pointer transition-colors
                     hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500
                     max-w-[16rem] sm:max-w-xs truncate"
        >
          {tournaments.map(tournament => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.name}
            </option>
          ))}
        </select>
        <span className="absolute right-3 text-slate-500 pointer-events-none text-xs" aria-hidden="true">▼</span>
      </div>
    </div>
  );
};
