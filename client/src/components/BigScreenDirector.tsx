import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from './ui/Toast';
import type { Advertisement, Announcement, ScoreboardStage, ScoreboardState } from '../types';
import { LINEUP_REVEAL_SECONDS } from './LineupReveal';
import {
  Tv, Coins, Users, Radio, Play, Pause, SkipBack, SkipForward,
  RotateCcw, Megaphone, Clock, ListOrdered, Plus, MonitorPlay, Square,
} from 'lucide-react';

interface BigScreenDirectorProps {
  matchId: string;
  /** The full scorecard is a cricket segment; football's final score is enough. */
  sport: 'football' | 'cricket';
  scoreboard?: ScoreboardState;
  /** Players in the reveal, so stepping can't run past the last one. */
  revealTotal: number;
  onChanged: () => void;
}

const SEGMENTS: { stage: Exclude<ScoreboardStage, 'auto' | 'ad' | 'announcement'>; label: string; icon: React.ElementType; cricketOnly?: boolean }[] = [
  { stage: 'toss', label: 'Coin Toss', icon: Coins },
  { stage: 'lineups', label: 'Squad Reveal', icon: Users },
  { stage: 'live', label: 'Live Score', icon: Radio },
  { stage: 'scorecard', label: 'Full Scorecard', icon: ListOrdered, cricketOnly: true },
];

/** On-screen times offered for an ad or announcement; 0 holds until switched back. */
const DURATION_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60, 120, 300, 600];

const durationLabel = (seconds: number) =>
  seconds === 0 ? 'Hold' : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * The organizer's control of the stadium display, from the scorer console.
 *
 * Everything here is a stage instruction rather than a screen of its own: the
 * display holds whatever segment it was last sent, so the organizer can take
 * the crowd through the toss, the walk-out and the first ball at the pace of
 * the ground rather than the pace of the database.
 *
 * Every ad and announcement made for this match is listed here with its
 * on-screen time, which can be changed right before (or while) it is shown.
 */
