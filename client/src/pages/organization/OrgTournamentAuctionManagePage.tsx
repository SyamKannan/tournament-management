import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import type { 
  Auction, AuctionPlayer, Tournament, TeamAuctionPurse, AuctionStatus,
  AuctionPaymentReport
} from '../../types';
import { 
  Gavel, Trophy, Users, DollarSign, Clock, 
  CheckCircle2, XCircle, Tv, Share2, 
  ArrowRight, Trash2, 
  Filter, Download, Award, Play, Pause,
  Printer, CreditCard, Check, RotateCcw,
  Info, FileText, Search, X
} from 'lucide-react';
import { label } from '../../lib/labels';
import { formatDate, formatMoney } from '../../lib/format';

export const OrgTournamentAuctionManagePage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const { } = useAuth();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [paymentReport, setPaymentReport] = useState<AuctionPaymentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'teams' | 'settings' | 'history'>('overview');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'registered' | 'approved' | 'sold' | 'unsold' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Settlement state
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [selectedPlayerForPayment, setSelectedPlayerForPayment] = useState<AuctionPlayer | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentFormStatus, setPaymentFormStatus] = useState<'paid' | 'pending'>('paid');
  const [paymentFormAmount, setPaymentFormAmount] = useState<number>(0);
  const [paymentFormMethod, setPaymentFormMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other'>('upi');
  const [paymentFormRef, setPaymentFormRef] = useState('');
  const [paymentFormNotes, setPaymentFormNotes] = useState('');
  const [paymentFormDate, setPaymentFormDate] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

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

        // Fetch payment report
        const report = await api.get(`/auctions/${auctionRes.auction.id}/payment-report`).catch(() => null);
        setPaymentReport(report);
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
      toast.success(`Auction status set to ${label(newStatus).toLowerCase()}`);
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
      toast.success('Player approved for auction pool');
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve player');
    }
  };

  const handleRejectPlayer = async (playerId: string) => {
    if (!auction) return;
    try {
      await api.post(`/auctions/${auction.id}/players/${playerId}/reject`, {});
      toast.info('Player registration rejected');
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
      toast.success('Player removed from pool');
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete player');
    }
  };

  // Open Payment Settlement Modal
  const openPaymentModal = (player: AuctionPlayer) => {
    setSelectedPlayerForPayment(player);
    setPaymentFormStatus('paid');
    setPaymentFormAmount(player.payment_amount || player.sold_price || player.base_price || 0);
    setPaymentFormMethod(player.payment_method || 'upi');
    setPaymentFormRef(player.payment_reference || '');
    setPaymentFormNotes(player.payment_notes || '');
    setPaymentFormDate(player.paid_at ? player.paid_at.substring(0, 10) : new Date().toISOString().substring(0, 10));
    setPaymentModalOpen(true);
  };

  // Quick Toggle Payment
  const handleQuickTogglePayment = async (player: AuctionPlayer) => {
    if (!auction) return;
    const newStatus = player.payment_status === 'paid' ? 'pending' : 'paid';
    try {
      await api.post(`/auctions/${auction.id}/players/${player.id}/payment`, {
        payment_status: newStatus,
        payment_amount: player.payment_amount || player.sold_price || player.base_price,
        payment_method: newStatus === 'paid' ? (player.payment_method || 'cash') : undefined,
        payment_reference: newStatus === 'paid' ? (player.payment_reference || `REF-${Date.now().toString().slice(-6)}`) : undefined,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : undefined,
      });
      toast.success(`Marked ${player.full_name} as ${newStatus.toUpperCase()}`);
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update payment status');
    }
  };

  // Save Detailed Payment Modal
  const handleSavePaymentModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auction || !selectedPlayerForPayment) return;
    setSavingPayment(true);
    try {
      await api.post(`/auctions/${auction.id}/players/${selectedPlayerForPayment.id}/payment`, {
        payment_status: paymentFormStatus,
        payment_amount: Number(paymentFormAmount),
        payment_method: paymentFormStatus === 'paid' ? paymentFormMethod : undefined,
        payment_reference: paymentFormStatus === 'paid' ? paymentFormRef : undefined,
        payment_notes: paymentFormNotes,
        paid_at: paymentFormStatus === 'paid' ? new Date(paymentFormDate || Date.now()).toISOString() : undefined,
      });
      toast.success(`Payment record saved for ${selectedPlayerForPayment.full_name}!`);
      setPaymentModalOpen(false);
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save payment record');
    } finally {
      setSavingPayment(false);
    }
  };

  // Bulk Mark Payments
  const handleBulkUpdatePayments = async (status: 'paid' | 'pending') => {
    if (!auction) return;
    const count = status === 'paid' 
      ? (paymentReport?.summary?.pending_players_count || 0)
      : (paymentReport?.summary?.paid_players_count || 0);

    if (count === 0) {
      toast.info(`No players currently in ${status === 'paid' ? 'pending' : 'paid'} status.`);
      return;
    }

    const proceed = await confirm({
      title: `Bulk mark all ${count} players as ${label(status).toLowerCase()}?`,
      message: status === 'paid'
        ? 'This will mark all sold players as Paid (recorded via Cash settlement by default). You can customize individual records afterwards.'
        : 'This will revert all sold player payment statuses back to Pending.',
      confirmLabel: `Mark all as ${label(status).toLowerCase()}`,
      tone: status === 'paid' ? 'default' : 'danger',
    });
    if (!proceed) return;

    setBulkProcessing(true);
    try {
      await api.post(`/auctions/${auction.id}/payments/bulk-update`, {
        payment_status: status,
        payment_method: status === 'paid' ? 'cash' : undefined,
        payment_notes: status === 'paid' ? 'Settled in full by tournament organizing committee' : undefined,
      });
      toast.success(`Successfully updated payment status for all sold players!`);
      fetchAuctionData();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk update failed');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const sold = paymentReport?.sold_players || summaryData?.sold_players || [];
    if (sold.length === 0) {
      toast.warning('No sold players to export yet.');
      return;
    }

    const headers = [
      'Rank', 'Player Name', 'Mobile', 'Village', 'District', 'Role', 'Category',
      'Acquiring Team', 'Base Price (INR)', 'Final Auction Price / Entitlement (INR)',
      'Payment Status', 'Settled Amount (INR)', 'Payment Method', 'Transaction Reference', 'Paid At', 'Notes'
    ];

    const rows = sold.map((p: AuctionPlayer, i: number) => [
      i + 1,
      `"${p.full_name}"`,
      `"${p.mobile}"`,
      `"${p.village || ''}"`,
      `"${p.district || ''}"`,
      `"${p.football_position || p.cricket_role || ''}"`,
      `"${p.category}"`,
      `"${p.sold_to_team_name || ''}"`,
      p.base_price,
      p.sold_price || 0,
      (p.payment_status || 'pending').toUpperCase(),
      p.payment_status === 'paid' ? (p.payment_amount || p.sold_price || 0) : 0,
      `"${p.payment_method || ''}"`,
      `"${p.payment_reference || ''}"`,
      `"${p.paid_at ? new Date(p.paid_at).toLocaleDateString() : ''}"`,
      `"${p.payment_notes || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Player_Payment_Settlement_Report_${tournament?.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Payment settlement report exported to CSV!');
  };

  // Print Report
  const handlePrintReport = () => {
    window.print();
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

  const soldPlayersList: AuctionPlayer[] = paymentReport?.sold_players || summaryData?.sold_players || [];
  const filteredSoldPlayers = soldPlayersList.filter(p => {
    const matchesSearch = p.full_name.toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (p.sold_to_team_name && p.sold_to_team_name.toLowerCase().includes(paymentSearch.toLowerCase())) ||
      (p.mobile && p.mobile.includes(paymentSearch));
    if (!matchesSearch) return false;
    if (paymentFilter === 'all') return true;
    if (paymentFilter === 'paid') return p.payment_status === 'paid';
    if (paymentFilter === 'pending') return p.payment_status !== 'paid';
    return true;
  });

  const paymentSummary = paymentReport?.summary || {
    total_sold_players: soldPlayersList.length,
    total_entitled_amount: summaryData?.stats?.total_spent || 0,
    total_paid_amount: summaryData?.stats?.total_paid_amount || 0,
    total_pending_amount: summaryData?.stats?.total_pending_amount || (summaryData?.stats?.total_spent || 0),
    paid_players_count: summaryData?.stats?.paid_players_count || 0,
    pending_players_count: summaryData?.stats?.pending_players_count || soldPlayersList.length,
    settlement_percentage: summaryData?.stats?.settlement_percentage || 0,
  };

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

                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                  Virtual Currency Auction
                </span>

                {auction ? (
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                    auction.status === 'live' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' :
                    auction.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    auction.status === 'paused' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    ● {label(auction.status)}
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
            { id: 'history', label: `Payment Report & Settlements (${soldPlayersList.length})`, icon: Award, highlight: true }
          ].map(tab => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 whitespace-nowrap transition-all ${
                  isTabActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : tab.highlight
                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-slate-900 border border-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.highlight && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
                    REPORT
                  </span>
                )}
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
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Virtual Purse / Team</span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 mt-1">
                ₹{auction?.team_purse.toLocaleString() || '1,00,000'}
              </div>
              <span className="text-[11px] text-slate-500 font-semibold">Min Inc: {formatMoney(auction?.min_bid_increment || 500)}</span>
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
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Total Player Payout Entitlement</span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1">
                ₹{(paymentSummary.total_entitled_amount || 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-emerald-400 font-semibold">{paymentSummary.paid_players_count} Paid • {paymentSummary.pending_players_count} Pending</span>
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
                  Current: {label(auction.status)}
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
                Participating Teams & Virtual Purse Balances
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Track team manager virtual budgets, spent amounts, and squad fill ratios</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              Virtual Budget / Team: ₹{auction?.team_purse.toLocaleString() || '100,000'}
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
                  <span>Virtual Spent: <strong className="text-amber-400">₹{tp.spent_amount.toLocaleString()}</strong></span>
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
                Configure Auction Rules, Schedule & Virtual Purse
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
                  <label className="block text-slate-300 font-semibold mb-1">
                    Total Team Virtual Purse Budget (₹) *
                    <span className="text-[11px] text-amber-400 font-normal ml-1.5">(Points only, no cash value)</span>
                  </label>
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

      {/* TAB 5: POST-AUCTION PLAYER PAYMENT REPORT & SETTLEMENT TRACKER */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Virtual Money Disclaimer Banner */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-cyan-500/10 border border-amber-500/30 text-xs shadow-lg flex items-start gap-3.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Info className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span>Virtual-Money Auction & Player Settlement Model</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase">
                  OFFICIAL GUIDELINE
                </span>
              </h4>
              <p className="text-slate-300 leading-relaxed">
                The virtual money (e.g. ₹{auction?.team_purse.toLocaleString() || '1,00,000'}) was used solely as bidding currency to allot players to team squads fairly. 
                Each sold player is entitled to receive real-money remuneration matching their final auction hammer price. 
                As tournament organizer, record, manage, and toggle each player's real-world disbursement status below.
              </p>
            </div>
          </div>

          {/* Settlement KPI Headline Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">
                Total Entitled Payout
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-cyan-400 mt-1">
                ₹{paymentSummary.total_entitled_amount.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-400 font-semibold">{paymentSummary.total_sold_players} Sold Players</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-emerald-500/30 bg-emerald-500/5 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400 block">
                Total Settled / Paid
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-1">
                ₹{paymentSummary.total_paid_amount.toLocaleString()}
              </div>
              <span className="text-[11px] text-emerald-300/80 font-bold">{paymentSummary.paid_players_count} Players Settled</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-amber-500/30 bg-amber-500/5 text-center">
              <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 block">
                Pending Payouts
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 mt-1">
                ₹{paymentSummary.total_pending_amount.toLocaleString()}
              </div>
              <span className="text-[11px] text-amber-300/80 font-bold">{paymentSummary.pending_players_count} Players Awaiting</span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-center flex flex-col justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">
                Settlement Progress
              </span>
              <div>
                <div className="text-2xl sm:text-3xl font-black font-mono text-white">
                  {paymentSummary.settlement_percentage}%
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${paymentSummary.settlement_percentage}%` }}
                  />
                </div>
              </div>
              <span className="text-[11px] text-slate-400 mt-1">
                {paymentSummary.paid_players_count} of {paymentSummary.total_sold_players} settled
              </span>
            </div>
          </div>

          {/* Team Disbursement Summaries */}
          {paymentReport?.team_summaries && paymentReport.team_summaries.length > 0 && (
            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading">
                    Disbursement Breakdown by Acquiring Team
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Total player payment obligations generated per club squad</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {paymentReport.team_summaries.map(ts => (
                  <div key={ts.team_id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{ts.team_name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px]">
                        {ts.players_acquired_count} bought
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-slate-400">
                      <span>Total Payout:</span>
                      <span className="font-mono font-bold text-cyan-400">₹{ts.total_player_entitlement.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Paid ({ts.paid_count}):</span>
                      <span className="font-mono font-bold text-emerald-400">₹{ts.paid_amount.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Pending ({ts.pending_count}):</span>
                      <span className="font-mono font-bold text-amber-400">₹{ts.pending_amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Player Payment Settlement Table */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-heading flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Player Payment Entitlement & Settlement Roster</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update payment status, record UPI/Cash transaction reference IDs, and generate physical payment vouchers
                </p>
              </div>

              {/* Action Buttons: Export CSV & Print */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={handlePrintReport}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Print Report</span>
                </button>
              </div>
            </div>

            {/* Filters, Search & Bulk Actions Bar */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'paid', 'pending'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setPaymentFilter(tab)}
                    className={`px-3.5 py-1.5 rounded-xl capitalize text-xs font-bold transition-all ${
                      paymentFilter === tab
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {tab === 'all' ? `All Players (${soldPlayersList.length})` :
                     tab === 'paid' ? `Paid (${paymentSummary.paid_players_count})` :
                     `Pending (${paymentSummary.pending_players_count})`}
                  </button>
                ))}

                <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />

                {/* Bulk Actions */}
                <button
                  onClick={() => handleBulkUpdatePayments('paid')}
                  disabled={bulkProcessing || paymentSummary.pending_players_count === 0}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 border border-emerald-500/30 text-xs font-bold transition-all flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark All as Paid</span>
                </button>

                <button
                  onClick={() => handleBulkUpdatePayments('pending')}
                  disabled={bulkProcessing || paymentSummary.paid_players_count === 0}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 disabled:opacity-40 border border-amber-500/30 text-xs font-bold transition-all flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert All to Pending</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search player, team, phone..."
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none pl-8"
                />
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
              </div>
            </div>

            {/* Payment Roster Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                    <th className="pb-3">Rank & Player</th>
                    <th className="pb-3">Acquiring Team</th>
                    <th className="pb-3">Entitled Fee</th>
                    <th className="pb-3">Settlement Status</th>
                    <th className="pb-3">Payment Details</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredSoldPlayers.length > 0 ? (
                    filteredSoldPlayers.map((sp: AuctionPlayer, idx: number) => {
                      const isPaid = sp.payment_status === 'paid';
                      return (
                        <tr key={sp.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Player Column */}
                          <td className="py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-slate-500 text-xs font-bold w-4">#{idx + 1}</span>
                              <img src={sp.photo} alt={sp.full_name} className="w-9 h-9 rounded-xl object-cover border border-slate-700 shrink-0" />
                              <div>
                                <div className="font-bold text-white text-sm">{sp.full_name}</div>
                                <div className="text-[11px] text-slate-400">
                                  {sp.mobile} • {sp.football_position || sp.cricket_role}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Team Column */}
                          <td className="py-3.5">
                            <span className="font-bold text-emerald-400 block">{sp.sold_to_team_name}</span>
                            <span className="text-[11px] text-slate-400 font-semibold">{sp.category}</span>
                          </td>

                          {/* Entitled Fee */}
                          <td className="py-3.5">
                            <div className="font-mono font-black text-amber-400 text-sm">
                              ₹{(sp.sold_price || sp.base_price).toLocaleString()}
                            </div>
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Final Bid Price</span>
                          </td>

                          {/* Settlement Status */}
                          <td className="py-3.5">
                            <button
                              onClick={() => handleQuickTogglePayment(sp)}
                              title="Click to toggle Paid / Pending"
                              className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                                isPaid
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 animate-pulse'
                              }`}
                            >
                              {isPaid ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>PAID</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                                  <span>PENDING</span>
                                </>
                              )}
                            </button>
                          </td>

                          {/* Payment Details */}
                          <td className="py-3.5 text-slate-400 text-[11px]">
                            {isPaid ? (
                              <div>
                                <span className="text-white font-semibold uppercase">{sp.payment_method || 'CASH'}</span>
                                {sp.payment_reference && (
                                  <span className="block font-code text-[10px] text-cyan-400">Ref: {sp.payment_reference}</span>
                                )}
                                {sp.paid_at && (
                                  <span className="text-[10px] text-slate-500 block">
                                    Date: {formatDate(sp.paid_at)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">No disbursement recorded</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openPaymentModal(sp)}
                                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition-colors flex items-center gap-1"
                              >
                                <CreditCard className="w-3 h-3 text-cyan-400" />
                                <span>{isPaid ? 'Edit Record' : 'Record Pay'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-xs text-slate-500">
                        {soldPlayersList.length === 0 
                          ? 'No players have been sold in the auction yet.'
                          : 'No players match your payment filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RECORD / EDIT PAYMENT SETTLEMENT MODAL */}
      {paymentModalOpen && selectedPlayerForPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl overflow-y-auto max-h-[calc(100dvh-2rem)] space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Player Payment Settlement</h3>
                  <p className="text-xs text-slate-400">{selectedPlayerForPayment.full_name}</p>
                </div>
              </div>

              <button
                onClick={() => setPaymentModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentModal} className="space-y-4 text-xs">
              {/* Player Summary Card */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-bold block">Acquired by Team</span>
                  <span className="font-bold text-emerald-400 text-sm">{selectedPlayerForPayment.sold_to_team_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 uppercase text-[10px] font-bold block">Winning Auction Price</span>
                  <span className="font-mono font-black text-amber-400 text-sm">
                    ₹{(selectedPlayerForPayment.sold_price || selectedPlayerForPayment.base_price).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Status Radio */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Disbursement Status *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentFormStatus('paid')}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      paymentFormStatus === 'paid'
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark Paid</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentFormStatus('pending')}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      paymentFormStatus === 'pending'
                        ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>Mark Pending</span>
                  </button>
                </div>
              </div>

              {paymentFormStatus === 'paid' && (
                <>
                  {/* Amount & Method */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Disbursed Amount (₹) *</label>
                      <input
                        type="number"
                        value={paymentFormAmount}
                        onChange={(e) => setPaymentFormAmount(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Payment Method *</label>
                      <select
                        value={paymentFormMethod}
                        onChange={(e: any) => setPaymentFormMethod(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold outline-none"
                      >
                        <option value="upi">UPI / GPay / PhonePe</option>
                        <option value="cash">Cash in Hand</option>
                        <option value="bank_transfer">Bank NEFT / IMPS</option>
                        <option value="cheque">Cheque</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Reference & Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Transaction Ref / UTR / Cheque #</label>
                      <input
                        type="text"
                        placeholder="e.g. UPI/2026/894102948"
                        value={paymentFormRef}
                        onChange={(e) => setPaymentFormRef(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Payment Date</label>
                      <input
                        type="date"
                        value={paymentFormDate}
                        onChange={(e) => setPaymentFormDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Committee Notes */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Settlement Notes / Remarks</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Handed over at committee office by Tournament President."
                  value={paymentFormNotes}
                  onChange={(e) => setPaymentFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-600/20"
                >
                  {savingPayment ? 'Saving Record...' : 'Save Settlement Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
