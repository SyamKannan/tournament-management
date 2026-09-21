import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../services/api';
import type { FootballScorecardSide, ScorecardInnings } from '../types';
import { cricketScore, hasStarted, matchStateLabel, teamScore, type TickerMatch } from '../lib/matchTicker';

/** A live match's card is refreshed this often while the popup is open. */
const REFRESH_MS = 15_000;

interface MatchDetail {
  scorecard: ScorecardInnings[];
  football_scorecard: FootballScorecardSide[] | null;
}

const PlayerLink: React.FC<{ id: string | null; name: string | null }> = ({ id, name }) =>
  id ? (
    <Link to={`/players/${id}`} className="text-white hover:text-emerald-400 font-semibold">{name || 'Player'}</Link>
  ) : (
    <span className="text-white font-semibold">{name || 'Player'}</span>
  );

/**
 * A match's status at a glance, opened from the home-page ticker: the score,
 * where the match is, and who has done what — batters and bowlers, or goals
 * and cards. Player names open their stats.
 */
export const MatchStatusPopup: React.FC<{ summary: TickerMatch; onClose: () => void }> = ({ summary, onClose }) => {
  const [detail, setDetail] = useState<MatchDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.get<MatchDetail>(`/matches/${summary.id}`)
      .then(res => { if (!cancelled) setDetail(res); })
      .catch(() => {});

    load();
    const timer = summary.is_live ? setInterval(load, REFRESH_MS) : undefined;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [summary.id, summary.is_live]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const started = hasStarted(summary);
  const teamName = (id: string) => (id === summary.team_a.id ? summary.team_a.name : summary.team_b.name);

  /** Cricket adds the overs: "185/4 (18.2)". */
  const headlineScore = (side: 'a' | 'b') => {
    const score = teamScore(summary, side);
    if (summary.sport_code !== 'cricket' || !score) return score;
    const team = side === 'a' ? summary.team_a : summary.team_b;
    const innings = summary.cricket?.innings.find(i => i.team_id === team.id);
    return innings ? `${cricketScore(summary, team.id)} (${innings.overs.toFixed(1)})` : score;
  };

  // Portaled to <body>: the ticker sits inside animated, transformed parents,
  // which would otherwise pin this "fixed" overlay to them instead of the screen.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Match status">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default" />

      <div className="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl text-left">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur px-5 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-400 truncate">
              {[summary.tournament?.name, summary.round_name].filter(Boolean).join(' • ')}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold">
              {summary.is_live && <span className="w-2 h-2 rounded-full bg-rose-500 animate-live-blink" />}
              <span className={summary.is_live ? 'text-rose-400' : 'text-slate-300'}>{matchStateLabel(summary)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {/* Scoreline */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            {(['a', 'b'] as const).map((side, i) => {
              const team = side === 'a' ? summary.team_a : summary.team_b;
              const cell = (
                <div key={side} className="flex flex-col items-center gap-1.5 min-w-0">
                  {team.logo && <img src={team.logo} alt="" className="w-12 h-12 rounded-full object-cover bg-slate-800" />}
                  <div className="font-bold text-white text-sm leading-tight">{team.name}</div>
                  <div className="font-mono font-black text-2xl text-emerald-300">{headlineScore(side) || '–'}</div>
                </div>
              );
              return i === 0 ? [cell, <div key="vs" className="text-slate-500 font-bold">vs</div>] : cell;
            })}
          </div>

          {summary.result_summary && (
            <p className="text-center font-bold text-amber-300">{summary.result_summary}</p>
          )}
          {summary.sport_code === 'cricket' && summary.is_live && summary.cricket?.target_runs && (
            <p className="text-center text-slate-300">Target {summary.cricket.target_runs}</p>
          )}

          {!started && <p className="text-center text-slate-400">This match hasn’t started yet.</p>}

          {/* Cricket: who batted and bowled in each innings */}
          {started && summary.sport_code === 'cricket' && (detail?.scorecard ?? []).map(card => {
            const batted = card.batting.filter(row => row.has_batted);
            if (batted.length === 0 && card.bowling.length === 0) return null;
            return (
              <div key={card.innings} className="space-y-2">
                <div className="font-bold text-slate-300 uppercase text-xs tracking-wider">
                  {teamName(card.batting_team_id)} innings
                </div>
                <div className="rounded-2xl bg-slate-950 border border-slate-800 divide-y divide-slate-800/70">
                  {batted.map(row => (
                    <div key={row.player_id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <PlayerLink id={row.player_id} name={row.name} />
                        <div className="text-xs text-slate-500 truncate">{row.is_out ? row.dismissal : 'not out'}</div>
                      </div>
                      <span className="font-mono text-slate-200 shrink-0">
                        <strong className="text-white">{row.runs}</strong> ({row.balls})
                      </span>
                    </div>
                  ))}
                </div>
                {card.bowling.length > 0 && (
                  <div className="rounded-2xl bg-slate-950 border border-slate-800 divide-y divide-slate-800/70">
                    {card.bowling.map(row => (
                      <div key={row.player_id} className="px-3 py-2 flex items-center justify-between gap-3">
                        <PlayerLink id={row.player_id} name={row.name} />
                        <span className="font-mono text-slate-200 shrink-0">
                          <strong className="text-white">{row.wickets}/{row.runs}</strong> ({row.overs} ov)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Football: goals and cards for each side */}
          {started && summary.sport_code === 'football' && detail?.football_scorecard && (
            <div className="grid grid-cols-2 gap-3">
              {detail.football_scorecard.map(side => (
                <div key={side.team_id} className="rounded-2xl bg-slate-950 border border-slate-800 p-3 space-y-1.5">
                  <div className="font-bold text-slate-300 truncate">{teamName(side.team_id)}</div>
                  {side.goals.length === 0 && side.cards.length === 0 && (
                    <div className="text-slate-500">No goals or cards</div>
                  )}
                  {side.goals.map(goal => (
                    <div key={goal.event_id}>
                      ⚽ <PlayerLink id={goal.player_id} name={goal.name} />{' '}
                      <span className="text-slate-400">
                        {goal.minute}'{goal.type === 'penalty_goal' ? ' (pen)' : goal.type === 'own_goal' ? ' (og)' : ''}
                      </span>
                    </div>
                  ))}
                  {side.cards.map(card => (
                    <div key={card.event_id}>
                      {card.type === 'red_card' ? '🟥' : '🟨'} <PlayerLink id={card.player_id} name={card.name} />{' '}
                      <span className="text-slate-400">{card.minute}'</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {started && !detail && (
            <div className="flex justify-center py-2">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {summary.tournament?.slug && (
            <Link
              to={`/tournaments/${summary.tournament.slug}`}
              className="block text-center py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 font-bold"
            >
              View tournament
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