export const BigScreenDirector: React.FC<BigScreenDirectorProps> = ({
  matchId,
  sport,
  scoreboard,
  revealTotal,
  onChanged,
}) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Mirrors the display's own clock so the position shown here is the player
  // the crowd is actually looking at, and an item's countdown matches the TV.
  const [, setTick] = useState(0);
  const playing = scoreboard?.resolved_stage === 'lineups' && (scoreboard?.cursor ?? -1) < 0;
  const endsAt = scoreboard?.ends_at ?? null;

  useEffect(() => {
    if (!playing && !endsAt) return;
    const interval = setInterval(() => setTick(value => value + 1), 500);
    return () => clearInterval(interval);
  }, [playing, endsAt]);

  // When the item's time runs out, pick up the segment the server fell back to.
  useEffect(() => {
    if (!endsAt) return;
    const timer = setTimeout(onChanged, Math.max(Date.parse(endsAt) - Date.now(), 0) + 400);
    return () => clearTimeout(timer);
  }, [endsAt]);

  const loadItems = useCallback(async () => {
    try {
      const [adsRes, announcementsRes] = await Promise.all([
        api.get(`/sponsors/ads?matchId=${encodeURIComponent(matchId)}`),
        api.get(`/sponsors/announcements?matchId=${encodeURIComponent(matchId)}`),
      ]);
      setAds(adsRes);
      setAnnouncements(announcementsRes);
    } catch (err) {
      console.error('Failed to load this match\'s ads and announcements', err);
    }
  }, [matchId]);

  // Items are made on their own pages, often in another tab — pick them up
  // when the organizer comes back here.
  useEffect(() => {
    loadItems();
    window.addEventListener('focus', loadItems);
    return () => window.removeEventListener('focus', loadItems);
  }, [loadItems]);

  const intervalSeconds = scoreboard?.reveal_interval_seconds || LINEUP_REVEAL_SECONDS;

  const revealPosition = (() => {
    const cursor = scoreboard?.cursor ?? -1;
    if (cursor >= 0) return cursor;
    if (!scoreboard?.stage_at) return 1;

    const elapsed = Date.now() - Date.parse(scoreboard.stage_at);
    return Math.min(Math.floor(elapsed / (intervalSeconds * 1000)) + 1, Math.max(revealTotal, 1));
  })();

  const setStage = async (stage: ScoreboardStage, cursor?: number, itemId?: string) => {
    setBusy(true);
    try {
      await api.post(`/matches/${matchId}/scoreboard/stage`, { stage, cursor, item_id: itemId });
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change what the big screen is showing');
    } finally {
      setBusy(false);
    }
  };

  // Pausing freezes on the player currently up; resuming rewinds the clock so
  // that same player leads rather than the reveal jumping forward.
  const pauseReveal = () => setStage('lineups', revealPosition);
  const resumeReveal = () => setStage('lineups', -1);
  const stepReveal = (delta: number) =>
    setStage('lineups', Math.min(Math.max(revealPosition + delta, 1), Math.max(revealTotal, 1)));

  const changeDuration = async (kind: 'ad' | 'announcement', id: string, seconds: number) => {
    const path = kind === 'ad' ? `/sponsors/ads/${id}` : `/sponsors/announcements/${id}`;
    const update = <T extends { id: string; duration_seconds: number }>(list: T[]) =>
      list.map(item => (item.id === id ? { ...item, duration_seconds: seconds } : item));

    // Show the new time straight away; put it back if the server refuses.
    const previousAds = ads;
    const previousAnnouncements = announcements;
    if (kind === 'ad') setAds(update); else setAnnouncements(update);

    try {
      await api.put(path, { duration_seconds: seconds });
      if (scoreboard?.item_id === id) onChanged();
    } catch (err: any) {
      setAds(previousAds);
      setAnnouncements(previousAnnouncements);
      toast.error(err.message || 'Failed to change the on-screen time');
    }
  };

  const activeStage = scoreboard?.resolved_stage ?? 'live';
  const onScreenId = activeStage === 'ad' || activeStage === 'announcement' ? scoreboard?.item_id ?? null : null;
  const secondsLeft = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 1000)) : null;

  const onScreenName = (() => {
    if (!onScreenId) return null;
    const item = scoreboard?.item as (Advertisement & Announcement) | null | undefined;
    return activeStage === 'ad' ? item?.business_name : item?.title;
  })();

  return (
    <div className="p-5 rounded-3xl glass-panel border border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tv className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Big Screen Director
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-500">
          {scoreboard?.stage === 'auto' ? 'following the match' : 'held by you'}
        </span>
      </div>

      {/* Which segment the crowd is looking at */}
      <div className={`grid gap-2 ${sport === 'cricket' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        {SEGMENTS.filter(segment => sport === 'cricket' || !segment.cricketOnly).map(({ stage, label, icon: Icon }) => (
          <button
            key={stage}
            disabled={busy}
            onClick={() => setStage(stage)}
            className={`py-3 px-2 rounded-2xl border text-xs font-bold transition-all flex flex-col items-center gap-1.5 disabled:opacity-50 ${
              activeStage === stage
                ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Walk-out transport, only while the squads are on screen */}
      {activeStage === 'lineups' && (
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-400 uppercase tracking-wider">Squad Reveal</span>
            <span className="font-mono text-white">
              Player {Math.min(revealPosition, Math.max(revealTotal, 1))} of {revealTotal || '—'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              disabled={busy}
              onClick={() => stepReveal(-1)}
              className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-50"
              title="Previous player"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              disabled={busy}
              onClick={() => (playing ? pauseReveal() : resumeReveal())}
              className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{playing ? 'Hold' : 'Play'}</span>
            </button>
            <button
              disabled={busy}
              onClick={() => stepReveal(1)}
              className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-50"
              title="Next player"
            >
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              disabled={busy}
              onClick={() => setStage('lineups', -1)}
              className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-50"
              title="Start the reveal again"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* What is covering the screen right now, and the way back to the score */}
      {onScreenId && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <MonitorPlay className="w-3.5 h-3.5" />
              <span>{activeStage === 'ad' ? 'Ad' : 'Announcement'} on the big screen</span>
            </div>
            <div className="text-sm font-bold text-white truncate">{onScreenName}</div>
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              {secondsLeft !== null ? `${clock(secondsLeft)} left, then back to the match` : 'Held until you switch back'}
            </div>
          </div>
          <button
            disabled={busy}
            onClick={() => setStage('auto')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Back to Match</span>
          </button>
        </div>
      )}

      <ItemSection
        title="Ads"
        icon={Megaphone}
        emptyText="No ads for this match yet."
        createLabel="New ad"
        createTo={`/organization/sponsors?match=${encodeURIComponent(matchId)}`}
      >
        {ads.map(ad => (
          <ItemRow
            key={ad.id}
            thumbnail={ad.media_url}
            name={ad.business_name}
            detail={ad.title}
            muted={ad.status !== 'active'}
            duration={ad.duration_seconds}
            onScreen={activeStage === 'ad' && onScreenId === ad.id}
            busy={busy}
            onDuration={seconds => changeDuration('ad', ad.id, seconds)}
            onShow={() => setStage('ad', undefined, ad.id)}
          />
        ))}
      </ItemSection>

      <ItemSection
        title="Announcements"
        icon={Radio}
        emptyText="No announcements for this match yet."
        createLabel="New announcement"
        createTo={`/organization/announcements?match=${encodeURIComponent(matchId)}`}
      >
        {announcements.map(announcement => (
          <ItemRow
            key={announcement.id}
            name={announcement.title}
            detail={announcement.message}
            duration={announcement.duration_seconds}
            onScreen={activeStage === 'announcement' && onScreenId === announcement.id}
            busy={busy}
            onDuration={seconds => changeDuration('announcement', announcement.id, seconds)}
            onShow={() => setStage('announcement', undefined, announcement.id)}
          />
        ))}
      </ItemSection>
    </div>
  );
};

const ItemSection: React.FC<{
  title: string;
  icon: React.ElementType;
  emptyText: string;
  createLabel: string;
  createTo: string;
  children: React.ReactNode[];
}> = ({ title, icon: Icon, emptyText, createLabel, createTo, children }) => (
  <div className="space-y-2 pt-1">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {title} ({children.length})
      </span>
      <Link
        to={createTo}
        className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
      >
        <Plus className="w-3 h-3" />
        {createLabel}
      </Link>
    </div>

    {children.length === 0 ? (
      <div className="p-3 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-[11px] text-slate-500 text-center">
        {emptyText}
      </div>
    ) : (
      <div className="space-y-2">{children}</div>
    )}
  </div>
);

const ItemRow: React.FC<{
  thumbnail?: string;
  name: string;
  detail?: string;
  muted?: boolean;
  duration: number;
  onScreen: boolean;
  busy: boolean;
  onDuration: (seconds: number) => void;
  onShow: () => void;
}> = ({ thumbnail, name, detail, muted, duration, onScreen, busy, onDuration, onShow }) => {
  const choices = DURATION_CHOICES.includes(duration) ? DURATION_CHOICES : [...DURATION_CHOICES, duration].sort((a, b) => a - b);

  return (
    <div className={`p-2.5 rounded-xl border flex items-center gap-3 ${
      onScreen ? 'bg-amber-500/10 border-amber-500/50' : 'bg-slate-950 border-slate-800'
    } ${muted ? 'opacity-60' : ''}`}>
      {thumbnail !== undefined && (
        thumbnail
          ? <img src={thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-800 shrink-0" />
          : <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white truncate">{name}</span>
          {onScreen && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black uppercase shrink-0">On screen</span>
          )}
        </div>
        {detail && <div className="text-[11px] text-slate-400 truncate">{detail}</div>}
      </div>

      <label className="flex items-center gap-1 shrink-0" title="How long it stays on the big screen">
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        <select
          value={duration}
          onChange={e => onDuration(Number(e.target.value))}
          className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-[11px] font-mono font-bold outline-none"
        >
          {choices.map(seconds => (
            <option key={seconds} value={seconds}>{durationLabel(seconds)}</option>
          ))}
        </select>
      </label>

      <button
        disabled={busy || onScreen}
        onClick={onShow}
        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-40 shrink-0"
      >
        <MonitorPlay className="w-3.5 h-3.5" />
        <span>Show</span>
      </button>
    </div>
  );
};
