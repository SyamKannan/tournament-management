import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type { Sponsor, Advertisement, Match } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Skeleton, SkeletonStats } from '../../components/ui/Feedback';
import { 
  Megaphone, Plus, Award, Tv, Play, Square, 
  Trash2, ExternalLink, Image as ToggleLeft, ToggleRight, Check,
  Zap
} from 'lucide-react';

export const OrgSponsorsAdsPage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { organization } = useAuth();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [adLimit, setAdLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'scoreboard_config' | 'ads' | 'sponsors'>('scoreboard_config');

  // Selected match for broadcast controls
  const [selectedMatchId, setSelectedMatchId] = useState<string>('match-fb-live-1');

  // Scoreboard Live Configuration Controls
  const [liveTickerEnabled, setLiveTickerEnabled] = useState<boolean>(true);
  const [tickerIntervalSeconds, setTickerIntervalSeconds] = useState<number>(10);
  const [goalPopupEnabled, setGoalPopupEnabled] = useState<boolean>(true);

  // Break-Time Takeover Controller state
  const [isBreakActive, setIsBreakActive] = useState<boolean>(false);
  const [breakTitle, setBreakTitle] = useState<string>('HALF-TIME BREAK');
  const [countdownMinutes, setCountdownMinutes] = useState<number>(10);

  // New Ad Modal & Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [adTitle, setAdTitle] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [displayPlacement, setDisplayPlacement] = useState<'all' | 'ticker_banner' | 'break_screen' | 'goal_popup'>('all');
  const [mediaUrl, setMediaUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sponRes, adsRes, tourneysRes] = await Promise.all([
        api.get('/sponsors'),
        api.get('/sponsors/ads'),
        api.get('/tournaments')
      ]);
      setSponsors(sponRes);
      setAds(adsRes);

      if (tourneysRes.length > 0) {
        const matchesRes = await api.get(`/matches/tournament/${tourneysRes[0].id}`);
        setMatches(matchesRes);
        if (matchesRes.length > 0) setSelectedMatchId(matchesRes[0].id);
      }
    } catch (err) {
      console.error('Failed to load sponsors & ads', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!organization) return;
    api.get(`/organizations/${organization.id}/usage`)
      .then(res => setAdLimit(res?.plan?.ad_limit ?? null))
      .catch(err => console.error('Failed to load plan limits', err));
  }, [organization]);

  const adLimitReached = adLimit !== null && ads.length >= adLimit;

  const handleUpdateScoreboardSettings = async () => {
    try {
      await api.post('/sponsors/ads/control/settings', {
        match_id: selectedMatchId,
        live_ticker_enabled: liveTickerEnabled,
        ticker_interval_seconds: tickerIntervalSeconds,
        goal_popup_enabled: goalPopupEnabled
      });
      toast.success('Scoreboard advertisement settings updated & broadcasted in real-time!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update settings');
    }
  };

  const handleTriggerBreak = async (action: 'start' | 'stop') => {
    try {
      await api.post('/sponsors/ads/control/break-mode', {
        match_id: selectedMatchId,
        action,
        break_title: breakTitle,
        countdown_seconds: countdownMinutes * 60
      });
      setIsBreakActive(action === 'start');
      toast.success(`Scoreboard break commercial ${action === 'start' ? 'STARTED' : 'STOPPED'}!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to control break mode');
    }
  };

  const handlePushInstantAd = async (ad: Advertisement) => {
    try {
      await api.post('/sponsors/ads/control/push-popup', {
        match_id: selectedMatchId,
        ad_id: ad.id,
        custom_title: `FEATURED SPONSOR • ${ad.business_name.toUpperCase()}`,
        duration_seconds: 8
      });
      toast.success(`Pushed [${ad.business_name}] live pop-up to stadium scoreboard!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to push instant ad');
    }
  };

  const handleDeleteAd = async (id: string) => {
    const proceed = await confirm({
      title: 'Delete this advertisement?',
      message: 'It will stop appearing on scoreboards immediately. This cannot be undone.',
      confirmLabel: 'Delete advertisement',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      await api.delete(`/sponsors/ads/${id}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete advertisement');
    }
  };

  const handleSampleFill = (sampleType: 'retail' | 'fitness' | 'tech') => {
    if (sampleType === 'retail') {
      setBusinessName('Malabar Gold & Diamonds');
      setAdTitle('Festive Gold Festival • 0% Making Charge');
      setMediaUrl('https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&auto=format&fit=crop&q=80');
      setPhone('+91 98471 22334');
      setWebsite('https://malabargoldanddiamonds.com');
      setDescription('Exclusive 20% off on diamond jewellery for tournament attendees.');
    } else if (sampleType === 'fitness') {
      setBusinessName('PowerFit Arena Nilambur');
      setAdTitle('Annual Gym Membership Pass');
      setMediaUrl('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80');
      setPhone('+91 94470 99887');
      setWebsite('https://powerfitarena.com');
      setDescription('Train with international level coaches. Special 30% club discount.');
    } else {
      setBusinessName('Grand Hypermarket & Mall');
      setAdTitle('Fresh Fruits & Sports Nutrition Carnival');
      setMediaUrl('https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80');
      setPhone('+91 98950 11223');
      setWebsite('https://grandhypermarket.in');
      setDescription('Free home delivery across Malappuram district.');
    }
  };

  const openAddAdModal = () => {
    if (adLimitReached) {
      toast.warning(`Your plan allows up to ${adLimit} sponsor ads. Upgrade your plan to add more.`);
      return;
    }
    setShowAddModal(true);
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/sponsors/ads', {
        title: adTitle,
        business_name: businessName,
        display_placement: displayPlacement,
        media_url: mediaUrl,
        phone,
        website,
        description,
        duration_seconds: durationSeconds,
        priority: 10
      });
      setShowAddModal(false);
      // Reset form
      setAdTitle('');
      setBusinessName('');
      setMediaUrl('');
      setPhone('');
      setWebsite('');
      setDescription('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add advertisement');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonStats count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black font-heading text-white tracking-tight">
            Tournament Scoreboard Advertisements & Sponsors
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure when and how sponsor banners, goal pop-ups, and full-screen commercial breaks appear on stadium scoreboards
          </p>
        </div>

        <div className="flex items-center gap-2">
          {adLimit !== null && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-slate-300">
              {ads.length}/{adLimit} ads
            </span>
          )}
          <button
            onClick={openAddAdModal}
            disabled={adLimitReached}
            title={adLimitReached ? `Your plan allows up to ${adLimit} sponsor ads.` : undefined}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Sponsor Ad</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800 text-xs font-bold w-fit">
        <button
          onClick={() => setActiveTab('scoreboard_config')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'scoreboard_config' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Tv className="w-4 h-4 text-cyan-400" />
          <span>Scoreboard Display Triggers & Timing</span>
        </button>

        <button
          onClick={() => setActiveTab('ads')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'ads' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Megaphone className="w-4 h-4 text-amber-400" />
          <span>Organizer Ads ({ads.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sponsors')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'sponsors' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4 text-emerald-400" />
          <span>Sponsors Directory ({sponsors.length})</span>
        </button>
      </div>

      {/* TAB 1: SCOREBOARD DISPLAY TIMING & TRIGGERS */}
      {activeTab === 'scoreboard_config' && (
        <div className="space-y-6">
          {/* Real-Time Display Timing Config Card */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-cyan-400">Main Scoreboard Configuration</span>
                <h2 className="text-lg font-bold text-white font-heading mt-0.5">When & How Ads Appear on Screen</h2>
                <p className="text-xs text-slate-400">Control live banner rotation intervals and event triggers</p>
              </div>

              <a
                href={`/scoreboard/match/${selectedMatchId}`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors w-fit"
              >
                <Tv className="w-3.5 h-3.5 text-emerald-400" />
                <span>Open Live 16:9 Scoreboard ↗</span>
              </a>
            </div>

            <div className="grid sm:grid-cols-3 gap-5">
              {/* Feature 1: Live Ticker Banner */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Live Gameplay Sponsor Banner</span>
                    <button
                      onClick={() => setLiveTickerEnabled(!liveTickerEnabled)}
                      className="text-cyan-400"
                    >
                      {liveTickerEnabled ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-slate-600" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Displays rotating sponsor banners beneath the score core during active match play.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-bold text-slate-300">
                  Status: <span className={liveTickerEnabled ? 'text-emerald-400' : 'text-slate-500'}>{liveTickerEnabled ? 'Enabled 🟢' : 'Disabled ⚪'}</span>
                </div>
              </div>

              {/* Feature 2: Ticker Rotation Speed */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                <div>
                  <label className="block text-xs font-bold text-white mb-2">Banner Rotation Interval</label>
                  <select
                    value={tickerIntervalSeconds}
                    onChange={(e) => setTickerIntervalSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-bold outline-none"
                  >
                    <option value={5}>Every 5 Seconds (Fast)</option>
                    <option value={10}>Every 10 Seconds (Recommended)</option>
                    <option value={15}>Every 15 Seconds</option>
                    <option value={30}>Every 30 Seconds</option>
                    <option value={60}>Every 1 Minute</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    How long each organizer advertisement stays on screen before rotating to the next.
                  </p>
                </div>
              </div>

              {/* Feature 3: Goal / Event Popups */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Goal & Event Sponsor Pop-Ups</span>
                    <button
                      onClick={() => setGoalPopupEnabled(!goalPopupEnabled)}
                      className="text-cyan-400"
                    >
                      {goalPopupEnabled ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-slate-600" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Pops up an animated sponsor badge whenever a Goal or Wicket is recorded by the scorer.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-bold text-slate-300">
                  Status: <span className={goalPopupEnabled ? 'text-emerald-400' : 'text-slate-500'}>{goalPopupEnabled ? 'Enabled 🟢' : 'Disabled ⚪'}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleUpdateScoreboardSettings}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20 flex items-center gap-1.5 transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Save & Broadcast Settings to Scoreboard</span>
              </button>
            </div>
          </div>

          {/* Full-Screen Break Controller (Half-time / Innings Break) */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-5">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">Match Break Takeover</span>
              <h3 className="text-base font-bold text-white font-heading mt-0.5">Full-Screen Commercial Break with Countdown</h3>
              <p className="text-xs text-slate-400">Take over the scoreboard during Half-Time or Drinks Break to display full-screen sponsor commercials</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Target Match</label>
                <select
                  value={selectedMatchId}
                  onChange={(e) => setSelectedMatchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                >
                  {matches.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.team_a?.name || m.team_a_id} vs {m.team_b?.name || m.team_b_id} ({m.round_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Break Title Display</label>
                <input
                  type="text"
                  value={breakTitle}
                  onChange={(e) => setBreakTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Countdown Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="45"
                  value={countdownMinutes}
                  onChange={(e) => setCountdownMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center font-bold outline-none"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isBreakActive ? 'bg-amber-400 animate-ping' : 'bg-slate-600'}`} />
                  <span>Break Broadcast Status: {isBreakActive ? 'FULL-SCREEN ADS BROADCASTING ON TV 🟢' : 'NORMAL SCOREBOARD MODE ⚪'}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Rotating {ads.length} active organizer sponsor advertisements with a {countdownMinutes}m countdown clock.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => handleTriggerBreak('start')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>START BREAK ADS ON SCOREBOARD</span>
                </button>

                <button
                  onClick={() => handleTriggerBreak('stop')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 text-rose-400" />
                  <span>RESUME MATCH</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORGANIZER ADVERTISEMENT CARDS */}
      {activeTab === 'ads' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Active organizer ads configured to rotate across the live scoreboard and break takeovers
            </p>
            <button
              onClick={openAddAdModal}
              disabled={adLimitReached}
              title={adLimitReached ? `Your plan allows up to ${adLimit} sponsor ads.` : undefined}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Advertisement</span>
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {ads.map(ad => (
              <div key={ad.id} className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden flex flex-col justify-between shadow-sm group hover:border-slate-700 transition-all">
                <div className="relative h-44 bg-slate-950 overflow-hidden">
                  <img src={ad.media_url} alt={ad.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-[11px] font-mono text-cyan-400 font-bold border border-slate-700/60">
                    {ad.duration_seconds}s
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-[11px] font-bold text-amber-400 border border-slate-700/60 uppercase">
                    {ad.display_placement === 'all' ? 'All Placements' : ad.display_placement === 'ticker_banner' ? 'Live Banner' : 'Break Screen'}
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm font-heading">{ad.business_name}</h4>
                    <div className="text-xs font-semibold text-cyan-400 mt-0.5">{ad.title}</div>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed line-clamp-2">{ad.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => handlePushInstantAd(ad)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
                      title="Trigger 8s pop-up on live scoreboard"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Push Pop-up</span>
                    </button>

                    <button
                      onClick={() => handleDeleteAd(ad.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete ad"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SPONSORS DIRECTORY */}
      {activeTab === 'sponsors' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {sponsors.map(sp => (
            <div key={sp.id} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center flex flex-col justify-between">
              <div>
                <img src={sp.logo} alt={sp.name} className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border border-slate-700 shadow-md" />
                <div className="font-bold text-white text-xs font-heading">{sp.name}</div>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[11px] font-bold uppercase mt-1 inline-block border border-amber-500/20">
                  {sp.tier} Partner
                </span>
                <p className="text-[11px] text-slate-400 mt-2 leading-tight">{sp.description}</p>
              </div>

              {sp.website && (
                <a
                  href={sp.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center justify-center gap-1"
                >
                  <span>Visit Website</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add New Sponsor Ad Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-7 my-8">
            <h3 className="text-base font-bold text-white font-heading mb-1">
              Add Scoreboard Sponsor Advertisement
            </h3>
            <p className="text-xs text-slate-400 mb-4 pb-2 border-b border-slate-800">
              Configure banner visuals, sponsor business info, and where it displays on the live scoreboard
            </p>

            {/* Sample Quick-Fills */}
            <div className="mb-4 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1.5">1-Click Sample Pre-sets:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSampleFill('retail')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] font-bold text-amber-400 border border-slate-800 transition-colors"
                >
                  💎 Gold & Jewellery
                </button>
                <button
                  type="button"
                  onClick={() => handleSampleFill('fitness')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] font-bold text-cyan-400 border border-slate-800 transition-colors"
                >
                  🏋️ Gym & Fitness
                </button>
                <button
                  type="button"
                  onClick={() => handleSampleFill('tech')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] font-bold text-emerald-400 border border-slate-800 transition-colors"
                >
                  🛒 Hypermarket Mall
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateAd} className="space-y-3 text-xs">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Business / Brand Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Malabar Gold & Diamonds"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Ad Headline / Tagline *</label>
                  <input
                    type="text"
                    placeholder="e.g. Special Festive Gold Offer"
                    value={adTitle}
                    onChange={(e) => setAdTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Banner Image URL *</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Scoreboard Placement</label>
                  <select
                    value={displayPlacement}
                    onChange={(e: any) => setDisplayPlacement(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  >
                    <option value="all">All Modes (Banner + Break + Popups)</option>
                    <option value="ticker_banner">Live Gameplay Banner Ticker</option>
                    <option value="break_screen">Full-Screen Break Takeover</option>
                    <option value="goal_popup">Goal / Event Pop-up Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Display Duration (Sec)</label>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center outline-none"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="+91 98471 22334"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Website URL</label>
                  <input
                    type="text"
                    placeholder="https://brand.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Promo Description Text</label>
                <input
                  type="text"
                  placeholder="Special 20% discount for tournament fans & players"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2.5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
                >
                  {isSubmitting ? 'Saving...' : 'Save & Publish Ad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
