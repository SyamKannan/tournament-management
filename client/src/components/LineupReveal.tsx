import React from 'react';
import type { MatchLineupEntry, SportCode, Team } from '../types';
import { Shield, Star, Hand } from 'lucide-react';
import { PlayerAvatar } from './PlayerAvatar';

/**
 * Seconds each player holds the screen. Must match
 * `ScoreboardDirector::REVEAL_INTERVAL_SECONDS` on the server, which is what
 * every display derives its own position from.
 */
export const LINEUP_REVEAL_SECONDS = 3;

interface LineupRevealProps {
  /** Already in reveal order — the side batting first or kicking off leads. */
  lineups: MatchLineupEntry[];
  teamA: Team;
  teamB: Team;
  /** Cricket: the side batting first. Football: the side kicking off. */
  firstTeamId?: string | null;
  sport: SportCode;
  /** How many players have been announced so far. */
  revealed: number;
}

/**
 * The post-toss walk-out: both squads announced onto the big screen a player
 * at a time, the side batting first (or kicking off) leading.
 *
 * Presentational only. How far the reveal has got is decided by the organizer
 * through the scoreboard stage and passed in as `revealed`, so every display
 * in the ground shows the same player at the same moment and one switched on
 * midway catches up instead of starting over.
 */
export const LineupReveal: React.FC<LineupRevealProps> = ({
  lineups,
  teamA,
  teamB,
  firstTeamId,
  sport,
  revealed,
}) => {
  const isFootball = sport === 'football';
  const playing = lineups.filter((row) => row.is_playing);

  if (playing.length === 0) {
    return (
      <div className="p-10 sm:p-16 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-amber-500/30 text-center">
        <span className="tv-headline font-bold text-slate-400">Team sheets are being confirmed…</span>
      </div>
    );
  }

  // One past the end means the reveal has finished; hold the last player.
  const index = Math.min(Math.max(revealed, 1), playing.length) - 1;
  const current = playing[index];
  const teamOf = (teamId: string) => (teamId === teamA.id ? teamA : teamB);
  const team = teamOf(current.team_id);
  const isFirst = current.team_id === (firstTeamId || teamA.id);
  // Before a football toss nobody has been given the kick-off, so no badge.
  const sideBadge = isFootball
    ? (firstTeamId && isFirst ? 'Kicking Off' : null)
    : (isFirst ? 'Batting First' : 'Bowling First');

  // Only this player's own side, and only those already announced.
  const announced = playing
    .slice(0, index + 1)
    .filter((row) => row.team_id === current.team_id);

  const stillToCome = playing.length - (index + 1);

  return (
    <div className="w-full h-full p-5 lg:p-8 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-amber-500/30 shadow-2xl backdrop-blur-xl flex flex-col min-h-0">
      {/* Which squad is walking out, and why they're first */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {team.logo ? (
            <img src={team.logo} alt="" className="w-12 h-12 rounded-2xl object-cover border border-slate-700" />
          ) : (
            <div
              className="w-12 h-12 rounded-2xl border border-slate-700 flex items-center justify-center"
              style={{ backgroundColor: team.jersey_color || '#1e293b' }}
            >
              <Shield className="w-6 h-6 text-white/80" />
            </div>
          )}
          <div>
            <span className="tv-label font-black uppercase text-amber-400">
              Starting Squad
            </span>
            <h2 className="tv-headline font-black font-heading text-white">{team.name}</h2>
          </div>
        </div>

        {sideBadge && (
          <span
            className={`px-3 py-1.5 rounded-full tv-label font-black uppercase border ${
              isFirst
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
            }`}
          >
            {sideBadge}
          </span>
        )}
      </div>

      {/* The player currently being announced. Keyed on the player so each one
          remounts and replays the entrance rather than cross-fading. */}
      <div key={current.player_id} className="lineup-card-in relative flex-1 min-h-0 flex flex-col sm:flex-row items-center justify-center gap-6 lg:gap-12">
        <div
          className="lineup-glow absolute left-4 sm:left-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: team.jersey_color || '#f59e0b', opacity: 0.5 }}
        />

        <div className="relative shrink-0">
          {/* No jersey number inside the avatar — the badge below already
              carries it, photo or not. */}
          <PlayerAvatar
            photo={current.player.photo}
            name={current.player.full_name}
            accentColor={team.jersey_color}
            className="w-28 h-28 sm:w-40 sm:h-40 lg:w-56 lg:h-56 shrink-0 rounded-3xl border-4 border-amber-500/40 shadow-2xl"
            textClassName="text-5xl sm:text-6xl"
          />
          <div className="absolute -bottom-3 -right-3 px-3 py-1 rounded-xl bg-amber-500 text-amber-950 font-black font-mono text-lg shadow-lg">
            #{current.player.jersey_number ?? 0}
          </div>
        </div>

        <div className="relative text-center sm:text-left min-w-0">
          <div className="tv-label font-black uppercase text-slate-500">
            Player {index + 1} of {playing.length}
          </div>
          <h3 className="tv-team font-black font-heading text-white mt-1">
            {current.player.full_name}
          </h3>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
            {current.player.cricket_role && (
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 tv-label font-bold text-slate-300 uppercase">
                {current.player.cricket_role}
              </span>
            )}
            {current.player.football_position && (
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 tv-label font-bold text-slate-300 uppercase">
                {current.player.football_position}
              </span>
            )}
            {current.is_captain && (
              <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 tv-label font-black text-amber-300 uppercase flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" />
                Captain
              </span>
            )}
            {current.is_wicketkeeper && (
              <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 tv-label font-black text-cyan-300 uppercase flex items-center gap-1.5">
                <Hand className="w-3.5 h-3.5" />
                {isFootball ? 'Goalkeeper' : 'Wicketkeeper'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Everyone announced so far from this side, so the sheet builds up
          rather than each player replacing the last without trace. */}
      <div className="shrink-0 flex flex-wrap gap-2 pt-4 border-t border-slate-800">
        {announced.map((row, position) => (
          <span
            key={row.player_id}
            className={`lineup-chip-in px-3 py-1.5 rounded-xl border tv-body font-bold flex items-center gap-2 ${
              row.player_id === current.player_id
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span className="font-mono opacity-70">{position + 1}</span>
            <span>{row.player.full_name}</span>
          </span>
        ))}
      </div>

      {stillToCome > 0 && (
        <p className="shrink-0 mt-2 tv-label font-bold uppercase text-slate-500">
          {stillToCome} more to come
        </p>
      )}
    </div>
  );
};
