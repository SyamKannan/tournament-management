import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Player, PlayerStats, Team, Tournament, Organization, AuctionPlayer } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { 
  Trophy, Award, Activity, Flame, Download, Star, Camera,
  Gavel, CheckCircle2, Clock
} from 'lucide-react';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PlayerCodeBadge } from '../../components/PlayerCodeBadge';
import { playerPhoto, stat, overs, highestScore, bestBowling, matchDate, RESULT_STYLES } from '../../lib/playerStats';

export const PlayerDashboardPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [data, setData] = useState<{
    player: Player;
    team?: Team;
    tournament?: Tournament;
    organization?: Organization;
    stats: PlayerStats;
    auction_entry?: AuctionPlayer | null;
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

  const { player, team, organization, stats, auction_entry } = data;
  const isFootball = stats.sport_code === 'football';
  const fbStats = stats.football;
  const crickStats = stats.cricket;

  return (
    <div className="min-h-screen bg-[#070b1d] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Player Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="relative group">
              <img
                src={stats.photo || user?.avatar || playerPhoto(null, stats.sport_code)}
                alt={player.full_name}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover border-2 border-emerald-500/50 shadow-xl bg-slate-950"
              />
              <button
                type="button"
                onClick={() => setShowPhotoModal(true)}
                title="Change Profile Photo"
                className="absolute inset-0 bg-black/60 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-bold gap-1 cursor-pointer"
              >
                <Camera className="w-5 h-5 text-emerald-400" />
                <span>Upload</span>
              </button>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-emerald-600 text-white font-black font-mono text-sm flex items-center justify-center border-2 border-slate-950 shadow-md">
                #{player.jersey_number || 10}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-black uppercase tracking-widest">
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

              <div className="pt-1 space-y-1">
                <PlayerCodeBadge code={player.player_code} />
                <p className="text-[11px] text-slate-500">Use this code on Player Stats to see your stats without logging in.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => toast.success('Digital Player Pass downloaded!')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download Digital ID</span>
            </button>
          </div>
        </div>
      </div>

      {/* AUCTION SETTLEMENT & REAL-MONEY DISBURSEMENT STATUS */}
      {auction_entry && (auction_entry.sold_price || auction_entry.status === 'sold') && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-amber-500/30 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                <Gavel className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-heading">
                  Tournament Player Auction & Payment Entitlement
                </h3>
                <p className="text-xs text-slate-400">
                  {data?.tournament?.name || 'Official Tournament'} • Real-money player settlement tracker
                </p>
              </div>
            </div>

            <div>
              {auction_entry.payment_status === 'paid' ? (
                <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>PAYMENT SETTLED (PAID)</span>
                </span>
              ) : (
                <span className="px-3.5 py-1.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                  <Clock className="w-4 h-4" />
                  <span>DISBURSEMENT PENDING</span>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Entitled Auction Amount</span>
              <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                ₹{(auction_entry.sold_price || auction_entry.base_price).toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500">Base Price: ₹{auction_entry.base_price.toLocaleString()}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Drafted Squad / Team</span>
              <div className="text-lg font-bold text-emerald-400 mt-1 truncate">
                {auction_entry.sold_to_team_name || team?.name || 'Acquiring Team'}
              </div>
              <span className="text-[11px] text-slate-500">Category: {auction_entry.category}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Real Payout Settlement</span>
              {auction_entry.payment_status === 'paid' ? (
                <div className="mt-1 space-y-0.5">
                  <div className="font-bold text-emerald-400">
                    Settled via {(auction_entry.payment_method || 'Cash').toUpperCase()}
                  </div>
                  {auction_entry.payment_reference && (
                    <div className="font-code text-[11px] text-cyan-400">Ref: {auction_entry.payment_reference}</div>
                  )}
                  {auction_entry.paid_at && (
                    <div className="text-[11px] text-slate-500">Paid on {new Date(auction_entry.paid_at).toLocaleDateString()}</div>
                  )}
                </div>
              ) : (
                <div className="mt-1">
                  <div className="font-bold text-amber-400">Pending Committee Handover</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Virtual bidding points will be settled in cash/UPI by the tournament committee.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STATS OVERVIEW CARDS */}
      {isFootball && fbStats ? (
        /* Football Career & Tournament Breakdown */
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Total Goals</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 mt-1">
                {fbStats.goals}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">{fbStats.penalties_scored} Penalties</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Assists</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-cyan-400 mt-1">
                {fbStats.assists}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">{fbStats.own_goals} Own Goals</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Matches Played</span>
              <div className="text-3xl sm:text-4xl font-black font-mono text-amber-400 mt-1">
                {fbStats.matches}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">{stat(fbStats.goals_per_match)} Goals per Match</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Player of the Match</span>
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
                <span className="text-slate-400 block">Penalties Missed:</span>
                <span className="text-lg font-mono font-black text-white">{fbStats.penalties_missed}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block">Penalties Scored:</span>
                <span className="text-lg font-mono font-black text-emerald-400">{fbStats.penalties_scored}</span>
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
                <span>Batting Statistics</span>
              </h3>
              <span className="text-xs font-mono font-bold text-slate-400">{crickStats.matches} Matches • {crickStats.innings_batted} Innings</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Total Runs</span>
                <span className="text-2xl font-black font-mono text-amber-400">{crickStats.runs_scored}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Batting Avg</span>
                <span className="text-2xl font-black font-mono text-white">{stat(crickStats.batting_average)}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Strike Rate</span>
                <span className="text-2xl font-black font-mono text-emerald-400">{stat(crickStats.strike_rate)}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">High Score</span>
                <span className="text-2xl font-black font-mono text-cyan-400">{highestScore(crickStats)}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">50s / 100s</span>
                <span className="text-2xl font-black font-mono text-yellow-400">{crickStats.fifties} / {crickStats.centuries}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">4s / 6s</span>
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
              <span className="text-xs font-mono font-bold text-slate-400">{overs(crickStats.overs_bowled)} Overs • {crickStats.maidens} Maidens</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Wickets Taken</span>
                <span className="text-2xl font-black font-mono text-cyan-400">{crickStats.wickets_taken}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Economy Rate</span>
                <span className="text-2xl font-black font-mono text-emerald-400">{stat(crickStats.economy_rate)}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Bowling Avg</span>
                <span className="text-2xl font-black font-mono text-white">{stat(crickStats.bowling_average)}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Best Bowling</span>
                <span className="text-2xl font-black font-mono text-amber-400">{bestBowling(crickStats)}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">3W / 5W Hauls</span>
                <span className="text-2xl font-black font-mono text-yellow-400">{crickStats.three_wicket_hauls} / {crickStats.five_wicket_hauls}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] uppercase font-bold">Ct / St / RO</span>
                <span className="text-2xl font-black font-mono text-slate-300">{crickStats.catches} / {crickStats.stumpings} / {crickStats.run_outs}</span>
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
            {(stats.recent_performances || []).length === 0 && (
              <p className="text-slate-500">No matches played yet.</p>
            )}
            {(stats.recent_performances || []).map(perf => (
              <div key={perf.match_id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-white text-sm flex items-center gap-2">
                    <span>vs {perf.opponent_name}</span>
                    {perf.player_of_match && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-label="Player of the match" />}
                  </div>
                  <div className="text-slate-300 font-mono mt-0.5">{perf.summary}</div>
                  <span className="text-[11px] text-slate-500 block mt-1">{matchDate(perf.date)}</span>
                </div>

                {perf.result && (
                  <span className={`px-2.5 py-1 rounded-xl border text-xs font-black uppercase shrink-0 ${RESULT_STYLES[perf.result]}`}>
                    {perf.result}
                  </span>
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
            {(stats.awards || []).length === 0 && (
              <p className="text-slate-500">No awards yet.</p>
            )}
            {(stats.awards || []).map(aw => (
              <div key={aw.id} className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-xs">{aw.title}</h4>
                  <p className="text-[11px] text-slate-400">{aw.tournament_name} • {matchDate(aw.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profile Photo Upload Modal */}
      <ImageUploadModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        title="Upload Player Profile Photo"
        subtitle="Choose a photo or select an athlete avatar"
        currentImage={stats.photo || user?.avatar}
        folder="players"
        onSuccess={async (newUrl) => {
          try {
            await api.post('/players/me/profile', { avatar: newUrl });
            setData(prev => prev ? {
              ...prev,
              stats: { ...prev.stats, photo: newUrl },
              player: { ...prev.player, photo: newUrl }
            } : prev);
            toast.success('Player photo updated successfully!');
          } catch (err) {
            console.error('Failed to update player photo', err);
          }
        }}
      />
    </div>
  );
};
