import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { matchStateLabel, teamScore, type TickerMatch, type TickerTeam } from '../lib/matchTicker';
import { MatchStatusPopup } from './MatchStatusPopup';

/** How often the ticker asks for fresh scores. */
const REFRESH_MS = 30_000;

const TeamScore: React.FC<{ team: TickerTeam; score: string }> = ({ team, score }) => (
  <span className="flex items-center gap-1.5">
    {team.logo && <img src={team.logo} alt="" className="w-5 h-5 rounded-full object-cover bg-slate-800" />}
    <span className="font-bold text-white">{team.short_name || team.name}</span>
    {score !== '' && <span className="font-mono font-black text-emerald-300">{score}</span>}
  </span>
);

/**
 * The home page's scrolling strip of current matches — live ones first, then
 * what's next and the latest results. Tapping one opens its score in a popup.
 */
export const LiveMatchesMarquee: React.FC = () => {
  const [matches, setMatches] = useState<TickerMatch[]>([]);
  const [selected, setSelected] = useState<TickerMatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.get<TickerMatch[]>('/matches/current')
      .then(res => { if (!cancelled) setMatches(res); })
      .catch(() => {});

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (matches.length === 0) return null;

  const liveCount = matches.filter(m => m.is_live).length;
  // Roughly the same reading speed however many matches there are.
  const duration = `${Math.max(25, matches.length * 7)}s`;

  const items = (copy: number) => matches.map(match => (
    <button
      key={`${copy}-${match.id}`}
      type="button"
      onClick={() => setSelected(match)}
      tabIndex={copy === 0 ? 0 : -1}
      aria-hidden={copy === 0 ? undefined : true}
      className="shrink-0 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-xs transition-colors"
    >
      <span className={`px-1.5 py-0.5 rounded text-xs font-black uppercase ${
        match.is_live ? 'bg-rose-500 text-white animate-live-blink' : match.status === 'completed' ? 'bg-slate-700 text-slate-200' : 'bg-cyan-500/15 text-cyan-300'
      }`}>
        {match.is_live ? 'Live' : match.status === 'completed' ? 'FT' : 'Next'}
      </span>
      <span>{match.sport_code === 'cricket' ? '🏏' : '⚽'}</span>
      <TeamScore team={match.team_a} score={teamScore(match, 'a')} />
      <span className="text-slate-500">vs</span>
      <TeamScore team={match.team_b} score={teamScore(match, 'b')} />
      <span className="text-slate-400">{matchStateLabel(match)}</span>
    </button>
  ));

  return (
    <div className="mt-8 sm:mt-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 justify-center">
        {liveCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-live-blink" />}
        <span>{liveCount > 0 ? `${liveCount} match${liveCount === 1 ? '' : 'es'} live now` : 'Matches'}</span>
        <span className="text-slate-600 normal-case font-normal">• tap a match for the score</span>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 py-2 backdrop-blur [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
        role="region"
        aria-label="Current matches"
      >
        <div
          className="flex w-max animate-marquee"
          style={{ '--marquee-duration': duration } as React.CSSProperties}
        >
          <div className="flex gap-3 pl-3">{items(0)}</div>
          <div className="flex gap-3 pl-3">{items(1)}</div>
        </div>
      </div>

      {selected && <MatchStatusPopup summary={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};
