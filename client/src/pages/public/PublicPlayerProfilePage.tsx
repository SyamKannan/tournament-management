import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Player, PlayerStats, Team, Tournament, Organization, AuctionPlayer } from '../../types';
import { 
  Trophy, Award, Flame, ChevronLeft
} from 'lucide-react';

export const PublicPlayerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    player: Player;
    team?: Team;
    tournament?: Tournament;
    organization?: Organization;
    stats: PlayerStats;
    auction_info?: AuctionPlayer | null;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/players/${id || 'player-mb-1'}/profile`);
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Player profile not found');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading Public Player Profile...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-white">
        <div className="max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-xl font-bold text-rose-400">Player Not Found</h2>
          <p className="text-xs text-slate-400">{error || 'This player profile does not exist.'}</p>
          <Link to="/" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const { player, team, tournament, organization, stats, auction_info } = data;
  const isFootball = stats.sport_code === 'football';
  const fbStats = stats.football;
  const crickStats = stats.cricket;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Tournaments</span>
        </Link>
      </div>

      {/* Header Profile Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <div className="relative">
            <img
              src={stats.photo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80'}
              alt={player.full_name}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl object-cover border-2 border-emerald-500/50 shadow-xl bg-slate-950"
            />
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-emerald-600 text-white font-black font-mono text-sm flex items-center justify-center border-2 border-slate-950 shadow-md">
              #{player.jersey_number || 10}
            </div>
          </div>

          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-black uppercase tracking-widest">
                VERIFIED ATHLETE
              </span>
              {auction_info?.status === 'sold' && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-black uppercase">
                  AUCTION VALUE: ₹{auction_info.sold_price?.toLocaleString()}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black font-heading text-white tracking-tight">
              {player.full_name}
            </h1>

            <div className="text-xs font-bold text-cyan-400">
              {player.football_position || player.cricket_role}
              {team && ` • ${team.name}`}
            </div>

            <p className="text-xs text-slate-400">
              {organization?.name} • {tournament?.name}
            </p>
          </div>
        </div>
      </div>

      {/* STATISTICS BREAKDOWN */}
      {isFootball && fbStats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Total Goals</span>
              <div className="text-4xl font-black font-mono text-emerald-400 mt-1">{fbStats.goals}</div>
              <span className="text-[11px] text-slate-500 font-semibold">{fbStats.penalties_scored} Penalties</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Assists</span>
              <div className="text-4xl font-black font-mono text-cyan-400 mt-1">{fbStats.assists}</div>
              <span className="text-[11px] text-slate-500 font-semibold">Key Passes</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Matches</span>
              <div className="text-4xl font-black font-mono text-amber-400 mt-1">{fbStats.matches}</div>
              <span className="text-[11px] text-slate-500 font-semibold">{fbStats.minutes_played} Mins</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Hero of Match</span>
              <div className="text-4xl font-black font-mono text-yellow-400 mt-1">{fbStats.player_of_match_count} 🏆</div>
              <span className="text-[11px] text-slate-500 font-semibold">Honors</span>
            </div>
          </div>
        </div>
      ) : crickStats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Runs Scored</span>
              <div className="text-4xl font-black font-mono text-amber-400 mt-1">{crickStats.runs_scored}</div>
              <span className="text-[11px] text-slate-500 font-semibold">Strike Rate: {crickStats.strike_rate}</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Wickets Taken</span>
              <div className="text-4xl font-black font-mono text-cyan-400 mt-1">{crickStats.wickets_taken}</div>
              <span className="text-[11px] text-slate-500 font-semibold">Economy: {crickStats.economy_rate}</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Batting Average</span>
              <div className="text-4xl font-black font-mono text-white mt-1">{crickStats.batting_average}</div>
              <span className="text-[11px] text-slate-500 font-semibold">High Score: {crickStats.highest_score}</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Boundaries (4s/6s)</span>
              <div className="text-4xl font-black font-mono text-rose-400 mt-1">{crickStats.fours} / {crickStats.sixes}</div>
              <span className="text-[11px] text-slate-500 font-semibold">{crickStats.fifties} Fifties</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* AWARDS & RECENT FORM */}
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span>Honors & Achievements</span>
          </h3>

          <div className="space-y-2 text-xs">
            {(stats.awards || []).map(aw => (
              <div key={aw.id} className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                <Award className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <div className="font-bold text-white">{aw.title}</div>
                  <div className="text-[11px] text-slate-400">{aw.tournament_name} • {aw.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span>Recent Match Impact</span>
          </h3>

          <div className="space-y-2 text-xs">
            {(stats.recent_performances || []).map((perf, idx) => (
              <div key={idx} className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">vs {perf.opponent_name}</div>
                  <div className="text-[11px] text-slate-400">{perf.summary}</div>
                </div>
                {perf.rating && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono text-xs">
                    ★ {perf.rating}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
