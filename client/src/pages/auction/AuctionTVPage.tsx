import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import type { Auction, AuctionPlayer, Tournament, TeamAuctionPurse } from '../../types';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { 
  Gavel, Maximize2, Minimize2, MapPin, Flame
} from 'lucide-react';

export const AuctionTVPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    auction: Auction;
    tournament?: Tournament;
    current_player: AuctionPlayer | null;
    team_purses: TeamAuctionPurse[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soldCelebration, setSoldCelebration] = useState<{ active: boolean; player: AuctionPlayer | null; teamName: string; price: number }>({
    active: false,
    player: null,
    teamName: '',
    price: 0
  });

  const fetchAuction = async () => {
    try {
      const res = await api.get(`/auctions/${id || 'auction-football-1'}`);
      setData(res);
    } catch (err) {
      console.error('Failed to load TV auction feed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuction();
  }, [id]);

  // A stadium screen runs unattended, so it has to recover from a dropped
  // connection by itself — hence the reconnect and the 10s poll.
  useRoomSocket(`auction:${id || 'auction-football-1'}`, msg => {
    if (msg.type === 'PLAYER_SOLD') {
      setSoldCelebration({
        active: true,
        player: msg.payload?.player,
        teamName: msg.payload?.team?.name || 'Winning Team',
        price: msg.payload?.sold_price || 0
      });
      setTimeout(() => setSoldCelebration(prev => ({ ...prev, active: false })), 7000);
    }
    fetchAuction();
  }, fetchAuction, 10000);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (loading || !data || !data.auction) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-lg font-bold font-heading tracking-wider">CONNECTING TO STADIUM AUCTION FEED...</span>
        </div>
      </div>
    );
  }

  const { auction, tournament, current_player, team_purses = [] } = data;
  const currentBid = auction.current_bid_amount || (current_player ? current_player.base_price : 0);

  return (
    <div className="min-h-screen w-screen bg-[#050811] text-white flex flex-col justify-between select-none p-6 sm:p-8 lg:p-10 font-sans overflow-y-auto relative">
      {/* Top Broadcast Header Bar */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Gavel className="w-6 h-6 text-amber-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span>OFFICIAL PLAYER AUCTION</span>
              </span>
              <span className="text-xs text-slate-400 font-semibold">{tournament?.name || 'Tournament Championship'}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black font-heading text-white mt-0.5">
              {auction.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>{tournament?.village || 'Nilambur'}, {tournament?.district || 'Malappuram'}</span>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* SOLD CELEBRATION OVERLAY */}
      {soldCelebration.active && soldCelebration.player && (
        <div className="my-auto max-w-4xl mx-auto w-full p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 text-slate-950 shadow-2xl animate-in zoom-in-95 border-4 border-white flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <img
              src={soldCelebration.player.photo}
              alt={soldCelebration.player.full_name}
              className="w-28 h-28 rounded-3xl object-cover border-4 border-slate-950 shadow-2xl"
            />
            <div>
              <span className="text-sm uppercase tracking-widest font-black text-slate-900 block">🏆 HAMMER DOWN • SOLD!</span>
              <h2 className="text-4xl sm:text-5xl font-black font-heading leading-tight">{soldCelebration.player.full_name}</h2>
              <p className="text-base font-black text-slate-900 mt-1">
                Acquired by <span className="underline">{soldCelebration.teamName}</span> for <span className="text-2xl font-mono">₹{soldCelebration.price.toLocaleString()}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CENTER STAGE: CURRENT PLAYER ON THE HAMMER */}
      {!soldCelebration.active && current_player ? (
        <div className="my-auto max-w-5xl mx-auto w-full py-6">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border-2 border-amber-500/40 shadow-2xl backdrop-blur-xl relative">
            {/* Top Pill */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-950 border border-slate-800 shadow-inner">
                <span className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-widest">
                  <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span>ON THE HAMMER • {current_player.category}</span>
                </span>
                <span className="w-1 h-3 bg-slate-800" />
                <span className="text-xs font-mono text-slate-400 font-bold">
                  Base Price: ₹{current_player.base_price.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-8 sm:gap-12">
              {/* Player Image & Name */}
              <div className="flex items-center gap-6">
                <img
                  src={current_player.photo}
                  alt={current_player.full_name}
                  className="w-36 h-36 sm:w-48 sm:h-48 rounded-3xl object-cover border-4 border-amber-500/40 shadow-2xl bg-slate-950"
                />
                <div className="space-y-1.5 text-left">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {current_player.village || 'Kerala'}, {current_player.district || 'Malappuram'} • Age {current_player.age}
                  </span>
                  <h2 className="text-3xl sm:text-5xl font-black font-heading text-white tracking-tight leading-none">
                    {current_player.full_name}
                  </h2>
                  <div className="text-base font-bold text-cyan-400 pt-1">
                    {current_player.football_position || current_player.cricket_role}
                  </div>
                  {current_player.past_achievements && (
                    <p className="text-xs text-slate-300 italic pt-1 max-w-sm">
                      "{current_player.past_achievements}"
                    </p>
                  )}
                </div>
              </div>

              {/* Giant Highest Bid Box */}
              <div className="text-center md:text-right shrink-0 p-6 rounded-3xl bg-slate-950 border-2 border-slate-800 shadow-2xl w-full md:w-auto md:min-w-[280px]">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest block">
                  CURRENT HIGHEST BID
                </span>
                <div className="text-5xl sm:text-6xl font-black font-mono text-amber-400 tracking-tight my-1">
                  ₹{currentBid.toLocaleString()}
                </div>
                <div className="text-sm font-black text-white font-heading mt-2">
                  {auction.current_bid_team_name ? (
                    <span className="text-emerald-400">🏆 {auction.current_bid_team_name}</span>
                  ) : (
                    <span className="text-slate-500">Waiting for Opening Bid</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !soldCelebration.active && (
        <div className="my-auto text-center space-y-4 py-16">
          <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 text-slate-600 flex items-center justify-center mx-auto">
            <Gavel className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black font-heading text-white">Next Player Calling to Podium...</h2>
          <p className="text-xs text-slate-400">The auctioneer is preparing the next registered player for bidding.</p>
        </div>
      )}

      {/* Bottom Team Purses Ticker */}
      <footer className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-3 overflow-x-auto py-1 scrollbar-none">
          <span className="font-bold uppercase tracking-wider text-slate-500 text-[11px] shrink-0">Team Purses:</span>
          {team_purses.map(tp => (
            <div key={tp.team_id} className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-bold shrink-0 flex items-center gap-2">
              <span>{tp.team_name}:</span>
              <span className="font-mono text-emerald-400">₹{tp.remaining_purse.toLocaleString()}</span>
              <span className="text-slate-500 text-[11px]">({tp.players_bought_count} bought)</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-slate-500 shrink-0">
          <span>KickWick Live Auction</span>
          <span>•</span>
          <span className="text-amber-400 font-bold">Live Sync</span>
        </div>
      </footer>
    </div>
  );
};
