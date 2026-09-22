import React, { useState, useEffect } from 'react';
import { SportsLoader } from '../../components/ui/SportsLoader';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { usePreferences } from '../../i18n';
import type { 
  Auction, AuctionPlayer, AuctionBid, TeamAuctionPurse, 
  Tournament, Organization 
} from '../../types';
import { 
  Gavel, Clock, Check, X, Tv, 
  Search, Zap, AlertTriangle, CheckCircle2, RotateCcw
} from 'lucide-react';
import { label } from '../../lib/labels';

export const LiveAuctionArenaPage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, money } = usePreferences();
  // Every auctioneer action goes through here, one at a time: a double tap on
  // a slow connection placed two bids, or tried to sell twice.
  const flight = useSingleFlight();

  const [data, setData] = useState<{
    auction: Auction;
    tournament?: Tournament;
    organization?: Organization;
    current_player: AuctionPlayer | null;
    team_purses: TeamAuctionPurse[];
    players: AuctionPlayer[];
    bid_history: AuctionBid[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBiddingTeamId, setSelectedBiddingTeamId] = useState<string>('');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'registered' | 'sold' | 'unsold'>('registered');
  const [searchQuery, setSearchQuery] = useState('');
  const [bidWarFlash, setBidWarFlash] = useState(false);
  const [soldCelebration, setSoldCelebration] = useState<{ active: boolean; player: AuctionPlayer | null; teamName: string; price: number }>({
    active: false,
    player: null,
    teamName: '',
    price: 0
  });

  const isAuctioneer = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';

  const fetchAuctionState = async () => {
    try {
      setError(null);
      const res = await api.get(`/auctions/${id || 'auction-football-1'}`);
      setData(res);
      if (res.team_purses?.length > 0 && !selectedBiddingTeamId) {
        setSelectedBiddingTeamId(res.team_purses[0].team_id);
      }
    } catch (err: any) {
      console.error('Failed to load auction room', err);
      // A failed background refresh keeps the room on screen.
      if (!data) setError(err?.message || 'Failed to load auction data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuctionState();
  }, [id]);

  useRoomSocket(`auction:${id || 'auction-football-1'}`, msg => {
    if (msg.type === 'BID_PLACED') {
      setBidWarFlash(true);
      setTimeout(() => setBidWarFlash(false), 1200);
    } else if (msg.type === 'PLAYER_SOLD') {
      setSoldCelebration({
        active: true,
        player: msg.payload?.player,
        teamName: msg.payload?.team?.name || 'Winning Team',
        price: msg.payload?.sold_price || 0
      });
      setTimeout(() => setSoldCelebration(prev => ({ ...prev, active: false })), 6000);
    }
    fetchAuctionState();
  }, fetchAuctionState);

  // Refresh straight after our own action too — the gateway may be down.
  const runAction = async (request: () => Promise<unknown>, fallbackError: string): Promise<boolean> => {
    const ok = await flight.run(async () => {
      try {
        await request();
        return true;
      } catch (err: any) {
        toast.error(err.message || fallbackError);
        return false;
      } finally {
        await fetchAuctionState();
      }
    });
    return ok === true;
  };

  const handlePlaceBid = (amount: number) => {
    if (!selectedBiddingTeamId) {
      toast.warning('Please select a team to bid for');
      return;
    }
    return runAction(
      () => api.post(`/auctions/${data?.auction.id}/place-bid`, { team_id: selectedBiddingTeamId, amount }),
      'Bid failed'
    );
  };

  const handleCallPlayer = (playerId: string) =>
    runAction(() => api.post(`/auctions/${data?.auction.id}/call-player`, { player_id: playerId }), 'Failed to call player');

  // The hammer commits a team's money in front of the room, so it asks first
  // — and says exactly what is about to happen, so the auctioneer is
  // confirming a sale, not a dialog.
  const handleSellPlayer = async () => {
    if (!data?.auction.current_bid_team_id || flight.busy) return;
    const proceed = await confirm({
      title: t('auction.sell.confirmTitle', {
        player: data.current_player?.full_name ?? '',
        team: data.auction.current_bid_team_name ?? '',
      }),
      message: t('auction.sell.confirmBody', { amount: money(Number(data.auction.current_bid_amount) || 0) }),
      confirmLabel: t('auction.sell.confirm'),
    });
    if (!proceed) return;
    await runAction(() => api.post(`/auctions/${data.auction.id}/sell-player`, {}), 'Failed to finalize sale');
  };

  const handleUnsoldPlayer = async () => {
    if (!data || flight.busy) return;
    const proceed = await confirm({
      title: t('auction.unsold.confirmTitle', { player: data.current_player?.full_name ?? '' }),
      message: t('auction.unsold.confirmBody'),
      confirmLabel: 'Mark unsold',
    });
    if (!proceed) return;
    await runAction(() => api.post(`/auctions/${data.auction.id}/unsold-player`, {}), 'Failed to mark unsold');
  };

  /**
   * Undo the last hammer: the player goes back up at the bid that stood. Only
   * offered while that player is still on the block — once the next one is
   * called the room has moved on, and the server refuses it too.
   */
  const handleReopenHammer = async () => {
    if (!data || flight.busy) return;
    const playerName = data.current_player?.full_name ?? '';
    const proceed = await confirm({
      title: t('auction.undo.confirmTitle'),
      message: t('auction.undo.confirmBody', { player: playerName }),
      confirmLabel: t('auction.undo'),
      tone: 'danger',
    });
    if (!proceed) return;
    setSoldCelebration(prev => ({ ...prev, active: false }));
    const ok = await runAction(() => api.post(`/auctions/${data.auction.id}/reopen-hammer`, {}), 'Could not reopen the bidding');
    if (ok) toast.success(t('auction.undo.done', { player: playerName }));
  };

  // Accelerated Round
  const handleAcceleratedRound = async () => {
    const proceed = await confirm({
      title: 'Start the accelerated round?',
      message: 'Every unsold player returns to the pool with their base price reduced by 25%.',
      confirmLabel: 'Start round',
    });
    if (!proceed) return;
    try {
      await api.post(`/auctions/${data?.auction.id}/accelerated-round`, {});
      toast.success('Accelerated re-auction round started!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start accelerated round');
    } finally {
      fetchAuctionState();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-3">
          <SportsLoader size="lg" />
          <span className="text-sm font-semibold text-slate-400">CONNECTING TO LIVE AUCTION ARENA...</span>
        </div>
      </div>
    );
  }

  if (error || !data || !data.auction) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-white">
        <div className="max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-xl font-bold text-amber-400">Auction Room Initializing</h2>
          <p className="text-xs text-slate-400">{error || 'Unable to connect to auction room.'}</p>
          <button
            onClick={() => fetchAuctionState()}
            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const { auction, tournament, current_player, team_purses = [], players = [], bid_history = [] } = data;
  const currentBid = auction.current_bid_amount || (current_player ? current_player.base_price : 0);
  const minIncrement = auction.min_bid_increment || 500;
  const nextMinBid = auction.current_bid_team_id ? currentBid + minIncrement : currentBid;

  const selectedTeamPurse = team_purses.find(tp => tp.team_id === selectedBiddingTeamId);
  const isMyTeamWinning = selectedTeamPurse && auction.current_bid_team_id === selectedTeamPurse.team_id;
  const hasBeenOutbid = selectedTeamPurse && auction.current_bid_team_id && auction.current_bid_team_id !== selectedTeamPurse.team_id && bid_history.some(b => b.team_id === selectedTeamPurse.team_id);

  // Filter player queue
  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (p.village && p.village.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    if (playerFilter === 'all') return true;
    if (playerFilter === 'registered') return p.status === 'registered' || p.status === 'approved';
    if (playerFilter === 'sold') return p.status === 'sold';
    if (playerFilter === 'unsold') return p.status === 'unsold';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header Navigation */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Gavel className="w-6 h-6 text-amber-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span>LIVE AUCTION ARENA</span>
              </span>
              <span className="text-xs text-slate-400 font-semibold">{tournament?.name || 'Championship Tournament'}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black font-heading text-white mt-0.5">
              {auction.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {tournament && (
            <Link
              to={`/organization/tournaments/${tournament.id}/auction`}
              className="px-3.5 py-2 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5 border border-emerald-500/30 transition-colors"
            >
              <span>Settlement Report ↗</span>
            </Link>
          )}

          <Link
            to={`/auction/tv/${auction.id}`}
            target="_blank"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-800 transition-colors"
          >
            <Tv className="w-4 h-4 text-emerald-400" />
            <span>16:9 Big Screen View ↗</span>
          </Link>

          <Link
            to={`/register/player-auction/${auction.token}`}
            target="_blank"
            className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center gap-1.5 border border-amber-500/30 transition-colors"
          >
            <span>Public Registration Link ↗</span>
          </Link>
        </div>
      </header>

      {/* SOLD CELEBRATION BANNER */}
      {soldCelebration.active && soldCelebration.player && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 text-slate-950 font-black shadow-2xl animate-in zoom-in-95 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={soldCelebration.player.photo}
              alt={soldCelebration.player.full_name}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-950 shadow-md"
            />
            <div>
              <span className="text-xs uppercase tracking-widest block text-slate-900 font-black">🔨 HAMMER DOWN • SOLD!</span>
              <h3 className="text-2xl font-black font-heading">{soldCelebration.player.full_name}</h3>
              <p className="text-xs font-bold text-slate-900">
                Acquired by <span className="underline">{soldCelebration.teamName}</span> for <span className="text-base font-mono">₹{soldCelebration.price.toLocaleString()}</span>
              </p>
            </div>
          </div>

          <div className="text-4xl font-black font-heading pr-4 hidden sm:block">
            SOLD 🏆
          </div>
        </div>
      )}

      {/* TEAM MANAGER OUTBID / WINNING LIVE STATUS BAR */}
      {selectedTeamPurse && current_player && (
        <div className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
          isMyTeamWinning
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/10'
            : hasBeenOutbid
            ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-500/10 animate-pulse'
            : 'bg-slate-900 border-slate-800 text-slate-300'
        }`}>
          <div className="flex items-center gap-3">
            {isMyTeamWinning ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            ) : hasBeenOutbid ? (
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 animate-bounce" />
            ) : (
              <Zap className="w-6 h-6 text-amber-400 shrink-0" />
            )}

            <div>
              <div className="font-bold text-sm text-white">
                {isMyTeamWinning
                  ? `🏆 Your Team [${selectedTeamPurse.team_name}] holds the Highest Bid (₹${currentBid.toLocaleString()})!`
                  : hasBeenOutbid
                  ? `⚠️ YOU HAVE BEEN OUTBID! Highest bid is ₹${currentBid.toLocaleString()} by ${auction.current_bid_team_name}.`
                  : `Managing Team: [${selectedTeamPurse.team_name}] • Remaining Purse: ₹${selectedTeamPurse.remaining_purse.toLocaleString()}`}
              </div>
              <p className="text-xs opacity-80">
                {isMyTeamWinning ? 'Wait for auctioneer hammer or counter-bids from other managers' : 'Click the bid buttons on the right to place a counter-bid before the hammer falls'}
              </p>
            </div>
          </div>

          {hasBeenOutbid && (
            <button
              onClick={() => handlePlaceBid(nextMinBid)}
              disabled={flight.busy}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs shadow-md shrink-0"
            >
              Counter Bid ₹{nextMinBid.toLocaleString()}
            </button>
          )}
        </div>
      )}

      {/* MAIN BIDDING ARENA GRID */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: CURRENT PLAYER ON THE HAMMER & RADAR */}
        <div className="lg:col-span-7 space-y-5">
          {current_player ? (
            <div className={`p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 transition-all shadow-2xl relative backdrop-blur-xl ${
              bidWarFlash ? 'border-amber-400 scale-[1.01] shadow-amber-500/20' : 'border-slate-800'
            }`}>
              {/* Top Tag & Hammer Status */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black uppercase tracking-wider">
                    {current_player.category}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">
                    {current_player.village}, {current_player.district}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-bold font-mono uppercase text-emerald-400 tracking-wider">
                    HAMMER ACTIVE
                  </span>
                </div>
              </div>

              {/* Player Main Details & Photo */}
              <div className="flex flex-col sm:flex-row items-center gap-6 mt-6">
                <div className="relative shrink-0">
                  <img
                    src={current_player.photo}
                    alt={current_player.full_name}
                    className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl object-cover border-2 border-amber-500/40 shadow-2xl bg-slate-950"
                  />
                  <div className="absolute -bottom-2 -right-2 px-3 py-1 rounded-xl bg-slate-950 border border-amber-500/60 text-xs font-black font-mono text-amber-400 shadow-md">
                    Age {current_player.age}
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {current_player.sport_code === 'football' ? 'Football Talent' : 'Cricket Star'}
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-black font-heading text-white tracking-tight leading-none">
                    {current_player.full_name}
                  </h2>
                  <div className="text-sm font-bold text-cyan-400">
                    {current_player.football_position || current_player.cricket_role}
                    {current_player.football_preferred_foot && ` • Preferred ${current_player.football_preferred_foot} foot`}
                    {current_player.cricket_batting_style && ` • ${current_player.cricket_batting_style}`}
                  </div>

                  {current_player.past_achievements && (
                    <p className="text-xs text-slate-300 italic pt-1 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      "{current_player.past_achievements}"
                    </p>
                  )}
                </div>
              </div>

              {/* Current Bid Display Box */}
              <div className="mt-8 p-6 rounded-2xl bg-slate-950 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Base Price: <span className="font-mono text-slate-300 font-bold">₹{current_player.base_price.toLocaleString()}</span>
                  </span>
                  <div className="text-xs font-bold text-amber-400 uppercase mt-1">Current Highest Bid</div>
                  <div className="text-4xl sm:text-5xl font-black font-mono text-amber-400 tracking-tight mt-0.5">
                    ₹{currentBid.toLocaleString()}
                  </div>
                </div>

                <div className="text-center sm:text-right">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Leading Bidder</span>
                  <div className="text-base sm:text-lg font-black text-white font-heading mt-0.5">
                    {auction.current_bid_team_name || 'Awaiting Opening Bid'}
                  </div>
                  {auction.current_bid_team_name && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase inline-block mt-1">
                      Highest Bidder 🏆
                    </span>
                  )}
                </div>
              </div>

              {/* Auctioneer Action Bar */}
              {isAuctioneer && (
                <div className="mt-6 pt-5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-400">
                    Auctioneer Controls:
                  </div>

                  {auction.hammer_state === 'sold' || auction.hammer_state === 'unsold' ? (
                    <button
                      onClick={handleReopenHammer}
                      disabled={flight.busy}
                      className="min-h-11 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-sm flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="w-4 h-4" aria-hidden="true" />
                      <span>{t('auction.undo')}</span>
                    </button>
                  ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSellPlayer}
                      disabled={!auction.current_bid_team_id || flight.busy}
                      className="min-h-11 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                      <span>{flight.busy ? 'Saving…' : 'HAMMER SOLD!'}</span>
                    </button>

                    <button
                      onClick={handleUnsoldPlayer}
                      disabled={flight.busy}
                      className="min-h-11 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    >
                      <X className="w-4 h-4 text-rose-400" aria-hidden="true" />
                      <span>Mark Unsold</span>
                    </button>
                  </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 rounded-3xl bg-slate-900/90 border border-slate-800 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 rounded-3xl bg-slate-950 border border-slate-800 text-slate-600 flex items-center justify-center mx-auto">
                <Gavel className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white font-heading">No Player Currently on the Hammer</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Select a registered player from the queue below and call them to the auction podium to begin bidding.
              </p>
            </div>
          )}

          {/* TEAM PURSES & BUDGET BAR */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-heading">
                Team Purses & Squad Capacity (Virtual Points)
              </h3>
              <span className="text-xs text-amber-400 font-semibold">Virtual Purse: ₹{auction.team_purse.toLocaleString()} / Team</span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {team_purses.map(tp => (
                <div
                  key={tp.team_id}
                  onClick={() => setSelectedBiddingTeamId(tp.team_id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    selectedBiddingTeamId === tp.team_id
                      ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md'
                      : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-white truncate">{tp.team_name}</span>
                    <span className="font-mono font-bold text-emerald-400">₹{tp.remaining_purse.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Squad: {tp.players_bought_count} / {tp.max_players} Bought</span>
                    <span>Spent: ₹{tp.spent_amount.toLocaleString()}</span>
                  </div>

                  {/* Progress meter */}
                  <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (tp.spent_amount / tp.total_purse) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: BIDDING CONSOLE, BID STREAM, & PLAYER QUEUE */}
        <div className="lg:col-span-5 space-y-5">
          {/* BIDDING CONSOLE */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider font-heading">
                  Team Bidding Console
                </h3>
              </div>

              {selectedTeamPurse && (
                <span className="text-xs font-mono font-bold text-emerald-400">
                  Purse: ₹{selectedTeamPurse.remaining_purse.toLocaleString()}
                </span>
              )}
            </div>

            {/* Select Team to Bid For */}
            <div className="text-xs">
              <label htmlFor="liveauctionarena-active-bidding-team" className="block text-slate-400 font-semibold mb-1">Active Bidding Team</label>
              <select id="liveauctionarena-active-bidding-team"
                value={selectedBiddingTeamId}
                onChange={(e) => setSelectedBiddingTeamId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
              >
                {team_purses.map(tp => (
                  <option key={tp.team_id} value={tp.team_id}>
                    {tp.team_name} (₹{tp.remaining_purse.toLocaleString()} rem)
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Increment Buttons */}
            {current_player ? (
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Quick Bid Increments:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePlaceBid(nextMinBid)}
                    disabled={flight.busy}
                    className="py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition-all text-center"
                  >
                    <div>Bid Next Min</div>
                    <div className="font-mono text-sm">₹{nextMinBid.toLocaleString()}</div>
                  </button>

                  <button
                    onClick={() => handlePlaceBid(currentBid + minIncrement * 2)}
                    disabled={flight.busy}
                    className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors text-center"
                  >
                    <div>+{minIncrement * 2}</div>
                    <div className="font-mono text-sm text-cyan-400">₹{(currentBid + minIncrement * 2).toLocaleString()}</div>
                  </button>

                  <button
                    onClick={() => handlePlaceBid(currentBid + 2000)}
                    disabled={flight.busy}
                    className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors text-center"
                  >
                    <div>+₹2,000</div>
                    <div className="font-mono text-xs text-amber-400">₹{(currentBid + 2000).toLocaleString()}</div>
                  </button>

                  <button
                    onClick={() => handlePlaceBid(currentBid + 5000)}
                    disabled={flight.busy}
                    className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors text-center"
                  >
                    <div>+₹5,000</div>
                    <div className="font-mono text-xs text-amber-400">₹{(currentBid + 5000).toLocaleString()}</div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-950 text-center text-xs text-slate-500">
                Call a player to the hammer to unlock bidding buttons
              </div>
            )}
          </div>

          {/* LIVE BID HISTORY STREAM */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-heading flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Real-Time Bid War Stream</span>
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {bid_history.length > 0 ? (
                bid_history.map((bid, index) => (
                  <div
                    key={bid.id || index}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs animate-in fade-in"
                  >
                    <div>
                      <span className="font-bold text-white">{bid.team_name}</span>
                      <span className="text-xs text-slate-500 block">
                        {new Date(bid.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="font-mono font-black text-amber-400 text-sm">
                      ₹{bid.amount.toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-slate-500">
                  No bids recorded for current round
                </div>
              )}
            </div>
          </div>

          {/* PLAYER QUEUE & SELECTION (Auctioneer) */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-heading">
                Player Pool Queue ({filteredPlayers.length})
              </h3>
              {isAuctioneer && (
                <button
                  onClick={handleAcceleratedRound}
                  className="text-xs text-amber-400 hover:text-amber-300 font-bold underline"
                  title="Re-auction unsold players with 25% discount"
                >
                  ⚡ Accelerated Round
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 text-xs font-bold">
              {(['registered', 'sold', 'unsold', 'all'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setPlayerFilter(tab)}
                  className={`px-2.5 py-1 rounded-lg capitalize transition-colors ${
                    playerFilter === tab ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Player Search Input */}
            <div className="relative">
              <input aria-label="Search player or village"
                type="text"
                placeholder="Search player or village..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none pl-8"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>

            {/* Player Queue List */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {filteredPlayers.map(p => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={p.photo} alt={p.full_name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">{p.full_name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {p.football_position || p.cricket_role} • {p.category}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="font-mono text-amber-400 font-bold">₹{(p.sold_price || p.base_price).toLocaleString()}</span>
                      <span className={`block text-xs font-bold uppercase ${
                        p.status === 'sold' ? 'text-emerald-400' : p.status === 'unsold' ? 'text-rose-400' : 'text-cyan-400'
                      }`}>
                        {label(p.status)}
                      </span>
                    </div>

                    {isAuctioneer && (p.status === 'registered' || p.status === 'approved' || p.status === 'unsold') && (
                      <button
                        onClick={() => handleCallPlayer(p.id)}
                        disabled={flight.busy}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-slate-950 font-bold text-xs transition-all"
                      >
                        Call
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
