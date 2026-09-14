import React from 'react';
import type { ScorecardInnings } from '../types';

interface CricketScorecardTablesProps {
  /** One innings of the card the server derives from the delivery log. */
  card?: ScorecardInnings;
  /** Marked with a * — who is on strike right now. */
  strikerId?: string | null;
  /** Marked with a • — who is bowling right now. */
  bowlerId?: string | null;
}

/**
 * The batting card and bowling figures for one innings.
 *
 * This is the scorer's view, read at arm's length while working the match. The
 * stadium display deliberately doesn't show it — a full card can't be read
 * from the boundary, so the big screen carries only the players currently out
 * there.
 */
export const CricketScorecardTables: React.FC<CricketScorecardTablesProps> = ({
  card,
  strikerId,
  bowlerId,
}) => {
  if (!card) return null;

  const batted = card.batting.filter(row => row.has_batted);
  const yetToBat = card.batting.filter(row => !row.has_batted);

  // Before the first ball there is nothing to read; the crease panel and the
  // scoreline already say where things stand.
  if (batted.length === 0 && card.bowling.length === 0) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 overflow-x-auto">
        <div className="text-[11px] font-bold text-slate-400 uppercase mb-3 flex items-center justify-between">
          <span>Batting Card</span>
          <span className="font-mono text-slate-500">Extras {card.extras}</span>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-bold pb-1.5">Batter</th>
              <th className="text-right font-bold pb-1.5">R</th>
              <th className="text-right font-bold pb-1.5">B</th>
              <th className="text-right font-bold pb-1.5">4s</th>
              <th className="text-right font-bold pb-1.5">6s</th>
              <th className="text-right font-bold pb-1.5">SR</th>
            </tr>
          </thead>
          <tbody className="font-semibold">
            {batted.map(row => (
              <tr key={row.player_id} className="border-t border-slate-900">
                <td className="text-left py-1.5 pr-2">
                  <span className={row.is_out ? 'text-slate-400' : 'text-white'}>
                    {row.name}
                    {!row.is_out && row.player_id === strikerId && <span className="text-emerald-400"> *</span>}
                  </span>
                  <div className="text-[10px] font-normal text-slate-500">{row.dismissal || 'not out'}</div>
                </td>
                <td className="text-right font-mono text-white">{row.runs}</td>
                <td className="text-right font-mono text-slate-400">{row.balls}</td>
                <td className="text-right font-mono text-slate-400">{row.fours}</td>
                <td className="text-right font-mono text-slate-400">{row.sixes}</td>
                <td className="text-right font-mono text-slate-400">{row.strike_rate}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {yetToBat.length > 0 && (
          <p className="text-[11px] text-slate-500 mt-2.5 pt-2 border-t border-slate-900">
            <span className="font-bold uppercase tracking-wider">Yet to bat: </span>
            {yetToBat.map(row => row.name).join(', ')}
          </p>
        )}
      </div>

      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 overflow-x-auto">
        <div className="text-[11px] font-bold text-slate-400 uppercase mb-3">Bowling Figures</div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-bold pb-1.5">Bowler</th>
              <th className="text-right font-bold pb-1.5">O</th>
              <th className="text-right font-bold pb-1.5">M</th>
              <th className="text-right font-bold pb-1.5">R</th>
              <th className="text-right font-bold pb-1.5">W</th>
              <th className="text-right font-bold pb-1.5">Econ</th>
            </tr>
          </thead>
          <tbody className="font-semibold">
            {card.bowling.map(row => (
              <tr key={row.player_id} className="border-t border-slate-900">
                <td className="text-left py-1.5 pr-2 text-white">
                  {row.name}
                  {row.player_id === bowlerId && <span className="text-cyan-400"> •</span>}
                </td>
                <td className="text-right font-mono text-slate-300">{row.overs}</td>
                <td className="text-right font-mono text-slate-400">{row.maidens}</td>
                <td className="text-right font-mono text-slate-300">{row.runs}</td>
                <td className="text-right font-mono text-white">{row.wickets}</td>
                <td className="text-right font-mono text-slate-400">{row.economy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
