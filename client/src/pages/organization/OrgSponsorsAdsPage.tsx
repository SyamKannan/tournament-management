import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type { Sponsor, Advertisement, Match } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Feedback';
import { MatchPicker, matchLabel } from '../../components/MatchPicker';
import {
  Megaphone, Plus, Award, Tv, Trash2, ExternalLink, Copy, Clock,
} from 'lucide-react';
import { PhoneInput } from '../../components/PhoneInput';

const DURATION_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60, 120, 300, 600];

const durationLabel = (seconds: number) =>
  seconds === 0 ? 'Hold until switched back' : seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;

/**
 * Ads are made here for one match at a time. They reach the big screen only
 * when someone running that match presses Show in the scorer console.
 */
export const OrgSponsorsAdsPage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { organization } = useAuth();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [adLimit, setAdLimit] = useState<number | null>(null);
  const [adsInOrg, setAdsInOrg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ads' | 'sponsors'>('ads');

  const [match, setMatch] = useState<Match | null>(null);
  const [tournamentMatches, setTournamentMatches] = useState<Match[]>([]);

  // New ad form
  const [showAddModal, setShowAddModal] = useState(false);
  const [adTitle, setAdTitle] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Copy-to-other-matches
  const [copying, setCopying] = useState<Advertisement | null>(null);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);

  const loadAds = useCallback(async () => {
    if (!match) {
      setAds([]);
      return;
    }
    try {
      setAds(await api.get(`/sponsors/ads?matchId=${encodeURIComponent(match.id)}`));
    } catch (err) {
      console.error('Failed to load ads', err);
    }
  }, [match?.id]);

  const loadUsage = useCallback(() => {
    if (!organization) return;
    api.get(`/organizations/${organization.id}/usage`)
      .then(res => {
        setAdLimit(res?.plan?.ad_limit ?? null);
        setAdsInOrg(res?.usage?.ads?.current ?? 0);
      })
      .catch(err => console.error('Failed to load plan limits', err));
  }, [organization]);

  useEffect(() => {
    api.get('/sponsors')
      .then(setSponsors)
      .catch(err => console.error('Failed to load sponsors', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAds(); }, [loadAds]);
  useEffect(() => { loadUsage(); }, [loadUsage]);

  const adLimitReached = adLimit !== null && adsInOrg >= adLimit;

  const handleDeleteAd = async (id: string) => {
    const proceed = await confirm({
      title: 'Delete this advertisement?',
      message: 'If it is on the big screen right now it comes off immediately. This cannot be undone.',
      confirmLabel: 'Delete advertisement',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      await api.delete(`/sponsors/ads/${id}`);
      loadAds();
      loadUsage();
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
    if (!match) return;
    setIsSubmitting(true);
    try {
      await api.post('/sponsors/ads', {
        match_id: match.id,
        title: adTitle,
        business_name: businessName,
        media_url: mediaUrl,
        phone,
        website,
        description,
        duration_seconds: durationSeconds,
        priority: 10
      });
      setShowAddModal(false);
      setAdTitle('');
      setBusinessName('');
      setMediaUrl('');
      setPhone('');
      setWebsite('');
      setDescription('');
      loadAds();
      loadUsage();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add advertisement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!copying || copyTargets.length === 0) return;
    try {
      await api.post(`/sponsors/ads/${copying.id}/copy`, { match_ids: copyTargets });
      toast.success(`Copied to ${copyTargets.length} match${copyTargets.length === 1 ? '' : 'es'}`);
      setCopying(null);
      setCopyTargets([]);
      loadUsage();
    } catch (err: any) {
      toast.error(err.message || 'Failed to copy the ad');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const otherMatches = tournamentMatches.filter(m => m.id !== match?.id);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black font-heading text-white tracking-tight">
            Match Ads & Sponsors
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Make ads for a match here, then show them full screen from that match's Big Screen Director
          </p>
        </div>

        <div className="flex items-center gap-2">
          {adLimit !== null && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-slate-300">
              {adsInOrg}/{adLimit} ads
            </span>
          )}
          <button
            onClick={openAddAdModal}
            disabled={adLimitReached || !match}
            title={adLimitReached ? `Your plan allows up to ${adLimit} sponsor ads.` : undefined}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Ad to Match</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800 text-xs font-bold w-fit max-w-full overflow-x-auto">
        <button
          onClick={() => setActiveTab('ads')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'ads' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Megaphone className="w-4 h-4 text-amber-400" />
          <span>Match Ads</span>
        </button>

        <button
          onClick={() => setActiveTab('sponsors')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'sponsors' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4 text-emerald-400" />
          <span>Sponsors Directory ({sponsors.length})</span>
        </button>
      </div>

      {activeTab === 'ads' && (
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <MatchPicker onChange={(next, list) => { setMatch(next); setTournamentMatches(list); }} />

            {match && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <p className="text-xs text-slate-400">
                  {ads.length} ad{ads.length === 1 ? '' : 's'} for this match. Show them from the scorer console's Big Screen tab.
                </p>
                <Link
                  to={`/organization/scorer/${match.id}`}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors w-fit"
                >
                  <Tv className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Open Big Screen Director</span>
                </Link>
              </div>
            )}
          </div>

          {!match ? (
            <div className="p-8 rounded-3xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
              Pick a match to see and add its ads.
            </div>
          ) : ads.length === 0 ? (
            <div className="p-8 rounded-3xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
              No ads for this match yet.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {ads.map(ad => (
                <div key={ad.id} className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden flex flex-col justify-between shadow-sm group hover:border-slate-700 transition-all">
                  <div className="relative h-44 bg-slate-950 overflow-hidden">
                    <img src={ad.media_url} alt={ad.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-xs font-mono text-cyan-400 font-bold border border-slate-700/60 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {ad.duration_seconds === 0 ? 'Hold' : `${ad.duration_seconds}s`}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm font-heading">{ad.business_name}</h4>
                      <div className="text-xs font-semibold text-cyan-400 mt-0.5">{ad.title}</div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed line-clamp-2">{ad.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <button
                        onClick={() => { setCopying(ad); setCopyTargets([]); }}
                        disabled={otherMatches.length === 0}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-40"
                        title="Copy this ad to other matches"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy to matches</span>
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
          )}
        </div>
      )}

      {/* SPONSORS DIRECTORY */}
      {activeTab === 'sponsors' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {sponsors.map(sp => (
            <div key={sp.id} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center flex flex-col justify-between">
              <div>
                <img src={sp.logo} alt={sp.name} className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border border-slate-700 shadow-md" />
                <div className="font-bold text-white text-xs font-heading">{sp.name}</div>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold uppercase mt-1 inline-block border border-amber-500/20">
                  {sp.tier} Partner
                </span>
                <p className="text-xs text-slate-400 mt-2 leading-tight">{sp.description}</p>
              </div>

              {sp.website && (
                <a
                  href={sp.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center justify-center gap-1"
                >
                  <span>Visit Website</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Copy to other matches */}
      {copying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 my-8 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white font-heading">Copy “{copying.business_name}”</h3>
              <p className="text-xs text-slate-400 mt-1">Each chosen match gets its own copy, with the same on-screen time.</p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCopyTargets(copyTargets.length === otherMatches.length ? [] : otherMatches.map(m => m.id))}
                className="text-xs font-bold text-cyan-400 hover:text-cyan-300"
              >
                {copyTargets.length === otherMatches.length ? 'Clear all' : 'Select all'}
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {otherMatches.map(m => (
                <label key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyTargets.includes(m.id)}
                    onChange={e => setCopyTargets(e.target.checked ? [...copyTargets, m.id] : copyTargets.filter(id => id !== m.id))}
                  />
                  <span className="truncate">{matchLabel(m)}</span>
                </label>
              ))}
            </div>

            <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCopying(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={copyTargets.length === 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-50"
              >
                Copy to {copyTargets.length || ''} match{copyTargets.length === 1 ? '' : 'es'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Ad Modal */}
      {showAddModal && match && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-7 my-8">
            <h3 className="text-base font-bold text-white font-heading mb-1">
              Add Ad to Match
            </h3>
            <p className="text-xs text-slate-400 mb-4 pb-2 border-b border-slate-800">
              {matchLabel(match)}
            </p>

            {/* Sample Quick-Fills */}
            <div className="mb-4 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-bold uppercase text-slate-400 block mb-1.5">1-Click Sample Pre-sets:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSampleFill('retail')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-400 border border-slate-800 transition-colors"
                >
                  💎 Gold & Jewellery
                </button>
                <button
                  type="button"
                  onClick={() => handleSampleFill('fitness')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-cyan-400 border border-slate-800 transition-colors"
                >
                  🏋️ Gym & Fitness
                </button>
                <button
                  type="button"
                  onClick={() => handleSampleFill('tech')}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-emerald-400 border border-slate-800 transition-colors"
                >
                  🛒 Hypermarket Mall
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateAd} className="space-y-3 text-xs">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="orgsponsorsads-business-brand-name" className="block text-slate-300 font-semibold mb-1">Business / Brand Name *</label>
                  <input id="orgsponsorsads-business-brand-name"
                    type="text"
                    placeholder="e.g. Malabar Gold & Diamonds"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="orgsponsorsads-ad-headline-tagline" className="block text-slate-300 font-semibold mb-1">Ad Headline / Tagline *</label>
                  <input id="orgsponsorsads-ad-headline-tagline"
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
                <label htmlFor="orgsponsorsads-ad-image-url" className="block text-slate-300 font-semibold mb-1">Ad Image URL *</label>
                <input id="orgsponsorsads-ad-image-url"
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                />
              </div>

              <div>
                <label htmlFor="orgsponsorsads-time-on-big-screen" className="block text-slate-300 font-semibold mb-1">Time on Big Screen</label>
                <select id="orgsponsorsads-time-on-big-screen"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                >
                  {DURATION_CHOICES.map(seconds => (
                    <option key={seconds} value={seconds}>{durationLabel(seconds)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">You can change this from the Big Screen Director too.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="orgsponsorsads-contact-phone" className="block text-slate-300 font-semibold mb-1">Contact Phone</label>
                  <PhoneInput id="orgsponsorsads-contact-phone"
                    placeholder="98471 22334"
                    value={phone}
                    onChange={setPhone}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="orgsponsorsads-website-url" className="block text-slate-300 font-semibold mb-1">Website URL</label>
                  <input id="orgsponsorsads-website-url"
                    type="text"
                    placeholder="https://brand.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="orgsponsorsads-promo-description-text" className="block text-slate-300 font-semibold mb-1">Promo Description Text</label>
                <input id="orgsponsorsads-promo-description-text"
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
                  {isSubmitting ? 'Saving...' : 'Save Ad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
