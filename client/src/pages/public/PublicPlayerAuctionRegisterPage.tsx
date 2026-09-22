import React, { useState, useEffect, useMemo } from 'react';
import { SportsLoader } from '../../components/ui/SportsLoader';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { SHOW_DEMO_ACCOUNTS } from '../../config';
import type { Auction, Tournament, Organization, AuctionCategory, FootballPosition, CricketRole, CricketBattingStyle, CricketBowlingStyle } from '../../types';
import { Gavel, CheckCircle2, Share2, ArrowRight, Check, Info, RotateCcw } from 'lucide-react';
import { PhoneInput } from '../../components/PhoneInput';
import { FieldError, fieldErrorId, useFieldErrors } from '../../components/ui/FieldError';
import { useDraft, useLeaveWarning } from '../../lib/useDraft';
import { usePreferences } from '../../i18n';

/** Everything typed so far, kept on the device until the player is registered. */
interface Draft {
  fullName: string;
  mobile: string;
  email: string;
  photo: string;
  age: number;
  village: string;
  district: string;
  category: AuctionCategory;
  pastAchievements: string;
  footballPosition: FootballPosition;
  footballFoot: 'left' | 'right' | 'both';
  cricketRole: CricketRole;
  cricketBattingStyle: CricketBattingStyle;
  cricketBowlingStyle: CricketBowlingStyle;
}

const inputClass = 'w-full px-4 py-3 rounded-xl glass-input text-base';
const labelClass = 'block text-sm font-semibold text-slate-200 mb-1.5';

const DEFAULT_PHOTO = {
  football: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80',
  cricket: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80',
};

