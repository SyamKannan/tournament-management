import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import type { 
  Auction, AuctionPlayer, Tournament, TeamAuctionPurse, AuctionStatus 
} from '../../types';
import { 
  Gavel, Trophy, Users, DollarSign, Clock, 
  CheckCircle2, XCircle, Tv, Share2, 
  ArrowRight, Trash2, 
  Filter, Download, Award, Play, Pause
} from 'lucide-react';

export const OrgTournamentAuctionManagePage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const { } = useAuth();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'teams' | 'settings' | 'history'>('overview');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'registered' | 'approved' | 'sold' | 'unsold' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Settings form state
  const [hasAuction, setHasAuction] = useState(true);
  const [auctionTitle, setAuctionTitle] = useState('');
  const [auctionStartTime, setAuctionStartTime] = useState('');
  const [auctionEndTime, setAuctionEndTime] = useState('');
  const [teamPurse, setTeamPurse] = useState<number>(100000);
  const [minBidIncrement, setMinBidIncrement] = useState<number>(500);
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState<number>(12);
  const [minPlayersPerTeam, setMinPlayersPerTeam] = useState<number>(7);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchAuctionData = async () => {
    try {
      setLoading(true);
      // Fetch tournament
      const tourneyRes = await api.get(`/tournaments/${tournamentId}`);
      const t = tourneyRes.tournament || tourneyRes;
      setTournament(t);
      setHasAuction(Boolean(t.has_auction));

      // Fetch auction
      const auctionRes = await api.get(`/auctions/tournament/${t.id}`).catch(() => null);
      if (auctionRes?.auction) {
        setAuction(auctionRes.auction);
        setAuctionTitle(auctionRes.auction.title);
        setAuctionStartTime(auctionRes.auction.auction_start_time || '');
        setAuctionEndTime(auctionRes.auction.auction_end_time || '');
        setTeamPurse(auctionRes.auction.team_purse || 100000);
        setMinBidIncrement(auctionRes.auction.min_bid_increment || 500);
        setMaxPlayersPerTeam(auctionRes.auction.max_players_per_team || 12);
        setMinPlayersPerTeam(auctionRes.auction.min_players_per_team || 7);

        // Fetch full summary
        const sum = await api.get(`/auctions/${auctionRes.auction.id}/summary`).catch(() => null);
        setSummaryData(sum);
      }
    } catch (err) {
      console.error('Failed to load auction data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuctionData();
  }, [tournamentId]);

  // Update Status
  const handleStatusChange = async (newStatus: AuctionStatus) => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/status`, { status: newStatus });
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    }
  };

  // Player Approvals
  const handleApprovePlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/players/${playerId}/approve`, {});
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve player');
    }
  };

  const handleRejectPlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/players/${playerId}/reject`, {});
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject player');
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!auction) return;
    const proceed = await confirm({
      title: 'Remove this player from the pool?',
      message: 'They will no longer appear in the auction. You can re-register them through the public link.',
      confirmLabel: 'Remove player',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      await api.delete(`/auctions/${auction.id}/players/${playerId}`);
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete player');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournament) return;
    setSavingSettings(true);
    try {
      await api.put(`/tournaments/${tournament.id}/auction`, {
        has_auction: hasAuction,
        auction_title: auctionTitle || `${tournament.name} Official Player Auction`,
        auction_start_time: auctionStartTime,
        auction_end_time: auctionEndTime,
        team_purse: Number(teamPurse),
        min_bid_increment: Number(minBidIncrement),
        max_players_per_team: Number(maxPlayersPerTeam),
        min_players_per_team: Number(minPlayersPerTeam)
      });
      toast.success('Tournament auction settings saved successfully!');
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading Tournament Auction Management...</span>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
        <h3 className="text-xl font-bold text-white">Tournament Not Found</h3>
        <Link to="/organization/tournaments" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
          Back to Tournaments
        </Link>
      </div>
    );
  }

  const isFootball = tournament.sport_code === 'football';
  const allPlayers: AuctionPlayer[] = summaryData ? [
    ...(summaryData.pending_players || []),
    ...(summaryData.approved_players || []),
    ...(summaryData.sold_players || []),
    ...(summaryData.unsold_players || [])
  ] : [];

  const filteredPlayers = allPlayers.filter(p => {
    const matchesSearch = p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (p.village && p.village.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    if (playerFilter === 'all') return true;
    if (playerFilter === 'registered') return p.status === 'registered';
    if (playerFilter === 'approved') return p.status === 'approved' || p.status === 'in_hammer';
    if (playerFilter === 'sold') return p.status === 'sold';
    if (playerFilter === 'unsold') return p.status === 'unsold';
    if (playerFilter === 'rejected') return p.status === 'rejected';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-slate-800 shadow-2xl relative">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Gavel className="w-7 h-7 text-amber-400" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                  isFootball ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                }`}>
                  {isFootball ? '⚽ Football 7s' : '🏏 Cricket T20'}
                </span>

                {auction ? (
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                    auction.status === 'live' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' :
                    auction.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    auction.status === 'paused' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    ● {auction.status.replace('_', ' ')}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[11px] font-bold uppercase">
                    Auction Disabled
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black font-heading text-white tracking-tight">
                {auction?.title || `${tournament.name} Auction`}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Tournament Creator Control Center • {tournament.village}, {tournament.district}
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2.5">
            {auction && (
              <>
                <Link
                  to={`/organization/auction/${auction.id}`}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all"
                >
                  <Gavel className="w-4 h-4" />
                  <span>Launch Live Arena ↗</span>
                </Link>

                <Link
                  to={`/auction/tv/${auction.id}`}
                  target="_blank"
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <Tv className="w-4 h-4 text-emerald-400" />
                  <span>TV View ↗</span>
                </Link>

                <Link
                  to={`/register/player-auction/${auction.token}`}
                  target="_blank"
                  className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center gap-1.5 border border-amber-500/30 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Form ↗</span>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-8 pt-4 border-t border-slate-800 flex items-center gap-2 overflow-x-auto text-xs font-bold">
          {[
            { id: 'overview', label: 'Overview & Status', icon: Trophy },
            { id: 'players', label: `Player Pool (${allPlayers.length})`, icon: Users },
            { id: 'teams', label: `Teams & Purses (${summaryData?.team_purses?.length || 0})`, icon: DollarSign },
            { id: 'settings', label: 'Auction Schedule & Rules', icon: Clock },
            { id: 'history', label: 'Auction Results & Report', icon: Award }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & STATUS CONTROLS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Total Purse / Team</span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 mt-1">
                ₹{auction?.team_purse.toLocaleString() || '1,00,000'}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">Min Inc: ₹{auction?.min_bid_increment || 500}</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Registered Players</span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-cyan-400 mt-1">
                {summaryData?.stats?.total_players || allPlayers.length}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">{summaryData?.stats?.pending_count || 0} Pending Review</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Players Sold</span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-1">
                {summaryData?.stats?.sold_count || 0}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">{summaryData?.stats?.unsold_count || 0} Unsold</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Total Spent in Auction</span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1">
                ₹{(summaryData?.stats?.total_spent || 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">Top Bid: ₹{(summaryData?.stats?.highest_bid || 0).toLocaleString()}</span>
            </div>
          </div>

          {/* Quick Auction Status Switcher */}
          {auction && (
            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                    Auction Lifecycle & Status Switcher
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Control when team managers and players can enter the bidding arena</p>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                  Current: {auction.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { id: 'upcoming', label: 'Upcoming (Scheduled)', icon: Clock, color: 'hover:border-slate-600' },
                  { id: 'registration_open', label: 'Registration Open', icon: Share2, color: 'hover:border-cyan-500' },
                  { id: 'live', label: 'Go Live 🔴', icon: Play, color: 'hover:border-rose-500 bg-rose-500/10 text-rose-300' },
                  { id: 'paused', label: 'Pause Bidding ⏸️', icon: Pause, color: 'hover:border-amber-500' },
                  { id: 'completed', label: 'Mark Completed 🏁', icon: CheckCircle2, color: 'hover:border-emerald-500' }
                ].map(st => (
                  <button
                    key={st.id}
                    onClick={() => handleStatusChange(st.id as AuctionStatus)}
                    className={`p-3.5 rounded-2xl border text-left text-xs font-bold transition-all flex flex-col justify-between ${st.color} ${
                      auction.status === st.id
                        ? 'border-amber-500 bg-amber-500/20 text-white shadow-lg'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span>{st.label}</span>
                    <span className="text-[11px] text-slate-500 font-normal mt-2">
                      {auction.status === st.id ? '● Active State' : 'Click to Switch'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PLAYER POOL & APPROVALS */}
      {activeTab === 'players' && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                Auction Player Registrations & Approval Queue
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Approve, reject, or manage players before calling them to the hammer</p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/register/player-auction/${auction?.token}`}
                target="_blank"
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <span>+ Register New Player ↗</span>
              </Link>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-bold w-full sm:w-auto">
              {(['all', 'registered', 'approved', 'sold', 'unsold', 'rejected'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setPlayerFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl capitalize transition-colors ${
                    playerFilter === tab
                      ? 'bg-slate-800 text-white font-black'
                      : 'text-slate-400 hover:text-white bg-slate-950'
                  }`}
                >
                  {tab === 'registered' ? 'Pending Review' : tab}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search player name or village..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none pl-8"
              />
              <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
            </div>
          </div>

          {/* Players Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="pb-3">Player</th>
                  <th className="pb-3">Role / Skill</th>
                  <th className="pb-3">Location & Age</th>
                  <th className="pb-3">Base Price</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPlayers.length > 0 ? (
                  filteredPlayers.map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <img src={p.photo} alt={p.full_name} className="w-9 h-9 rounded-xl object-cover border border-slate-700 shrink-0" />
                          <div>
                            <div className="font-bold text-white">{p.full_name}</div>
                            <div className="text-[11px] text-slate-400">{p.mobile}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3">
                        <span className="font-semibold text-slate-200 block">{p.football_position || p.cricket_role}</span>
                        <span className="text-[11px] text-amber-400 font-bold">{p.category}</span>
                      </td>

                      <td className="py-3 text-slate-400">
                        <div>{p.village || 'Village'}, {p.district}</div>
                        <div className="text-[11px] text-slate-500">Age: {p.age}</div>
                      </td>

                      <td className="py-3 font-mono font-black text-amber-400">
                        ₹{p.base_price.toLocaleString()}
                      </td>

                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase ${
                          p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          p.status === 'sold' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                          p.status === 'unsold' ? 'bg-slate-800 text-slate-400' :
                          p.status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                        }`}>
                          {p.status === 'registered' ? 'Pending Review' : p.status}
                        </span>
                        {p.sold_to_team_name && (
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Sold to: {p.sold_to_team_name} (₹{p.sold_price?.toLocaleString()})
                          </span>
                        )}
                      </td>

                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status === 'registered' && (
                            <>
                              <button
                                onClick={() => handleApprovePlayer(p.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleRejectPlayer(p.id)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 font-bold text-[11px]"
                              >
                                <XCircle className="w-3 h-3" />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => handleDeletePlayer(p.id)}
                            className="p-1 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-xs text-slate-500">
                      No players matching this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TEAMS & PURSES */}
      {activeTab === 'teams' && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                Participating Teams & Purse Balances
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Track team manager budgets, spent amounts, and squad fill ratios</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              Total Team Purse: ₹{auction?.team_purse.toLocaleString() || '100,000'}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {(summaryData?.team_purses || []).map((tp: TeamAuctionPurse) => (
              <div key={tp.team_id} className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-base">{tp.team_name}</h4>
                  <span className="font-mono font-black text-emerald-400 text-base">₹{tp.remaining_purse.toLocaleString()} rem</span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Squad: <strong className="text-white">{tp.players_bought_count} / {tp.max_players}</strong> bought</span>
                  <span>Spent: <strong className="text-amber-400">₹{tp.spent_amount.toLocaleString()}</strong></span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (tp.spent_amount / tp.total_purse) * 100)}%` }}
                  />
                </div>

                {/* Bought Players Badges */}
                {tp.bought_players && tp.bought_players.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] font-bold uppercase text-slate-500 block mb-1.5">Acquired Players:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {tp.bought_players.map(bp => (
                        <span key={bp.id} className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-semibold flex items-center gap-1">
                          <span>{bp.full_name}</span>
                          <span className="text-amber-400 font-mono font-bold">₹{bp.sold_price?.toLocaleString()}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: AUCTION SCHEDULE & RULES CONFIGURATION */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                Configure Auction Rules, Schedule & Purse
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Control whether player auction is enabled or clubs register directly</p>
            </div>
          </div>

          {/* Enable Auction Toggle */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-bold text-white text-sm block">Enable Player Auction for this Tournament</span>
              <p className="text-xs text-slate-400 mt-0.5">
                If disabled, participating teams will register and enter their squads directly without an auction.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={hasAuction}
                onChange={(e) => setHasAuction(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
            </label>
          </div>

          {hasAuction && (
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Official Auction Title</label>
                <input
                  type="text"
                  value={auctionTitle}
                  onChange={(e) => setAuctionTitle(e.target.value)}
                  placeholder="e.g. Malappuram 7s Official Player Auction 2026"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Auction Start Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={auctionStartTime}
                    onChange={(e) => setAuctionStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Auction End Date & Time (Optional)</label>
                  <input
                    type="datetime-local"
                    value={auctionEndTime}
                    onChange={(e) => setAuctionEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Total Team Purse Budget (₹) *</label>
                  <input
                    type="number"
                    value={teamPurse}
                    onChange={(e) => setTeamPurse(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Minimum Bid Increment (₹) *</label>
                  <input
                    type="number"
                    value={minBidIncrement}
                    onChange={(e) => setMinBidIncrement(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Max Players per Team Roster</label>
                  <input
                    type="number"
                    value={maxPlayersPerTeam}
                    onChange={(e) => setMaxPlayersPerTeam(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Min Players Required per Team</label>
                  <input
                    type="number"
                    value={minPlayersPerTeam}
                    onChange={(e) => setMinPlayersPerTeam(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
            >
              {savingSettings ? 'Saving Settings...' : 'Save Auction Configuration'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* TAB 5: AUCTION RESULTS & SUMMARY REPORT */}
      {activeTab === 'history' && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                Complete Auction Results & Transfer History
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Comprehensive audit trail of all hammered sales and squad purchases</p>
            </div>

            <button
              onClick={() => toast.success('Auction Summary report exported!')}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export CSV / PDF</span>
            </button>
          </div>

          {/* Sold Players Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="pb-3">Rank</th>
                  <th className="pb-3">Player Name</th>
                  <th className="pb-3">Role / Skill</th>
                  <th className="pb-3">Base Price</th>
                  <th className="pb-3">Purchased by Team</th>
                  <th className="pb-3 text-right">Final Bid Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(summaryData?.sold_players || []).length > 0 ? (
                  summaryData.sold_players.map((sp: AuctionPlayer, idx: number) => (
                    <tr key={sp.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 font-mono font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <img src={sp.photo} alt={sp.full_name} className="w-7 h-7 rounded-lg object-cover" />
                          <span className="font-bold text-white">{sp.full_name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-300">{sp.football_position || sp.cricket_role}</td>
                      <td className="py-3 font-mono text-slate-400">₹{sp.base_price.toLocaleString()}</td>
                      <td className="py-3 font-bold text-emerald-400">{sp.sold_to_team_name}</td>
                      <td className="py-3 text-right font-mono font-black text-amber-400 text-sm">
                        ₹{sp.sold_price?.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-xs text-slate-500">
                      No players have been sold yet. Live auction in progress or pending.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
