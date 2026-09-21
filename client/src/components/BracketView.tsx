import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { formatMatchTime } from '../lib/format';

export type BracketSide = {
  team_id: string | null;
  team_name: string | null;
  short_name: string | null;
  team_logo: string | null;
  is_winner: boolean;
  source_label: string;
};

export type BracketMatch = {
  id: string;
  match_number: number;
  bracket_position: number;
  status: string;
  scheduled_at: string;
  winner_team_id: string | null;
  result_summary: string | null;
  side_a: BracketSide;
  side_b: BracketSide;
};

export type Bracket = {
  has_bracket: boolean;
  rounds: { round: number; name: string; matches: BracketMatch[] }[];
  champion?: { id: string; name: string; logo: string | null } | null;
};

/**
 * The knockout laid out round by round, left to right.
 *
 * Columns rather than connector lines: a bracket has to be readable on a phone
 * held in one hand at the side of a pitch, and drawn elbows between rounds are
 * the first thing to break when the screen narrows. Each cell says where its
 * teams come from — "Winner of SF1", "Group B runner-up" — so a round that has
 * not been played yet still tells a visitor what is at stake.
 */
export const BracketView: React.FC<{ bracket: Bracket; linkMatches?: boolean }> = ({
  bracket,
  linkMatches = false,
}) => {
  if (!bracket.has_bracket || bracket.rounds.length === 0) return null;

  return (
    <div className="space-y-4">
      {bracket.champion && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 to-yellow-500/10 border border-amber-500/30 flex items-center gap-3">
          <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-amber-400/90">Champions</div>
            <div className="text-lg font-black text-white truncate">{bracket.champion.name}</div>
          </div>
          {bracket.champion.logo && (
            <img src={bracket.champion.logo} alt="" className="w-10 h-10 rounded-xl object-cover ml-auto shrink-0" />
          )}
        </div>
      )}

      {/* Horizontally scrollable on a phone, side by side once there is room. */}
      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div className="flex gap-3 min-w-max">
          {bracket.rounds.map(round => (
            <div key={round.round} className="w-60 shrink-0 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 px-1">
                {round.name}
              </h4>

              {/* Each round has half as many matches, so space them out to keep
                  a match roughly level with the pair that feeds it. */}
              <div
                className="space-y-2 flex flex-col justify-around h-full"
                style={{ minHeight: bracket.rounds[0].matches.length * 86 }}
              >
                {round.matches.map(match => (
                  <BracketCell key={match.id} match={match} linkMatches={linkMatches} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BracketCell: React.FC<{ match: BracketMatch; linkMatches: boolean }> = ({ match, linkMatches }) => {
  const isBye = match.status === 'completed' && !match.side_b.team_id;
  const decided = match.status === 'completed';

  const body = (
    <div
      className={`rounded-2xl border p-2.5 space-y-1.5 transition-colors ${
        decided
          ? 'bg-slate-900/70 border-slate-700'
          : match.status === 'in_progress'
            ? 'bg-emerald-500/10 border-emerald-500/40'
            : 'bg-slate-900/40 border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-500">
          {isBye ? 'Bye' : `Match ${match.match_number}`}
        </span>
        <span className="text-xs text-slate-500 truncate">
          {decided ? 'Final score' : formatMatchTime(match.scheduled_at, 'To be scheduled')}
        </span>
      </div>

      <Side side={match.side_a} />
      {!isBye && <Side side={match.side_b} />}

      {match.result_summary && (
        <p className="text-xs text-slate-400 pt-0.5 truncate">{match.result_summary}</p>
      )}
    </div>
  );

  // Only a real fixture is worth opening; a placeholder has nothing behind it.
  return linkMatches && match.side_a.team_id && match.side_b.team_id ? (
    <Link to={`/scoreboard/${match.id}`} className="block hover:opacity-90">{body}</Link>
  ) : (
    body
  );
};

const Side: React.FC<{ side: BracketSide }> = ({ side }) => {
  if (!side.team_id) {
    return (
      <div className="flex items-center gap-2 px-1.5 py-1 rounded-xl bg-slate-950/40">
        <span className="w-5 h-5 rounded-lg bg-slate-800 shrink-0" />
        <span className="text-xs text-slate-500 italic truncate">
          {side.source_label || 'To be decided'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-1.5 py-1 rounded-xl ${
        side.is_winner ? 'bg-emerald-500/15' : 'bg-slate-950/40'
      }`}
    >
      {side.team_logo ? (
        <img src={side.team_logo} alt="" className="w-5 h-5 rounded-lg object-cover shrink-0" />
      ) : (
        <span className="w-5 h-5 rounded-lg bg-slate-800 shrink-0" />
      )}
      <span
        className={`text-xs truncate ${
          side.is_winner ? 'font-bold text-emerald-300' : 'font-semibold text-slate-200'
        }`}
      >
        {side.team_name}
      </span>
    </div>
  );
};