export const PublicPlayerAuctionRegisterPage: React.FC = () => {
  const { t, money } = usePreferences();
  const { token } = useParams<{ token: string }>();
  const linkToken = token || 'malappuram-7s-auction-2026';
  const fields = useFieldErrors();

  const [data, setData] = useState<{
    auction: Auction;
    tournament: Tournament;
    organization: Organization;
    registered_players_count: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const draft = useDraft<Draft>(`player-auction:${linkToken}`);
  const saved = draft.initial;

  const [fullName, setFullName] = useState(saved?.fullName ?? '');
  const [mobile, setMobile] = useState(saved?.mobile ?? '');
  const [email, setEmail] = useState(saved?.email ?? '');
  const [photo, setPhoto] = useState(saved?.photo ?? '');
  const [age, setAge] = useState<number>(saved?.age ?? 22);
  const [village, setVillage] = useState(saved?.village ?? '');
  const [district, setDistrict] = useState(saved?.district ?? 'Malappuram');
  const [sportCode, setSportCode] = useState<'football' | 'cricket'>('football');
  const [category, setCategory] = useState<AuctionCategory>(saved?.category ?? 'Category B');
  const [pastAchievements, setPastAchievements] = useState(saved?.pastAchievements ?? '');

  const [footballPosition, setFootballPosition] = useState<FootballPosition>(saved?.footballPosition ?? 'Striker');
  const [footballFoot, setFootballFoot] = useState<'left' | 'right' | 'both'>(saved?.footballFoot ?? 'right');

  const [cricketRole, setCricketRole] = useState<CricketRole>(saved?.cricketRole ?? 'All-rounder');
  const [cricketBattingStyle, setCricketBattingStyle] = useState<CricketBattingStyle>(saved?.cricketBattingStyle ?? 'Right Hand');
  const [cricketBowlingStyle, setCricketBowlingStyle] = useState<CricketBowlingStyle>(saved?.cricketBowlingStyle ?? 'Medium Fast');

  useEffect(() => {
    const fetchAuctionInfo = async () => {
      try {
        setIsLoading(true);
        const res = await api.get(`/auctions/public/registration/${linkToken}`);
        setData(res);
        if (res.tournament?.sport_code) setSportCode(res.tournament.sport_code);
      } catch (err: any) {
        setError(err.message || 'Auction registration link not found');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAuctionInfo();
  }, [linkToken]);

  const snapshot: Draft = useMemo(() => ({
    fullName, mobile, email, photo, age, village, district, category, pastAchievements,
    footballPosition, footballFoot, cricketRole, cricketBattingStyle, cricketBowlingStyle,
  }), [fullName, mobile, email, photo, age, village, district, category, pastAchievements,
    footballPosition, footballFoot, cricketRole, cricketBattingStyle, cricketBowlingStyle]);

  const hasTyped = fullName.trim() !== '' || mobile.trim() !== '' || village.trim() !== '';
  const { save: saveDraft, clear: clearDraft } = draft;

  useEffect(() => {
    if (!successData && hasTyped) saveDraft(snapshot);
  }, [snapshot, successData, hasTyped, saveDraft]);

  useLeaveWarning(hasTyped && !successData);

  const handleSampleFill = () => {
    if (sportCode === 'football') {
      setFullName('Nahas K.P.');
      setMobile('+91 98471 66778');
      setEmail('nahas.player@gmail.com');
      setPhoto(DEFAULT_PHOTO.football);
      setAge(23);
      setVillage('Nilambur');
      setDistrict('Malappuram');
      setCategory('Category A');
      setFootballPosition('Left Wing');
      setFootballFoot('left');
      setPastAchievements('Scored 12 goals in district sub-junior league. Fast dribbler and crosser.');
    } else {
      setFullName('Vishnu Das');
      setMobile('+91 94470 55443');
      setEmail('vishnu.player@gmail.com');
      setPhoto(DEFAULT_PHOTO.cricket);
      setAge(24);
      setVillage('Kozhikode Town');
      setDistrict('Kozhikode');
      setCategory('Category A');
      setCricketRole('All-rounder');
      setCricketBattingStyle('Right Hand');
      setCricketBowlingStyle('Medium Fast');
      setPastAchievements('280 runs & 14 wickets in Division 1 championship 2025.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.post(`/auctions/public/registration/${linkToken}`, {
        full_name: fullName,
        mobile,
        email,
        photo: photo || DEFAULT_PHOTO[sportCode],
        age,
        village,
        district,
        sport_code: sportCode,
        category,
        cricket_role: sportCode === 'cricket' ? cricketRole : undefined,
        cricket_batting_style: sportCode === 'cricket' ? cricketBattingStyle : undefined,
        cricket_bowling_style: sportCode === 'cricket' ? cricketBowlingStyle : undefined,
        football_position: sportCode === 'football' ? footballPosition : undefined,
        football_preferred_foot: sportCode === 'football' ? footballFoot : undefined,
        past_achievements: pastAchievements,
      });

      clearDraft();
      setSuccessData(res);
    } catch (err: any) {
      // Field problems are shown under the field; the banner carries the rest.
      fields.capture(err);
      setError(err.message || 'Failed to submit auction registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the address bar still has the link.
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6" role="status">
        <div className="flex flex-col items-center gap-3">
          <SportsLoader size="lg" />
          <span className="text-base font-semibold text-slate-400">{t('pa.loading')}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <h1 className="text-xl font-black font-heading text-rose-400">{t('pa.notFound.title')}</h1>
          <p className="text-base text-slate-400">{error}</p>
          <Link to="/" className="inline-block px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold">
            {t('pa.home')}
          </Link>
        </div>
      </div>
    );
  }

  const { auction, tournament, organization, registered_players_count } = data;
  const isFootball = tournament.sport_code === 'football';
  const activeBasePrice = auction.base_prices?.find(c => c.category === category)?.price || 2500;

  const field = (path: string) => ({
    ...fields.inputProps(path),
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="p-5 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Gavel className="w-6 h-6 text-amber-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">{t('pa.badge')}</span>
                <h1 className="text-xl sm:text-2xl font-black font-heading text-white mt-0.5">{auction.title}</h1>
              </div>
            </div>

            <button
              type="button"
              onClick={copyShareLink}
              className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold inline-flex items-center gap-1.5 border border-slate-700 shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" /> : <Share2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />}
              <span>{copied ? t('pa.copied') : t('pa.share')}</span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <div>
              {t('pa.organizedBy', { org: organization.name })}
              {(tournament.village || tournament.district) && ` · ${[tournament.village, tournament.district].filter(Boolean).join(', ')}`}
            </div>
            <div className="flex items-center gap-4 font-semibold text-slate-300">
              <span className="text-emerald-400">{t('pa.pool', { count: registered_players_count })}</span>
              <span className="text-amber-400">{t('pa.purse', { amount: money(auction.team_purse) })}</span>
            </div>
          </div>
        </div>

        {successData ? (
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-emerald-500/50 shadow-2xl text-center space-y-5" role="status">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
            </div>

            <div>
              <h2 className="text-2xl font-black font-heading text-white">{t('pa.done.title')}</h2>
              <p className="text-base text-slate-300 mt-2 max-w-md mx-auto">{successData.message}</p>
            </div>

            <dl className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-left max-w-md mx-auto text-base space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">{t('pa.done.player')}</dt>
                <dd className="font-bold text-white">{successData.player?.full_name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">{t('pa.done.category')}</dt>
                <dd className="font-bold text-amber-400">{successData.player?.category} ({money(successData.player?.base_price ?? 0)})</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">{t('pa.done.role')}</dt>
                <dd className="font-bold text-white">{successData.player?.football_position || successData.player?.cricket_role}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">{t('pa.done.status')}</dt>
                <dd><span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-sm">{t('pa.done.review')}</span></dd>
              </div>
            </dl>

            <Link
              to={`/auction/${auction.id}`}
              className="inline-flex min-h-12 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-base items-center gap-2"
            >
              <span>{t('pa.done.arena')}</span>
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6" noValidate={false}>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white font-heading">{t('pa.form.title')}</h2>
              {SHOW_DEMO_ACCOUNTS && (
                <button type="button" onClick={handleSampleFill} className="min-h-10 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-sm font-bold border border-slate-700">
                  {t('pa.sample')}
                </button>
              )}
            </div>

            {draft.restored && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
                <p className="flex items-start gap-2 text-base text-cyan-200">
                  <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  {t('draft.restored')}
                </p>
                <button
                  type="button"
                  onClick={() => { clearDraft(); window.location.reload(); }}
                  className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200 inline-flex items-center gap-1.5 shrink-0"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" /> {t('draft.discard')}
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-base font-semibold">
                {error}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pa-name" className={labelClass}>{t('pa.name')} <span className="text-rose-400" aria-hidden="true">*</span></label>
                <input id="pa-name" type="text" autoComplete="name" placeholder="Shameer Babu" value={fullName}
                  onChange={e => { setFullName(e.target.value); fields.clear('full_name'); }} required
                  className={`${inputClass} font-semibold`} {...field('full_name')} />
                <FieldError id={fieldErrorId('full_name')} message={fields.get('full_name')} />
              </div>

              <div>
                <label htmlFor="pa-mobile" className={labelClass}>{t('pa.mobile')} <span className="text-rose-400" aria-hidden="true">*</span></label>
                <PhoneInput id="pa-mobile" autoComplete="tel-national" placeholder="98471 00000" value={mobile}
                  onChange={value => { setMobile(value); fields.clear('mobile'); }} required
                  invalid={!!fields.get('mobile')} describedBy={fields.get('mobile') ? fieldErrorId('mobile') : undefined}
                  className="w-full px-4 py-3 rounded-xl glass-input text-base font-mono" />
                <FieldError id={fieldErrorId('mobile')} message={fields.get('mobile')} />
              </div>

              <div>
                <label htmlFor="pa-email" className={labelClass}>{t('pa.email')} <span className="text-sm font-normal text-slate-500">({t('common.optional')})</span></label>
                <input id="pa-email" type="email" autoComplete="email" placeholder="player@gmail.com" value={email}
                  onChange={e => { setEmail(e.target.value); fields.clear('email'); }}
                  className={inputClass} {...field('email')} />
                <FieldError id={fieldErrorId('email')} message={fields.get('email')} />
              </div>

              <div>
                <label htmlFor="pa-age" className={labelClass}>{t('pa.age')} <span className="text-rose-400" aria-hidden="true">*</span></label>
                <input id="pa-age" type="number" inputMode="numeric" min={14} max={50} value={age}
                  onChange={e => { setAge(Number(e.target.value)); fields.clear('age'); }} required
                  className={`${inputClass} font-semibold`} {...field('age')} />
                <FieldError id={fieldErrorId('age')} message={fields.get('age')} />
              </div>

              <div>
                <label htmlFor="pa-village" className={labelClass}>{t('pa.village')} <span className="text-rose-400" aria-hidden="true">*</span></label>
                <input id="pa-village" type="text" placeholder="Nilambur" value={village}
                  onChange={e => { setVillage(e.target.value); fields.clear('village'); }} required
                  className={inputClass} {...field('village')} />
                <FieldError id={fieldErrorId('village')} message={fields.get('village')} />
              </div>

              <div>
                <label htmlFor="pa-district" className={labelClass}>{t('pa.district')} <span className="text-rose-400" aria-hidden="true">*</span></label>
                <input id="pa-district" type="text" autoComplete="address-level2" placeholder="Malappuram" value={district}
                  onChange={e => { setDistrict(e.target.value); fields.clear('district'); }} required
                  className={inputClass} {...field('district')} />
                <FieldError id={fieldErrorId('district')} message={fields.get('district')} />
              </div>
            </div>

            <div>
              <label htmlFor="pa-photo" className={labelClass}>{t('pa.photo')}</label>
              <input id="pa-photo" type="url" inputMode="url" placeholder="https://…" value={photo}
                onChange={e => { setPhoto(e.target.value); fields.clear('photo'); }}
                aria-describedby="pa-photo-hint" className={inputClass} {...field('photo')} />
              <p id="pa-photo-hint" className="mt-1 text-sm text-slate-400">{t('pa.photoHint')}</p>
              <FieldError id={fieldErrorId('photo')} message={fields.get('photo')} />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-base font-bold text-slate-200 mb-2">{t('pa.category')}</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(auction.base_prices || []).map(cat => (
                  <button
                    key={cat.category}
                    type="button"
                    aria-pressed={category === cat.category}
                    onClick={() => setCategory(cat.category)}
                    className={`p-3 rounded-2xl border-2 text-left transition-all ${
                      category === cat.category
                        ? 'bg-amber-500/15 border-amber-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">{cat.category}</span>
                    <span className="block text-base font-black font-mono text-amber-400 mt-1">{money(cat.price)}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {isFootball ? (
              <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label htmlFor="pa-position" className={labelClass}>{t('pa.position')}</label>
                  <select id="pa-position" value={footballPosition} onChange={(e: any) => setFootballPosition(e.target.value)} className={inputClass}>
                    <option value="Striker">Striker (Forward)</option>
                    <option value="Left Wing">Left Wing</option>
                    <option value="Right Wing">Right Wing</option>
                    <option value="Attacking Midfielder">Attacking Midfielder</option>
                    <option value="Central Midfielder">Central Midfielder</option>
                    <option value="Defensive Midfielder">Defensive Midfielder</option>
                    <option value="Centre Back">Centre Back (Defender)</option>
                    <option value="Left Back">Left Back</option>
                    <option value="Right Back">Right Back</option>
                    <option value="Goalkeeper">Goalkeeper</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pa-foot" className={labelClass}>{t('pa.foot')}</label>
                  <select id="pa-foot" value={footballFoot} onChange={(e: any) => setFootballFoot(e.target.value)} className={inputClass}>
                    <option value="right">{t('pa.foot.right')}</option>
                    <option value="left">{t('pa.foot.left')}</option>
                    <option value="both">{t('pa.foot.both')}</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label htmlFor="pa-role" className={labelClass}>{t('pa.role')}</label>
                  <select id="pa-role" value={cricketRole} onChange={(e: any) => setCricketRole(e.target.value)} className={inputClass}>
                    <option value="All-rounder">All-rounder</option>
                    <option value="Batter">Top Order Batter</option>
                    <option value="Bowler">Bowler</option>
                    <option value="Wicketkeeper">Wicketkeeper</option>
                    <option value="Wicketkeeper + Batter">Wicketkeeper + Batter</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pa-batting" className={labelClass}>{t('pa.batting')}</label>
                  <select id="pa-batting" value={cricketBattingStyle} onChange={(e: any) => setCricketBattingStyle(e.target.value)} className={inputClass}>
                    <option value="Right Hand">Right Hand</option>
                    <option value="Left Hand">Left Hand</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pa-bowling" className={labelClass}>{t('pa.bowling')}</label>
                  <select id="pa-bowling" value={cricketBowlingStyle} onChange={(e: any) => setCricketBowlingStyle(e.target.value)} className={inputClass}>
                    <option value="Medium Fast">Right-arm Medium Fast</option>
                    <option value="Fast">Right-arm Fast</option>
                    <option value="Off Spin">Right-arm Off Spin</option>
                    <option value="Leg Spin">Right-arm Leg Spin</option>
                    <option value="Left-arm Orthodox">Left-arm Orthodox Spin</option>
                    <option value="None">None (Pure Batter)</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="pa-achievements" className={labelClass}>{t('pa.achievements')}</label>
              <textarea id="pa-achievements" rows={3} value={pastAchievements}
                onChange={e => setPastAchievements(e.target.value)}
                aria-describedby="pa-achievements-hint" className={inputClass} />
              <p id="pa-achievements-hint" className="mt-1 text-sm text-slate-400">{t('pa.achievementsHint')}</p>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-base text-slate-400">
                {t('pa.basePrice')}: <strong className="text-amber-400 text-lg font-mono">{money(activeBasePrice)}</strong>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-base shadow-lg shadow-amber-500/20 inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? t('pa.submitting') : t('pa.submit')}
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
