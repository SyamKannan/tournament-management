import React, { useEffect, useState } from 'react';
import type { CricketMatchState, Match, ScorecardInnings, Team } from '../types';

interface BigScreenScorecardProps {
  match: Match;
  teamA: Team;
  teamB: Team;
  scorecard: ScorecardInnings[];
  cricketState?: CricketMatchState;
}

/** How long each innings holds the screen at full time before the other. */
const ROTATE_SECONDS = 15;

/**
 * The whole card on the stadium display: every batter and every bowler for an
 * innings, at a size that reads from the boundary.
 *
 * Shown between innings (the innings just completed, with the target) and at
 * full time (the result, then each innings in turn). During play the display
 * shows only the players out there; this is where the full team performance
 * gets its turn.
 *
 * One innings at a time rather than both squeezed together, so the type can
 * stay large and the page never has to scroll.
 */
export const BigScreenScorecard: React.FC<BigScreenScorecardProps> = ({
  match,
  teamA,
  teamB,
  scorecard,
  cricketState,
}) => {
  const finished = match.status === 'completed';
  const atBreak = match.status === 'innings_break';

  // At full time both innings take turns; otherwise the innings that matters
  // is fixed — the one just completed at the break, the live one otherwise.
  const cards = finished
    ? scorecard
    : scorecard.filter(card => card.innings === (atBreak ? 1 : (cricketState?.current_innings ?? 1)));

  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (cards.length < 2) return;

    const interval = window.setInterval(
      () => setShown(index => (index + 1) % cards.length),
      ROTATE_SECONDS * 1000,
    );
    return () => window.clearInterval(interval);
  }, [cards.length, match.status]);

  const card = cards[Math.min(shown, cards.length - 1)];
  const teamName = (teamId?: string | null) =>
    teamId === teamA.id ? teamA.name : teamId === teamB.id ? teamB.name : '—';

  const chasingTeam = teamName(cricketState?.batting_team_id);
  const target = cricketState?.target_runs;

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      {/* What this moment is: the result, or the target to chase */}
      <div className="shrink-0 px-5 py-3 lg:px-8 lg:py-4 rounded-3xl bg-gradient-to-r from-amber-500/15 via-slate-900/95 to-amber-500/15 border border-amber-500/40 text-center">
        <div className="tv-label font-black uppercase text-amber-400">
          {finished ? 'Full Time' : atBreak ? 'Innings Break' : 'Scorecard'}
        </div>
        <div className="tv-headline font-black font-heading text-white">
          {finished
            ? (match.result_summary || 'Match complete')
            : atBreak && target
              ? <>{chasingTeam} need <span className="text-amber-400">{target}</span> to win</>
              : `${teamA.name} vs ${teamB.name}`}
        </div>
      </div>

      {!card ? (
        <div className="flex-1 min-h-0 grid place-items-center rounded-3xl bg-slate-950/80 border border-slate-800">
          <span className="tv-headline font-bold text-slate-500">No balls recorded yet</span>
        </div>
      ) : (
        <div
          key={card.innings}
          className="lineup-card-in flex-1 min-h-0 flex flex-col rounded-3xl bg-slate-950/80 border border-slate-800 p-4 lg:p-6 overflow-hidden"
        >
          {/* The innings: who batted, and what they made */}
          <div className="shrink-0 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 pb-3 border-b border-slate-800">
            <div className="min-w-0">
              <div className="tv-label font-bold uppercase text-slate-500">
                {card.innings === 1 ? '1st' : '2nd'} Innings
                {cards.length > 1 && (
                  <span className="text-slate-600"> • {shown + 1} of {cards.length}</span>
                )}
              </div>
              <div className="tv-team font-black font-heading text-white">{teamName(card.batting_team_id)}</div>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="tv-headline font-black font-mono text-amber-400">{card.runs}/{card.wickets}</span>
              <span className="tv-sub font-bold font-mono text-slate-400">({card.overs} ov)</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6 pt-3">
            <BattingTable card={card} />
            <BowlingTable card={card} bowlingTeam={teamName(card.bowling_team_id)} />
          </div>
        </div>
      )}
    </div>
  );
};

