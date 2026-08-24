import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { 
  Plus, Share2, Copy, Check, 
  X, Gavel
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonCard } from '../../components/ui/Feedback';

export const OrgTournamentsPage: React.FC = () => {
  const toast = useToast();
  const { } = useAuth();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form State for Creating Tournament
  const [name, setName] = useState('');
  const [sportCode, setSportCode] = useState<'football' | 'cricket'>('football');
  const [location, setLocation] = useState('');
  const [district, _setDistrict] = useState('Malappuram');
  const [format, setFormat] = useState('league_knockout');
  const [maxTeams, setMaxTeams] = useState<number>(8);
  const [groundFee, setGroundFee] = useState<number>(5000);
  const [allowPartial, setAllowPartial] = useState<boolean>(true);
  const [partialValue, setPartialValue] = useState<number>(50); // 50%
  const [prizeMoney, setPrizeMoney] = useState<number>(50000);
  const [footballFormat, setFootballFormat] = useState('7-a-side');
  const [cricketFormat, setCricketFormat] = useState('T20');
  const [totalOvers, setTotalOvers] = useState<number>(20);

  // Auction specific toggle & config
  const [hasAuction, setHasAuction] = useState<boolean>(true);
  const [auctionStartTime, setAuctionStartTime] = useState('');
  const [auctionEndTime, _setAuctionEndTime] = useState('');
  const [teamPurse, setTeamPurse] = useState<number>(100000);
  const [minBidIncrement, setMinBidIncrement] = useState<number>(500);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/tournaments');
      setTournaments(res);
    } catch (err) {
      console.error('Failed to load tournaments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const handleCopyLink = (token: string) => {
    const fullUrl = `${window.location.origin}/register/team/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleShareWhatsApp = (tourneyName: string, token: string) => {
    const fullUrl = `${window.location.origin}/register/team/${token}`;
    const text = `🏆 Register your team now for ${tourneyName}! Register online & secure your slot: ${fullUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/tournaments', {
        name,
        sport_code: sportCode,
        location,
        district,
        format,
        max_teams: Number(maxTeams),
        ground_fee: Number(groundFee),
        payment_config: {
          allow_partial: allowPartial,
          min_partial_type: 'percentage',
          min_partial_value: Number(partialValue)
        },
        prize_money: Number(prizeMoney),
        has_auction: hasAuction,
        auction_start_time: auctionStartTime,
        auction_end_time: auctionEndTime,
        team_purse: Number(teamPurse),
        min_bid_increment: Number(minBidIncrement),
        settings: {
          football_format: footballFormat,
          cricket_format: cricketFormat,
          total_overs: Number(totalOvers),
          squad_min_players: sportCode === 'football' ? (footballFormat === '5-a-side' ? 5 : 7) : 11,
          squad_max_players: sportCode === 'football' ? 14 : 16
        }
      });

      setShowCreateModal(false);
      fetchTournaments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tournament. Plan limit may have been reached.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Organization Tournaments</h1>
          <p className="text-xs text-slate-400 mt-1">Host Football & Cricket tournaments with optional Live Player Auctions or Direct Team Registration</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Tournament</span>
        </button>
      </div>

      {/* Tournaments Grid */}
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
        {tournaments.map(t => {
          const isFb = t.sport_code === 'football';
          const regToken = t.registration_link_token || 'sevens-cup-2026-reg';
          const hasAuctionEnabled = Boolean(t.has_auction);

          return (
            <div key={t.id} className="p-4 sm:p-6 rounded-3xl glass-card border border-slate-800 flex flex-col justify-between min-w-0 hover:border-slate-700 transition-all">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      isFb ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {isFb ? '⚽ Football' : '🏏 Cricket'} • {t.format}
                    </span>

                    {hasAuctionEnabled ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Gavel className="w-3 h-3" />
                        <span>Auction: {t.auction_status || 'upcoming'}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-semibold uppercase tracking-wider">
                        Direct Team Registration
                      </span>
                    )}
                  </div>

                  <span className="text-xs font-mono font-bold text-emerald-400">Fee: ₹{t.ground_fee}</span>
                </div>

                <h3 className="text-xl font-bold text-white font-heading">{t.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{t.location || t.district}</p>

                {/* Registration Link Box */}
                <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">
                      {hasAuctionEnabled ? 'Direct Team Entry Link' : 'Public Team Registration Link'}
                    </span>
                    <span className="text-[11px] text-emerald-400 font-bold">{t.teams_count || 4}/{t.max_teams} Teams</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/register/team/${regToken}`}
                      className="flex-1 min-w-0 basis-full sm:basis-auto px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 truncate"
                    />
                    <button
                      onClick={() => handleCopyLink(regToken)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
                    >
                      {copiedToken === regToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedToken === regToken ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleShareWhatsApp(t.name, regToken)}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <Link
                  to={`/tournaments/${t.slug}`}
                  target="_blank"
                  className="text-xs font-bold text-slate-300 hover:text-emerald-400 flex items-center gap-1"
                >
                  <span>Public Hub ↗</span>
                </Link>

                <div className="flex flex-wrap items-center gap-2">
                  {hasAuctionEnabled ? (
                    <>
                      <Link
                        to={`/organization/tournaments/${t.id}/auction`}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold flex items-center gap-1 transition-colors"
                      >
                        <Gavel className="w-3.5 h-3.5" />
                        <span>Manage Auction</span>
                      </Link>

                      <Link
                        to={`/organization/auction/${t.auction_id || 'auction-football-1'}`}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs shadow-md flex items-center gap-1"
                      >
                        <span>Live Arena</span>
                      </Link>
                    </>
                  ) : (
                    <Link
                      to={`/organization/tournaments/${t.id}/auction`}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-semibold flex items-center gap-1 text-[11px]"
                      title="Enable Auction"
                    >
                      <span>+ Enable Auction</span>
                    </Link>
                  )}

                  <Link
                    to={`/organization/teams`}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold"
                  >
                    Teams
                  </Link>

                  <Link
                    to={`/organization/fixtures`}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-semibold"
                  >
                    Fixtures →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Tournament Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-white font-heading">Create New Tournament</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tournament Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Malappuram Monsoon Premier League 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl glass-input font-semibold text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Sport Type *</label>
                  <select
                    value={sportCode}
                    onChange={(e) => setSportCode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-emerald-400 font-bold"
                  >
                    <option value="football">⚽ Football</option>
                    <option value="cricket">🏏 Cricket</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tournament Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                  >
                    <option value="league_knockout">League + Knockout</option>
                    <option value="knockout">Single Elimination Knockout</option>
                    <option value="league">Round Robin League</option>
                  </select>
                </div>
              </div>

              {/* AUCTION SELECTION TOGGLE */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white uppercase text-[11px] flex items-center gap-1.5">
                      <Gavel className="w-3.5 h-3.5 text-amber-400" />
                      <span>Player Auction System (Optional)</span>
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {hasAuction 
                        ? 'Teams acquire players through a live bidding auction with purse limits.' 
                        : 'Clubs/teams directly register and manage their own squad normally without an auction.'}
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="block text-slate-400 text-[11px] uppercase font-bold mb-1">Auction Date & Time</label>
                      <input
                        type="datetime-local"
                        value={auctionStartTime}
                        onChange={(e) => setAuctionStartTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] uppercase font-bold mb-1">Team Purse (₹)</label>
                      <input
                        type="number"
                        value={teamPurse}
                        onChange={(e) => setTeamPurse(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 font-mono font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] uppercase font-bold mb-1">Min Bid Inc (₹)</label>
                      <input
                        type="number"
                        value={minBidIncrement}
                        onChange={(e) => setMinBidIncrement(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {sportCode === 'football' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Football Format</label>
                    <select
                      value={footballFormat}
                      onChange={(e) => setFootballFormat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                    >
                      <option value="5-a-side">5-a-side</option>
                      <option value="7-a-side">7-a-side (Kerala Sevens)</option>
                      <option value="9-a-side">9-a-side</option>
                      <option value="11-a-side">11-a-side</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Max Teams</label>
                    <input
                      type="number"
                      min="2"
                      value={maxTeams}
                      onChange={(e) => setMaxTeams(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Cricket Format</label>
                    <select
                      value={cricketFormat}
                      onChange={(e) => setCricketFormat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                    >
                      <option value="T10">T10 (10 Overs)</option>
                      <option value="T20">T20 (20 Overs)</option>
                      <option value="15 overs">15 Overs</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Total Overs</label>
                    <input
                      type="number"
                      min="5"
                      value={totalOvers}
                      onChange={(e) => setTotalOvers(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Max Teams</label>
                    <input
                      type="number"
                      min="2"
                      value={maxTeams}
                      onChange={(e) => setMaxTeams(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Ground Fee & Payment Options Configuration */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white uppercase text-[11px]">Ground Fee & Team Payment Config</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Total Ground Fee (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={groundFee}
                      onChange={(e) => setGroundFee(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl glass-input font-mono font-bold text-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Min Partial Payment (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      value={partialValue}
                      onChange={(e) => setPartialValue(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl glass-input font-mono text-amber-400"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={allowPartial}
                    onChange={(e) => setAllowPartial(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span>Allow Teams to Pay {partialValue}% Advance Ground Fee during Registration</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Venue / Ground Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Nilambur Municipal Stadium"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Prize Money Pool (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={prizeMoney}
                    onChange={(e) => setPrizeMoney(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl glass-input font-mono font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold"
                >
                  Launch Tournament
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
