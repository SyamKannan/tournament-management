import React, { useState, useEffect } from 'react';
import { SportsLoader } from '../../components/ui/SportsLoader';
import { useAuth } from '../../context/AuthContext';
import { usePlatformConfig } from '../../context/PlatformConfigContext';
import { api, ApiError } from '../../services/api';
import {
  Plus, Share2, Copy, Check,
  X, Gavel, MapPin, Compass, Image as ImageIcon, Camera, Pencil,
  Sparkles, Download, Loader2, Ban, QrCode
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Skeleton, SkeletonCard } from '../../components/ui/Feedback';
import { MapLocationPicker, type VenueLocation } from '../../components/MapLocationPicker';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { PlanPickerModal } from '../../components/PlanPickerModal';
import { RegistrationQrModal } from '../../components/RegistrationQrModal';
import { FEATURE_AUCTION_ENABLED } from '../../config';
import type { PaymentMethod } from '../../types';
import { ALL_PAYMENT_METHODS, PAYMENT_METHOD_META } from '../../lib/paymentMethods';
import { label, tournamentGame } from '../../lib/labels';
import NumberInput from '../../components/NumberInput';
import { formatMoney } from '../../lib/format';

type PosterTemplate = 'auto' | 'arena' | 'split' | 'classic';

// Picking a format fills in the overs; any other number of overs is saved as "N overs".
// The scoring engine only reads total_overs — the format is the name shown to people.
const CRICKET_FORMATS = [
  { value: '5 overs', label: '5 Overs', overs: 5 },
  { value: '6 overs', label: '6 Overs', overs: 6 },
  { value: '8 overs', label: '8 Overs', overs: 8 },
  { value: 'T10', label: 'T10 (10 Overs)', overs: 10 },
  { value: '12 overs', label: '12 Overs', overs: 12 },
  { value: '15 overs', label: '15 Overs', overs: 15 },
  { value: 'T20', label: 'T20 (20 Overs)', overs: 20 },
  { value: '50 overs', label: 'One Day (50 Overs)', overs: 50 },
];
const CUSTOM_FORMAT = 'custom';
const cricketFormatFor = (overs: number) => CRICKET_FORMATS.find(f => f.overs === overs)?.value ?? `${overs} overs`;

const POSTER_TEMPLATES: { id: PosterTemplate; label: string }[] = [
  { id: 'auto', label: 'Surprise me' },
  { id: 'arena', label: 'Arena' },
  { id: 'split', label: 'Bold Split' },
  { id: 'classic', label: 'Gold Classic' },
];