const BattingTable: React.FC<{ card: ScorecardInnings }> = ({ card }) => {
  const batted = card.batting.filter(row => row.has_batted);
  const didNotBat = card.batting.filter(row => !row.has_batted);

  return (
    <div className="lg:col-span-3 min-h-0 flex flex-col overflow-hidden">
      <table className="w-full tv-table">
        <thead>
          <tr className="tv-label uppercase text-slate-500">
            <th className="text-left font-bold pb-1.5">Batting</th>
            <th className="text-right font-bold pb-1.5 w-[9%]">R</th>
            <th className="text-right font-bold pb-1.5 w-[9%]">B</th>
            <th className="text-right font-bold pb-1.5 w-[8%]">4s</th>
            <th className="text-right font-bold pb-1.5 w-[8%]">6s</th>
            <th className="text-right font-bold pb-1.5 w-[12%]">SR</th>
          </tr>
        </thead>
        <tbody>
          {batted.map(row => (
            <tr key={row.player_id} className="border-t border-slate-800/70 align-top">
              <td className="text-left py-1 pr-3">
                <div className={`font-bold leading-tight ${row.is_out ? 'text-slate-300' : 'text-emerald-300'}`}>
                  {row.name}
                </div>
                <div className="tv-label normal-case tracking-normal text-slate-500 leading-tight">
                  {row.dismissal || 'not out'}
                </div>
              </td>
              <td className="text-right font-mono font-black text-white py-1">{row.runs}</td>
              <td className="text-right font-mono text-slate-400 py-1">{row.balls}</td>
              <td className="text-right font-mono text-slate-400 py-1">{row.fours}</td>
              <td className="text-right font-mono text-slate-400 py-1">{row.sixes}</td>
              <td className="text-right font-mono text-slate-400 py-1">{row.strike_rate}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="shrink-0 mt-auto pt-2 border-t border-slate-800/70 flex flex-wrap justify-between gap-x-4 gap-y-1">
        <span className="tv-label normal-case tracking-normal text-slate-400">
          Extras <span className="font-mono font-bold text-white">{card.extras}</span>
        </span>
        {didNotBat.length > 0 && (
          <span className="tv-label normal-case tracking-normal text-slate-500">
            Did not bat: {didNotBat.map(row => row.name).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
};

const BowlingTable: React.FC<{ card: ScorecardInnings; bowlingTeam: string }> = ({ card, bowlingTeam }) => (
  <div className="lg:col-span-2 min-h-0 overflow-hidden lg:border-l lg:border-slate-800 lg:pl-6">
    <table className="w-full tv-table">
      <thead>
        <tr className="tv-label uppercase text-slate-500">
          <th className="text-left font-bold pb-1.5">{bowlingTeam} bowling</th>
          <th className="text-right font-bold pb-1.5">O</th>
          <th className="text-right font-bold pb-1.5">M</th>
          <th className="text-right font-bold pb-1.5">R</th>
          <th className="text-right font-bold pb-1.5">W</th>
          <th className="text-right font-bold pb-1.5">Econ</th>
        </tr>
      </thead>
      <tbody>
        {card.bowling.map(row => (
          <tr key={row.player_id} className="border-t border-slate-800/70">
            <td className="text-left py-1.5 pr-3 font-bold text-slate-200 leading-tight">{row.name}</td>
            <td className="text-right font-mono text-slate-300 py-1.5">{row.overs}</td>
            <td className="text-right font-mono text-slate-400 py-1.5">{row.maidens}</td>
            <td className="text-right font-mono text-slate-300 py-1.5">{row.runs}</td>
            <td className="text-right font-mono font-black text-cyan-300 py-1.5">{row.wickets}</td>
            <td className="text-right font-mono text-slate-400 py-1.5">{row.economy}</td>
          </tr>
        ))}
        {card.bowling.length === 0 && (
          <tr>
            <td colSpan={6} className="py-3 text-slate-600">—</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
