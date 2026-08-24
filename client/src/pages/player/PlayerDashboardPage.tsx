import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Player, PlayerStats, Team, Tournament, Organization } from '../../types';
import { 
  User, Trophy, Award, Activity, Flame, ShieldCheck, 
  MapPin, Calendar, Share2, Download, CheckCircle2, 
  Sparkles, Zap, Star, QrCode, ArrowRight
} from 'lucide-react';

export const PlayerDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<{
    player: Player;
    team?: Team;
    tournament?: Tournament;
    organization?: Organization;
    stats: PlayerStats;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayerData = async () => {
      try {
        setLoading(true);
        const res = await api.get('/players/me/dashboard');
        setData(res);
      } catch (err) {
        console.error('Failed to load player stats', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading Player Career Statistics...</span>
        </div>
      </div>
    );
  }

  const { player, team, tournament, organization, stats } = data;
  const isFootball = stats.sport_code === 'football';
  const fbStats = stats.football;
  const crickStats = stats.cricket;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Player Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="relative">
              <img
                src={stats.photo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80'}
                alt={player.full_name}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover border-2 border-emerald-500/50 shadow-xl bg-slate-950"
              />
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-emerald-600 text-white font-black font-mono text-sm flex items-center justify-center border-2 border-slate-950 shadow-md">
                #{player.jersey_number || 10}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest">
                  VERIFIED PLAYER
                </span>
                {team && (
                  <span className="text-xs font-bold text-slate-300">
                    Team: <strong className="text-white">{team.name}</strong>
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black font-heading text-white tracking-tight">
                {player.full_name}
              </h1>

              <p className="text-xs text-slate-400">
                {player.football_position || player.cricket_role} • {organization?.name || 'Local Sports Club'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => alert('Digital Player Pass downloaded!')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download Digital ID</span>
            </button>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      {isFootball && fbStats ? (
        /* Football Career & Tournament Breakdown */
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Total Goals</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 mt-1">
                {fbStats.goals}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">{fbStats.penalties_scored} Penalties</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Assists</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-cyan-400 mt-1">
                {fbStats.assists}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">Key Chances</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Matches Played</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-amber-400 mt-1">
                {fbStats.matches}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">{fbStats.minutes_played} Minutes</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Player of the Match</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-yellow-400 mt-1">
                {fbStats.player_of_match_count} 🏆
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">Hero Honors</span>
            </div>
          </div>

          {/* Detailed Football Matrix */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>In-Depth Football Match Performance</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block">Shots on Target:</span>
                <span className="text-lg font-mono font-black text-white">{fbStats.shots_on_target}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block">Goals per Match:</span>
                <span className="text-lg font-mono font-black text-emerald-400">
                  {(fbStats.goals / Math.max(1, fbStats.matches)).toFixed(2)}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block">Yellow / Red Cards:</span>
                <span className="text-lg font-mono font-black text-amber-400">{fbStats.yellow_cards} 🟨 / {fbStats.red_cards} 🟥</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block">Clean Sheets:</span>
                <span className="text-lg font-mono font-black text-cyan-400">{fbStats.clean_sheets}</span>
              </div>
            </div>
          </div>
        </div>
      ) : crickStats ? (
        /* Cricket Career & Tournament Breakdown */
        <div className="space-y-6">
          {/* Batting Card */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider font-heading flex items-center gap-2">
                <span>🏏</span>
                <span>Batting Statistics (T20 / Limited Overs)</span>
              </h3>
              <span className="text-xs font-mono font-bold text-slate-400">{crickStats.matches} Matches • {crickStats.innings_batted} Innings</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Runs</span>
                <span className="text-2xl font-black font-mono text-amber-400">{crickStats.runs_scored}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Batting Avg</span>
                <span className="text-2xl font-black font-mono text-white">{crickStats.batting_average}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Strike Rate</span>
                <span className="text-2xl font-black font-mono text-emerald-400">{crickStats.strike_rate}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">High Score</span>
                <span className="text-2xl font-black font-mono text-cyan-400">{crickStats.highest_score}{crickStats.highest_score_not_out ? '*' : ''}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">50s / 100s</span>
                <span className="text-2xl font-black font-mono text-yellow-400">{crickStats.fifties} / {crickStats.centuries}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">4s / 6s</span>
                <span className="text-2xl font-black font-mono text-rose-400">{crickStats.fours} / {crickStats.sixes}</span>
              </div>
            </div>
          </div>

          {/* Bowling Card */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider font-heading flex items-center gap-2">
                <span>🎯</span>
                <span>Bowling Statistics</span>
              </h3>
              <span className="text-xs font-mono font-bold text-slate-400">{crickStats.overs_bowled} Overs • {crickStats.maidens} Maidens</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Wickets Taken</span>
                <span className="text-2xl font-black font-mono text-cyan-400">{crickStats.wickets_taken}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Economy Rate</span>
                <span className="text-2xl font-black font-mono text-emerald-400">{crickStats.economy_rate}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Bowling Avg</span>
                <span className="text-2xl font-black font-mono text-white">{crickStats.bowling_average}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Best Bowling</span>
                <span className="text-2xl font-black font-mono text-amber-400">{crickStats.best_bowling_wickets}/{crickStats.best_bowling_runs}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">3W / 5W Hauls</span>
                <span className="text-2xl font-black font-mono text-yellow-400">{crickStats.three_wicket_hauls} / {crickStats.five_wicket_hauls}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Catches / Run Outs</span>
                <span className="text-2xl font-black font-mono text-slate-300">{crickStats.catches} / {crickStats.run_outs}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* RECENT MATCH LOG & AWARDS CABINET */}
      <div className="grid md:grid-cols-12 gap-6">
        {/* Left: Recent Performance Log */}
        <div className="md:col-span-7 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span>Recent Match Impact Log</span>
          </h3>

          <div className="space-y-3 text-xs">
            {(stats.recent_performances || []).map((perf, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-white text-sm">vs {perf.opponent_name}</div>
                  <div className="text-slate-400 mt-0.5">{perf.summary}</div>
                  <span className="text-[10px] text-slate-500 block mt-1">{perf.date}</span>
                </div>

                {perf.rating && (
                  <div className="text-right shrink-0">
                    <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black font-mono flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400" />
                      <span>{perf.rating}</span>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Awards & Honors */}
        <div className="md:col-span-5 p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span>Trophy & Awards Cabinet</span>
          </h3>

          <div className="space-y-3 text-xs">
            {(stats.awards || []).map(aw => (
              <div key={aw.id} className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-xs">{aw.title}</h4>
                  <p className="text-[10px] text-slate-400">{aw.tournament_name} • {aw.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