export const OrgTournamentsPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const { organization } = useAuth();
  const { enabledSports, enabledPaymentMethods } = usePlatformConfig();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTournament, setEditingTournament] = useState<any | null>(null);

  // Map Location Picker State
  const [showMapModal, setShowMapModal] = useState(false);
  const [venueData, setVenueData] = useState<VenueLocation>({
    venueName: 'Malappuram Sports Complex (Payyanad Stadium)',
    address: 'Payyanad, Manjeri, Malappuram, Kerala 676122',
    district: 'Malappuram',
    state: 'Kerala',
    latitude: 11.1271,
    longitude: 76.1311,
    googleMapsUrl: 'https://maps.google.com/?q=11.1271,76.1311'
  });

  // Banner Upload State
  const [bannerUrl, setBannerUrl] = useState('');
  const [showBannerModal, setShowBannerModal] = useState(false);

  // Poster Generation State
  const [posterTournament, setPosterTournament] = useState<any | null>(null);
  const [qrTournament, setQrTournament] = useState<any | null>(null);
  const [posterTemplate, setPosterTemplate] = useState<PosterTemplate>('auto');
  // What the poster on screen was actually drawn with — layout and colorway,
  // e.g. "split:ember". "Surprise me" picks server-side, so the chip you
  // clicked doesn't answer this, and the API needs it back to draw something
  // different next time.
  const [posterDesign, setPosterDesign] = useState<string | null>(null);
  const [generatingPosterId, setGeneratingPosterId] = useState<string | null>(null);
  const posterDesignLabel =
    POSTER_TEMPLATES.find(opt => opt.id === posterDesign?.split(':')[0])?.label ?? null;

  // Form State for Creating Tournament
  const [name, setName] = useState('');
  const [sportCode, setSportCode] = useState<'football' | 'cricket'>('cricket');
  const [location, setLocation] = useState('Payyanad Stadium, Manjeri');
  const [district, setDistrict] = useState('Malappuram');
  const [format, setFormat] = useState('league_knockout');
  const [maxTeams, setMaxTeams] = useState<number>(8);
  const [planTeamLimit, setPlanTeamLimit] = useState<number | null>(null);
  const [groundFee, setGroundFee] = useState<number>(5000);
  const [allowPartial, setAllowPartial] = useState<boolean>(true);
  const [enabledMethods, setEnabledMethods] = useState<PaymentMethod[]>(ALL_PAYMENT_METHODS);
  const [prizeMoney, setPrizeMoney] = useState<number>(50000);
  const [footballFormat, setFootballFormat] = useState('7-a-side');
  const [cricketFormat, setCricketFormat] = useState('T20');
  const [totalOvers, setTotalOvers] = useState<number>(20);

  // Auction specific toggle & config
  const [hasAuction, setHasAuction] = useState<boolean>(FEATURE_AUCTION_ENABLED);
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

  // Keep the sport picker on an enabled sport when creating a tournament — an
  // admin can disable the currently-selected sport at any time.
  useEffect(() => {
    if (editingId || enabledSports.length === 0) return;
    if (!enabledSports.some(s => s.code === sportCode)) {
      setSportCode(enabledSports[0].code);
    }
  }, [enabledSports, editingId]);

  // Keep the payment method selection on platform-enabled methods when
  // creating a tournament — an admin can disable a method at any time.
  useEffect(() => {
    if (editingId || enabledPaymentMethods.length === 0) return;
    setEnabledMethods(prev => {
      const filtered = prev.filter(m => enabledPaymentMethods.includes(m));
      return filtered.length ? filtered : [enabledPaymentMethods[0]];
    });
  }, [enabledPaymentMethods, editingId]);

  useEffect(() => {
    if (!organization) return;
    api.get(`/organizations/${organization.id}/usage`)
      .then(res => setPlanTeamLimit(res?.plan?.team_limit ?? null))
      .catch(err => console.error('Failed to load plan limits', err));
  }, [organization]);

  const handleMaxTeamsChange = (value: number) => {
    setMaxTeams(planTeamLimit ? Math.min(value, planTeamLimit) : value);
  };

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

  // `template` is passed explicitly when a design chip triggers this, so the
  // click doesn't race the state update it just made.
  const handleGeneratePoster = async (t: any, template: PosterTemplate = posterTemplate) => {
    setGeneratingPosterId(t.id);
    try {
      const res = await api.post(`/tournaments/${t.id}/poster`, {
        use_ai: true,
        template,
        avoid: posterDesign,
      });
      const updated = { ...t, poster: res.poster };
      setTournaments(prev => prev.map(x => (x.id === t.id ? { ...x, poster: res.poster } : x)));
      setPosterTournament(updated);
      setPosterDesign(res.design ?? null);
      toast.success(res.used_ai ? 'Poster ready with AI artwork.' : 'Poster ready.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate poster.');
    } finally {
      setGeneratingPosterId(null);
    }
  };

  const handleCancelTournament = async (t: any) => {
    const proceed = await confirm({
      title: `Cancel ${t.name}?`,
      message: 'Every match that has not finished will be cancelled and the public registration link will stop accepting teams. Completed results are kept. This cannot be undone.',
      confirmLabel: 'Cancel tournament',
      cancelLabel: 'Keep tournament',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      const res = await api.post(`/tournaments/${t.id}/cancel`, {});
      setTournaments(prev => prev.map(x => (x.id === t.id ? { ...x, status: 'cancelled' } : x)));
      toast.success(res.cancelled_matches_count > 0
        ? `Tournament cancelled along with ${res.cancelled_matches_count} unfinished match${res.cancelled_matches_count === 1 ? '' : 'es'}.`
        : 'Tournament cancelled.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel tournament.');
    }
  };

  const submitTournament = async () => {
    await api.post('/tournaments', {
      name,
      sport_code: sportCode,
      location: venueData.venueName || location,
      district: venueData.district || district,
      banner: bannerUrl || undefined,
      format,
      max_teams: Number(maxTeams),
      ground_fee: Number(groundFee),
      payment_config: {
        allow_partial: allowPartial,
        // Teams pay in full or in halves.
        min_partial_type: 'percentage',
        min_partial_value: 50,
        enabled_methods: enabledMethods
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
        squad_max_players: sportCode === 'football' ? 14 : 16,
        venue_name: venueData.venueName,
        venue_address: venueData.address,
        google_maps_url: venueData.googleMapsUrl,
        latitude: venueData.latitude,
        longitude: venueData.longitude
      }
    });

    toast.success('Tournament created with selected venue map location!');
    setShowCreateModal(false);
    fetchTournaments();
  };

  const submitUpdate = async (id: string) => {
    const baseSettings = editingTournament?.settings || {};
    const basePaymentConfig = editingTournament?.payment_config || {};

    await api.put(`/tournaments/${id}`, {
      name,
      location: venueData.venueName || location,
      district: venueData.district || district,
      banner: bannerUrl || undefined,
      format,
      max_teams: Number(maxTeams),
      ground_fee: Number(groundFee),
      payment_config: {
        ...basePaymentConfig,
        allow_partial: allowPartial,
        // Teams pay in full or in halves.
        min_partial_type: 'percentage',
        min_partial_value: 50,
        enabled_methods: enabledMethods
      },
      prize_money: Number(prizeMoney),
      settings: {
        ...baseSettings,
        football_format: footballFormat,
        cricket_format: cricketFormat,
        total_overs: Number(totalOvers),
        squad_min_players: sportCode === 'football' ? (footballFormat === '5-a-side' ? 5 : 7) : 11,
        squad_max_players: sportCode === 'football' ? 14 : 16,
        venue_name: venueData.venueName,
        venue_address: venueData.address,
        google_maps_url: venueData.googleMapsUrl,
        latitude: venueData.latitude,
        longitude: venueData.longitude
      }
    });

    toast.success('Tournament updated successfully!');
    setShowCreateModal(false);
    setEditingId(null);
    setEditingTournament(null);
    fetchTournaments();
  };

  const openCreateModal = () => {
    setEditingId(null);
    setEditingTournament(null);
    setShowCreateModal(true);
  };

  const openEditModal = (t: any) => {
    const settings = t.settings || {};
    const paymentConfig = t.payment_config || {};

    setEditingId(t.id);
    setEditingTournament(t);
    setName(t.name || '');
    setSportCode(t.sport_code);
    setLocation(t.location || '');
    setDistrict(t.district || '');
    setFormat(t.format || 'league_knockout');
    setMaxTeams(Number(t.max_teams) || 8);
    setGroundFee(Number(t.ground_fee) || 0);
    setAllowPartial(paymentConfig.allow_partial !== false);
    setEnabledMethods(paymentConfig.enabled_methods?.length ? paymentConfig.enabled_methods : ALL_PAYMENT_METHODS);
    setPrizeMoney(Number(t.prize_money) || 0);
    setFootballFormat(settings.football_format || '7-a-side');
    setCricketFormat(settings.cricket_format || 'T20');
    setTotalOvers(Number(settings.total_overs) || 20);
    setBannerUrl(t.banner || '');
    setVenueData({
      venueName: settings.venue_name || t.location || '',
      address: settings.venue_address || '',
      district: t.district || '',
      state: t.state || 'Kerala',
      latitude: settings.latitude ?? 11.1271,
      longitude: settings.longitude ?? 76.1311,
      googleMapsUrl: settings.google_maps_url || ''
    });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingId(null);
    setEditingTournament(null);
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enabledMethods.length === 0) {
      toast.warning('Select at least one accepted payment method.');
      return;
    }
    if (sportCode === 'cricket' && !(Number(totalOvers) >= 1)) {
      toast.warning('Enter how many overs each innings has.');
      return;
    }
    if (planTeamLimit && Number(maxTeams) > planTeamLimit) {
      toast.warning(`Your plan allows up to ${planTeamLimit} teams per tournament. Upgrade your plan for more.`);
      return;
    }
    try {
      if (editingId) {
        await submitUpdate(editingId);
      } else {
        await submitTournament();
      }
    } catch (err: any) {
      // No active subscription (or a plan limit) blocked creation — send the
      // organizer to pick a plan instead of just failing the request.
      if (!editingId && err instanceof ApiError && err.status === 403 && err.data?.limit) {
        setShowPlanPicker(true);
        return;
      }
      toast.error(err.message || (editingId ? 'Failed to update tournament.' : 'Failed to create tournament. Plan limit may have been reached.'));
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
          <h1 className="text-2xl sm:text-3xl font-black font-heading text-white tracking-tight">Organization Tournaments</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Host football and cricket tournaments with direct team registration</p>
        </div>
        <button
          onClick={openCreateModal}
          className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Tournament</span>
        </button>
      </div>

      {/* Tournaments Grid */}
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
        {tournaments.map(t => {
          const isFb = t.sport_code === 'football';
          const regToken: string = t.registration_link_token ?? '';
          const hasAuctionEnabled = FEATURE_AUCTION_ENABLED && Boolean(t.has_auction);
          const isCancelled = t.status === 'cancelled';

          return (
            <div key={t.id} className={`p-4 sm:p-6 rounded-3xl glass-card border border-slate-800 flex flex-col justify-between min-w-0 hover:border-slate-700 transition-all ${isCancelled ? 'opacity-70' : ''}`}>
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                      isFb ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {isFb ? '⚽' : '🏏'} {tournamentGame(t)} • {label(t.format)}
                    </span>

                    {!isCancelled && t.stage && (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold uppercase tracking-wider">
                        {label(t.stage)}
                      </span>
                    )}

                    {isCancelled && (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black uppercase tracking-wider">
                        Cancelled
                      </span>
                    )}

                    {hasAuctionEnabled ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black uppercase tracking-wider flex items-center gap-1">
                        <Gavel className="w-3 h-3" />
                        <span>Auction: {label(t.auction_status || 'upcoming')}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                        Direct Team Registration
                      </span>
                    )}
                  </div>

                  <span className="shrink-0 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono font-bold text-emerald-400 whitespace-nowrap">{formatMoney(t.ground_fee)}</span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-white font-heading leading-snug">{t.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{t.location || t.district}</p>

                {/* Registration Link Box */}
                <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-300">
                      {hasAuctionEnabled ? 'Direct Team Entry Link' : 'Public Team Registration Link'}
                    </span>
                    <span className="shrink-0 text-xs text-emerald-400 font-bold">{t.teams_count ?? 0}/{t.max_teams} Teams</span>
                  </div>
                  {regToken ? (
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <input
                      type="text"
                      readOnly
                      aria-label={hasAuctionEnabled ? 'Direct team entry link' : 'Public team registration link'}
                      value={`${window.location.origin}/register/team/${regToken}`}
                      className="flex-1 min-w-0 basis-full sm:basis-auto px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-code text-slate-300 truncate"
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
                    <button
                      onClick={() => setQrTournament(t)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>QR</span>
                    </button>
                  </div>
                  ) : (
                    <p className="text-xs text-slate-500">No registration link for this tournament.</p>
                  )}
                </div>
              </div>

              <div className="mt-5 sm:mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-start sm:justify-end gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(t)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    disabled={generatingPosterId === t.id}
                    onClick={() => {
                      if (!t.poster) {
                        handleGeneratePoster(t);
                        return;
                      }
                      // Reopening an existing poster: nothing tells us which
                      // design it was drawn with, so don't claim one.
                      setPosterDesign(null);
                      setPosterTournament(t);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 font-bold flex items-center gap-1 transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    {generatingPosterId === t.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{t.poster ? 'View Poster' : 'Generate Poster'}</span>
                  </button>

                  {hasAuctionEnabled && (
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
                  )}

                  <Link
                    to={`/organization/tournaments/${t.id}/teams`}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold"
                  >
                    Teams
                  </Link>

                  <Link
                    to={`/organization/tournaments/${t.id}/fixtures`}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-semibold"
                  >
                    Fixtures →
                  </Link>

                  {!isCancelled && t.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => handleCancelTournament(t)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
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
              <h3 className="text-base font-bold text-white font-heading">
                {editingId ? 'Edit Tournament' : 'Create New Tournament'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tournament Name *</label>
                <input aria-label="Tournament Name"
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
                  <select aria-label="Sport Type"
                    value={sportCode}
                    onChange={(e) => setSportCode(e.target.value as any)}
                    disabled={!!editingId}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-emerald-400 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {enabledSports.map(sport => (
                      <option key={sport.code} value={sport.code}>{sport.icon} {sport.name}</option>
                    ))}
                    {editingId && !enabledSports.some(s => s.code === sportCode) && (
                      <option value={sportCode}>{sportCode}</option>
                    )}
                  </select>
                  {editingId && (
                    <p className="text-xs text-slate-500 mt-1">Sport type can't be changed after creation.</p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tournament Format</label>
                  <select aria-label="Tournament Format"
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

              {/* INTERACTIVE VENUE & LOCATION MAP SELECTOR */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-white uppercase text-xs block">
                        Venue & Stadium Map Location *
                      </span>
                      <span className="text-xs text-emerald-400 font-semibold">
                        {venueData.venueName}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowMapModal(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Select on Map 🗺️</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="truncate text-slate-400 pr-2">
                    <span className="text-slate-500 font-bold">Address: </span>
                    <span className="text-slate-300 font-medium">{venueData.address}</span>
                  </div>
                  <a
                    href={venueData.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 font-bold shrink-0 hover:underline"
                  >
                    Maps Link ↗
                  </a>
                </div>
              </div>

              {/* TOURNAMENT BANNER UPLOAD */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-white uppercase text-xs block">
                        Tournament Banner / Poster
                      </span>
                      <span className="text-xs text-slate-400">
                        {bannerUrl ? 'Custom banner selected' : 'Default sports theme banner active'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowBannerModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Upload Banner</span>
                  </button>
                </div>

                {bannerUrl && (
                  <div className="relative h-24 rounded-xl overflow-hidden border border-slate-800">
                    <img src={bannerUrl} alt="Tournament Banner Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setBannerUrl('')}
                      className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/70 text-slate-300 hover:text-white text-xs font-bold"
                    >
                      ✕ Remove
                    </button>
                  </div>
                )}
              </div>

              {/* AUCTION SELECTION TOGGLE (hidden while the auction feature is unreleased, and
                  when editing — auction setup is managed from "Manage Auction" instead) */}
              {FEATURE_AUCTION_ENABLED && !editingId && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white uppercase text-xs flex items-center gap-1.5">
                        <Gavel className="w-3.5 h-3.5 text-amber-400" />
                        <span>Player Auction System (Optional)</span>
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
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
                        <label className="block text-slate-400 text-xs uppercase font-bold mb-1">Auction Date & Time</label>
                        <input aria-label="Auction Date & Time"
                          type="datetime-local"
                          value={auctionStartTime}
                          onChange={(e) => setAuctionStartTime(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 text-xs uppercase font-bold mb-1">Team Purse (₹)</label>
                        <NumberInput aria-label="Team Purse (₹)"
                          value={teamPurse}
                          onValueChange={setTeamPurse}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 font-mono font-bold text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 text-xs uppercase font-bold mb-1">Min Bid Inc (₹)</label>
                        <NumberInput aria-label="Min Bid Inc (₹)"
                          value={minBidIncrement}
                          onValueChange={setMinBidIncrement}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 font-mono font-bold text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sportCode === 'football' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Football Format</label>
                    <select aria-label="Football Format"
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
                    <NumberInput aria-label="Max Teams"
                      min="2"
                      max={planTeamLimit ?? undefined}
                      value={maxTeams}
                      onValueChange={handleMaxTeamsChange}
                      className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                    />
                    {planTeamLimit && (
                      <p className="text-xs text-slate-500 mt-1">Plan allows up to {planTeamLimit} teams.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Cricket Format</label>
                    <select aria-label="Cricket Format"
                      value={CRICKET_FORMATS.some(f => f.value === cricketFormat) ? cricketFormat : CUSTOM_FORMAT}
                      onChange={(e) => {
                        const preset = CRICKET_FORMATS.find(f => f.value === e.target.value);
                        if (preset) {
                          setCricketFormat(preset.value);
                          setTotalOvers(preset.overs);
                        } else {
                          // Any other length: keep the overs and let them be typed in.
                          setCricketFormat(`${totalOvers} overs`);
                          document.getElementById('tournament-total-overs')?.focus();
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                    >
                      {CRICKET_FORMATS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                      <option value={CUSTOM_FORMAT}>
                        {CRICKET_FORMATS.some(f => f.value === cricketFormat) ? 'Custom (any overs)' : `Custom (${totalOvers || '?'} Overs)`}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Total Overs</label>
                    <NumberInput aria-label="Total Overs"
                      id="tournament-total-overs"
                      min="1"
                      max="50"
                      value={totalOvers}
                      onValueChange={(overs) => {
                        setTotalOvers(overs);
                        setCricketFormat(cricketFormatFor(overs));
                      }}
                      className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">Any length from 1 to 50 overs.</p>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Max Teams</label>
                    <NumberInput aria-label="Max Teams"
                      min="2"
                      max={planTeamLimit ?? undefined}
                      value={maxTeams}
                      onValueChange={handleMaxTeamsChange}
                      className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                    />
                    {planTeamLimit && (
                      <p className="text-xs text-slate-500 mt-1">Plan allows up to {planTeamLimit} teams.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Ground Fee & Payment Options Configuration */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white uppercase text-xs">Ground Fee & Team Payment Config</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Total Ground Fee (₹)</label>
                    <NumberInput aria-label="Total Ground Fee (₹)"
                      min="0"
                      value={groundFee}
                      onValueChange={setGroundFee}
                      className="w-full px-3 py-1.5 rounded-xl glass-input font-mono font-bold text-emerald-400"
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
                  <span>Let teams pay half the ground fee now and half later</span>
                </label>

                <div className="pt-3 border-t border-slate-800/80">
                  <span className="block text-slate-300 font-semibold text-xs">
                    Payment Methods Shown to Teams (at least one required)
                  </span>
                  <span className="block text-slate-500 text-xs mb-2">
                    Teams registering for this tournament only see the methods you tick. Options your platform admin has switched off aren't listed.
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_PAYMENT_METHODS
                      .filter(id => enabledPaymentMethods.includes(id) || enabledMethods.includes(id))
                      .map(id => ({ id, ...PAYMENT_METHOD_META[id] }))
                      .map(m => {
                      const isChecked = enabledMethods.includes(m.id);
                      const Icon = m.icon;
                      return (
                        <label
                          key={m.id}
                          className={`px-2.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${
                            isChecked
                              ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setEnabledMethods(prev =>
                              isChecked ? prev.filter(x => x !== m.id) : [...prev, m.id]
                            )}
                            className="sr-only"
                          />
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-left">
                            <span className="block">{m.label}</span>
                            <span className="block font-normal text-xs text-slate-500">{m.blurb}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Prize Money Pool (₹)</label>
                <NumberInput aria-label="Prize Money Pool (₹)"
                  min="0"
                  value={prizeMoney}
                  onValueChange={setPrizeMoney}
                  className="w-full px-3.5 py-2 rounded-xl glass-input font-mono font-bold text-emerald-400"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold"
                >
                  {editingId ? 'Save Changes' : 'Launch Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Map Location Picker Modal */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">Pick Tournament Venue from Map</h3>
                  <p className="text-xs text-slate-400">Search any stadium, pick famous ground presets, or select coordinates</p>
                </div>
              </div>
              <button onClick={() => setShowMapModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <MapLocationPicker
                initialLocation={venueData}
                onSelectLocation={(selectedLoc) => {
                  setVenueData(selectedLoc);
                  setLocation(selectedLoc.venueName);
                  setDistrict(selectedLoc.district);
                  setShowMapModal(false);
                  toast.success(`Selected venue: ${selectedLoc.venueName}`);
                }}
                onClose={() => setShowMapModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tournament Banner / Poster Upload Modal */}
      <ImageUploadModal
        isOpen={showBannerModal}
        onClose={() => setShowBannerModal(false)}
        title="Upload Tournament Banner / Poster"
        subtitle="Upload a custom poster or choose a sports banner"
        folder="tournaments"
        aspectRatio="banner"
        onSuccess={(url) => {
          setBannerUrl(url);
          toast.success('Tournament banner selected!');
        }}
      />

      {qrTournament && (
        <RegistrationQrModal
          tournamentName={qrTournament.name}
          url={`${window.location.origin}/register/team/${qrTournament.registration_link_token}`}
          fileSlug={qrTournament.slug}
          onClose={() => setQrTournament(null)}
        />
      )}

      {/* Generated Poster Preview Modal */}
      {posterTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-400" />
                <span>Tournament Poster</span>
              </h3>
              <button onClick={() => setPosterTournament(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="relative rounded-2xl overflow-hidden border border-slate-800">
                <img
                  src={posterTournament.poster}
                  alt={`${posterTournament.name} poster`}
                  className={`w-full h-auto block transition-opacity ${
                    generatingPosterId === posterTournament.id ? 'opacity-30' : 'opacity-100'
                  }`}
                />
                {generatingPosterId === posterTournament.id && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/40">
                    <SportsLoader />
                    <span className="text-xs font-bold text-fuchsia-100">Designing…</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Design</p>
                <div className="grid grid-cols-2 gap-2">
                  {POSTER_TEMPLATES.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={generatingPosterId === posterTournament.id}
                      onClick={() => {
                        setPosterTemplate(opt.id);
                        handleGeneratePoster(posterTournament, opt.id);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-60 disabled:cursor-wait ${
                        posterTemplate === opt.id
                          ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-200'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {posterDesignLabel
                    ? `Showing the ${posterDesignLabel} design. Regenerate redraws it in a new colour scheme.`
                    : 'Pick a design to redraw this poster.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={posterTournament.poster}
                  download={`${posterTournament.slug || 'tournament'}-poster.${String(posterTournament.poster).split('?')[0].split('.').pop() || 'png'}`}
                  className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  disabled={generatingPosterId === posterTournament.id}
                  onClick={() => handleGeneratePoster(posterTournament)}
                  className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
                >
                  {generatingPosterId === posterTournament.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{generatingPosterId === posterTournament.id ? 'Designing…' : 'Regenerate'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Paywall — shown when tournament creation is blocked by billing */}
      {showPlanPicker && organization && (
        <PlanPickerModal
          organizationId={organization.id}
          title="Choose a Plan to Continue"
          subtitle="You need an active plan to host a tournament. Pick one to activate it now."
          onClose={() => setShowPlanPicker(false)}
          onSubscribed={async () => {
            setShowPlanPicker(false);
            try {
              await submitTournament();
            } catch (err: any) {
              toast.error(err.message || 'Failed to create tournament after activating the plan.');
            }
          }}
        />
      )}
    </div>
  );
};
