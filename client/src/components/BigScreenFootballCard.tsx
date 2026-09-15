import React from 'react';
import type { FootballMatchState, FootballScorecardSide, Match, Team } from '../types';
import { periodLabel } from '../lib/football';

interface BigScreenFootballCardProps {
  match: Match;
  teamA: Team;
  teamB: Team;
  card: FootballScorecardSide[];
  footballState?: FootballMatchState | null;
}

/**
 * The football match card on the stadium display — football's counterpart of
 * the cricket scorecard.
 *
 * Shown at half time and at full time: the scoreline, then for each side who
 * scored (and who set it up), who was booked, and who came on. Both sides at
 * once, face to face like the scoreline above them, since a football card is
 * short enough to read from the stand without taking turns.
 */
export const BigScreenFootballCard: React.FC<BigScreenFootballCardProps> = ({
  match,
  teamA,
  teamB,
  card,
  footballState,
}) => {
  const finished = match.status === 'completed';
  const atBreak = match.status === 'half_time';
  const sideFor = (teamId: string) => card.find(side => side.team_id === teamId);
  const home = sideFor(teamA.id);
  const away = sideFor(teamB.id);

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <div className="shrink-0 px-5 py-3 lg:px-8 lg:py-4 rounded-3xl bg-gradient-to-r from-emerald-500/15 via-slate-900/95 to-emerald-500/15 border border-emerald-500/40 text-center">
        <div className="tv-label font-black uppercase text-emerald-400">
          {finished ? 'Full Time' : atBreak ? 'Half Time' : periodLabel(footballState?.current_half)}
        </div>
        <div className="flex items-center justify-center gap-4 lg:gap-8 mt-1">
          <span className="tv-team font-black font-heading text-white text-right flex-1 min-w-0 truncate">{teamA.name}</span>
          <span className="tv-headline font-black font-mono text-amber-400 shrink-0">
            {footballState?.team_a_score ?? home?.score ?? 0} – {footballState?.team_b_score ?? away?.score ?? 0}
          </span>
          <span className="tv-team font-black font-heading text-white text-left flex-1 min-w-0 truncate">{teamB.name}</span>
        </div>
        {finished && match.result_summary && (
          <div className="tv-sub font-bold text-slate-300 mt-1">{match.result_summary}</div>
        )}
      </div>

      <div className="lineup-card-in flex-1 min-h-0 grid grid-cols-2 gap-3">
        <SideColumn side={home} align="right" />
        <SideColumn side={away} align="left" />
      </div>
    </div>
  );
};

const SideColumn: React.FC<{ side?: FootballScorecardSide; align: 'left' | 'right' }> = ({ side, align }) => {
  const textAlign = align === 'right' ? 'text-right' : 'text-left';
  const rowJustify = align === 'right' ? 'justify-end' : 'justify-start';

  if (!side) {
    return <div className="rounded-3xl bg-slate-950/80 border border-slate-800" />;
  }

  const nothingYet = side.goals.length + side.cards.length + side.substitutions.length + side.missed_penalties.length === 0;

  return (
    <div className={`min-h-0 overflow-hidden rounded-3xl bg-slate-950/80 border border-slate-800 p-4 lg:p-6 flex flex-col gap-4 ${textAlign}`}>
      {nothingYet && <span className="tv-sub font-bold text-slate-600">—</span>}

      {side.goals.length > 0 && (
        <section>
          <div className="tv-label font-bold uppercase text-slate-500">Goals</div>
          {side.goals.map(goal => (
            <div key={goal.event_id} className={`flex items-baseline gap-3 ${rowJustify}`}>
              <span className="tv-name font-black font-heading text-white leading-tight">
                ⚽ {goal.name || 'Unknown'}
                {goal.type === 'penalty_goal' && <span className="text-amber-400"> (pen)</span>}
                {goal.type === 'own_goal' && <span className="text-rose-400"> (OG)</span>}
              </span>
              <span className="tv-sub font-mono font-bold text-emerald-400 shrink-0">{goal.minute}'</span>
            </div>
          ))}
          {side.goals.some(goal => goal.assist_name) && (
            <div className="tv-label normal-case tracking-normal text-slate-500 mt-1">
              Assists: {side.goals.filter(goal => goal.assist_name).map(goal => `${goal.assist_name} ${goal.minute}'`).join(', ')}
            </div>
          )}
        </section>
      )}

      {side.cards.length > 0 && (
        <section>
          <div className="tv-label font-bold uppercase text-slate-500">Bookings</div>
          <div className={`flex flex-wrap gap-2 mt-1 ${rowJustify}`}>
            {side.cards.map(booking => (
              <span key={booking.event_id} className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-800 tv-body font-bold text-slate-200">
                {booking.type === 'red_card' ? '🟥' : '🟨'} {booking.name || 'Unknown'} <span className="font-mono text-slate-500">{booking.minute}'</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {side.substitutions.length > 0 && (
        <section>
          <div className="tv-label font-bold uppercase text-slate-500">Substitutions</div>
          {side.substitutions.map(sub => (
            <div key={sub.event_id} className="tv-body text-slate-300 leading-snug">
              <span className="text-emerald-400 font-bold">▲ {sub.in_name || '—'}</span>
              <span className="text-slate-600"> / </span>
              <span className="text-rose-400">▼ {sub.out_name || '—'}</span>
              <span className="font-mono text-slate-500"> {sub.minute}'</span>
            </div>
          ))}
        </section>
      )}

      {side.missed_penalties.length > 0 && (
        <section>
          <div className="tv-label font-bold uppercase text-slate-500">Penalties missed</div>
          <div className="tv-body text-slate-400">
            {side.missed_penalties.map(miss => `${miss.name || 'Unknown'} ${miss.minute}'`).join(', ')}
          </div>
        </section>
      )}
    </div>
  );
};
