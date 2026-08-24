import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import type { Match, Tournament, Team, Advertisement, Sponsor, Announcement } from '../../types';
import { 
  Tv, Radio, Clock, ShieldCheck, Flame, Volume2, 
  Maximize2, Minimize2, Trophy, MapPin, Calendar, Award,
  Sparkles, Megaphone, ExternalLink, Phone
} from 'lucide-react';

export const ScoreboardTVPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    match: Match;
    tournament: Tournament;
    team_a: Team & { players?: any[] };
    team_b: Team & { players?: any[] };
    football_state?: any;
    cricket_state?: any;
    advertisements: Advertisement[];
    sponsors: Sponsor[];
    announcement: Announcement | null;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Live Scoreboard Ad Config
  const [adConfig, setAdConfig] = useState({
    liveTickerEnabled: true,
    tickerIntervalSeconds: 10,
    goalPopupEnabled: true
  });

  // Current rotating live banner ad index
  const [currentLiveAdIndex, setCurrentLiveAdIndex] = useState(0);

  // Instant Popup Sponsor Ad state
  const [popupAd, setPopupAd] = useState<{
    ad: Advertisement | null;
    title: string;
    message?: string;
  } | null>(null);

  // Fullscreen Break Takeover Mode state
  const [breakMode, setBreakMode] = useState<{
    active: boolean;
    title: string;
    countdown: number;
    currentAdIndex: number;
  }>({
    active: false,
    title: 'HALF-TIME BREAK',
    countdown: 300,
    currentAdIndex: 0
  });

  const [urgentAnnouncement, setUrgentAnnouncement] = useState<Announcement | null>(null);

  const fetchScoreboard = async () => {
    try {
      const res = await api.get(`/matches/scoreboard/match/${id || 'match-fb-live-1'}`);
      setData(res);
      if (res.announcement) setUrgentAnnouncement(res.announcement);
    } catch (err) {
      console.error('Failed to load scoreboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScoreboard();

    // WebSocket connection for real-time live scoreboard sync
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:4000/ws`;
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'SUBSCRIBE', room: `scoreboard:${id || 'match-fb-live-1'}` }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SCORE_UPDATED' || msg.type === 'MATCH_STATUS_CHANGED') {
            fetchScoreboard();
            // If goal scored and popup enabled, trigger ad pop
            if (msg.payload?.event?.event_type === 'goal' && adConfig.goalPopupEnabled) {
              const adsList = data?.advertisements || [];
              if (adsList.length > 0) {
                const randomAd = adsList[Math.floor(Math.random() * adsList.length)];
                setPopupAd({
                  ad: randomAd,
                  title: `⚡ GOAL SPONSOR • ${randomAd.business_name.toUpperCase()}`,
                  message: randomAd.description
                });
                setTimeout(() => setPopupAd(null), 8000);
              }
            }
          } else if (msg.type === 'BREAK_AD_ROTATION') {
            const { action, break_title, countdown_seconds } = msg.payload || {};
            if (action === 'start') {
              setBreakMode({
                active: true,
                title: break_title || 'MATCH BREAK',
                countdown: countdown_seconds || 300,
                currentAdIndex: 0
              });
            } else if (action === 'stop') {
              setBreakMode(prev => ({ ...prev, active: false }));
            }
          } else if (msg.type === 'SCOREBOARD_AD_POPUP') {
            const { ad, custom_title, custom_message, duration_seconds } = msg.payload || {};
            setPopupAd({
              ad,
              title: custom_title || 'FEATURED SPONSOR',
              message: custom_message || ad?.description
            });
            setTimeout(() => setPopupAd(null), (duration_seconds || 8) * 1000);
          } else if (msg.type === 'SCOREBOARD_AD_SETTINGS_CHANGED') {
            const { live_ticker_enabled, ticker_interval_seconds, goal_popup_enabled } = msg.payload || {};
            setAdConfig({
              liveTickerEnabled: live_ticker_enabled !== undefined ? live_ticker_enabled : true,
              tickerIntervalSeconds: ticker_interval_seconds || 10,
              goalPopupEnabled: goal_popup_enabled !== undefined ? goal_popup_enabled : true
            });
          } else if (msg.type === 'EMERGENCY_ANNOUNCEMENT') {
            setUrgentAnnouncement(msg.payload?.announcement || null);
          }
        } catch (e) {}
      };
    } catch (err) {}

    return () => {
      if (ws) ws.close();
    };
  }, [id, data?.advertisements, adConfig.goalPopupEnabled]);

  // Live Gameplay Sponsor Ad Banner Rotator (During match)
  useEffect(() => {
    if (!adConfig.liveTickerEnabled || !data?.advertisements || data.advertisements.length === 0) return;

    const interval = setInterval(() => {
      setCurrentLiveAdIndex(prev => (prev + 1) % data.advertisements.length);
    }, adConfig.tickerIntervalSeconds * 1000);

    return () => clearInterval(interval);
  }, [adConfig.liveTickerEnabled, adConfig.tickerIntervalSeconds, data?.advertisements]);

  // Break-Time Fullscreen Ads Auto Rotator Timer
  useEffect(() => {
    if (!breakMode.active) return;
    const interval = setInterval(() => {
      setBreakMode(prev => {
        const nextIndex = (data?.advertisements && data.advertisements.length > 0)
          ? (prev.currentAdIndex + 1) % data.advertisements.length
          : 0;
        return {
          ...prev,
          countdown: Math.max(0, prev.countdown - 1),
          currentAdIndex: nextIndex
        };
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [breakMode.active, data?.advertisements]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xl font-bold font-heading tracking-wider">CONNECTING TO STADIUM FEED...</span>
        </div>
      </div>
    );
  }

  const { match, tournament, team_a, team_b, football_state, cricket_state, advertisements, sponsors } = data;
  const isFootball = match.sport_code === 'football';

  // Get goal scorers list with player names
  const teamAGoals = football_state?.events?.filter((e: any) => e.team_id === team_a.id && e.event_type === 'goal') || [];
  const teamBGoals = football_state?.events?.filter((e: any) => e.team_id === team_b.id && e.event_type === 'goal') || [];

  const getPlayerName = (team: any, playerId: string) => {
    const player = team?.players?.find((p: any) => p.id === playerId);
    return player ? player.full_name : 'Player';
  };

  // Current active live banner ad
  const activeLiveAd = (advertisements && advertisements.length > 0)
    ? advertisements[currentLiveAdIndex % advertisements.length]
    : null;

  // Current active advertisement in break mode
  const currentAd = advertisements[breakMode.currentAdIndex] || advertisements[0];

  return (
    <div className="min-h-screen w-screen bg-[#060913] text-white flex flex-col justify-between select-none p-4 sm:p-6 lg:p-8 font-sans overflow-y-auto relative">
      {/* Top Stadium Broadcast Header */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              {isFootball ? <span className="text-xl">⚽</span> : <span className="text-xl">🏏</span>}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span>LIVE BROADCAST</span>
              </span>
              <span className="text-xs text-slate-400 font-semibold">{match.round_name || 'Group Stage'}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black font-heading tracking-tight text-white mt-0.5">
              {tournament.name}
            </h1>
          </div>
        </div>

        {/* Sponsor Tag & Location */}
        <div className="flex items-center gap-3">
          {activeLiveAd && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Presented by <strong className="text-white font-bold">{activeLiveAd.business_name}</strong></span>
            </div>
          )}

          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>{tournament.location || `${tournament.village}, ${tournament.district}`}</span>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Emergency Broadcast Alert Banner */}
      {urgentAnnouncement && (
        <div className="my-4 p-4 rounded-2xl bg-gradient-to-r from-rose-600 to-red-700 text-white font-bold flex items-center justify-between shadow-2xl border border-rose-400/50 animate-pulse">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-yellow-300" />
            <div>
              <span className="uppercase text-[10px] tracking-widest block text-yellow-200 font-black">OFFICIAL STADIUM ANNOUNCEMENT</span>
              <span className="text-base sm:text-lg">{urgentAnnouncement.title}: {urgentAnnouncement.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* INSTANT SPONSOR EVENT POP-UP (Goal / Wicket / Push trigger) */}
      {popupAd && (
        <div className="my-3 max-w-2xl mx-auto w-full p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/20 border-2 border-amber-500/60 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {popupAd.ad?.media_url && (
              <img
                src={popupAd.ad.media_url}
                alt={popupAd.ad.title}
                className="w-14 h-14 rounded-xl object-cover border border-amber-500/40 shadow-md"
              />
            )}
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{popupAd.title}</span>
              </div>
              <h4 className="text-base font-black text-white font-heading">{popupAd.ad?.business_name}</h4>
              <p className="text-xs text-slate-300 line-clamp-1">{popupAd.message || popupAd.ad?.description}</p>
            </div>
          </div>

          {popupAd.ad?.phone && (
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-400 block font-semibold">Contact Partner</span>
              <span className="text-xs font-mono font-bold text-amber-400">{popupAd.ad.phone}</span>
            </div>
          )}
        </div>
      )}

      {/* BREAK-TIME COMMERCIAL ROTATOR */}
      {breakMode.active && currentAd ? (
        <div className="my-auto py-8 text-center flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
          <div className="mb-4 inline-flex items-center gap-3 px-6 py-2 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-black text-base uppercase tracking-widest">
            <Clock className="w-4 h-4 animate-spin" />
            <span>{breakMode.title} • RESUMES IN {Math.floor(breakMode.countdown / 60)}:{(breakMode.countdown % 60).toString().padStart(2, '0')}</span>
          </div>

          <div className="w-full rounded-3xl bg-slate-900 border-2 border-slate-800 overflow-hidden shadow-2xl relative">
            <img src={currentAd.media_url} alt={currentAd.title} className="w-full h-80 object-cover" />
            <div className="p-6 bg-slate-950/95 text-left flex items-center justify-between border-t border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">OFFICIAL TOURNAMENT PARTNER</span>
                <h3 className="text-2xl font-black text-white font-heading">{currentAd.business_name}</h3>
                <p className="text-xs text-slate-300 mt-1">{currentAd.description}</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono text-emerald-400 font-bold">{currentAd.phone}</div>
                <div className="text-xs text-slate-400">{currentAd.website}</div>
              </div>
            </div>
          </div>
        </div>
      ) : isFootball ? (
        /* ===================================================================
         * REDESIGNED BROADCAST FOOTBALL SCOREBOARD
         * =================================================================== */
        <div className="my-auto max-w-5xl mx-auto w-full py-4 space-y-4">
          {/* Main Score Center Bar */}
          <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-800 shadow-2xl relative backdrop-blur-xl">
            {/* Top Match Clock & Period Pill */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-slate-950 border border-slate-800 shadow-inner">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{football_state?.current_half === '1' ? '1st Half' : football_state?.current_half === '2' ? '2nd Half' : 'Extra Time'}</span>
                </span>
                <span className="w-1 h-3 bg-slate-800" />
                <span className="font-mono text-base font-black text-white tracking-wider">
                  {football_state?.match_minute || 44}:00
                </span>
              </div>
            </div>

            {/* Teams & Giant Digit Core */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-10">
              {/* Team A (Home) */}
              <div className="flex-1 text-center md:text-right flex flex-col md:items-end items-center">
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                    style={{ backgroundColor: team_a.jersey_color || '#EF4444' }}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{team_a.village || 'Home'}</span>
                </div>
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black font-heading text-white tracking-tight leading-tight">
                  {team_a.name}
                </h2>

                {/* Team A Goal Scorers List */}
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center md:justify-end">
                  {teamAGoals.map((g: any) => (
                    <span key={g.id} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-[11px] text-emerald-400 font-medium font-mono">
                      <span>⚽</span>
                      <span>{getPlayerName(team_a, g.player_id)}</span>
                      <span className="text-slate-500">{g.minute}'</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Giant Digital Score Boxes */}
              <div className="flex items-center gap-3 sm:gap-5 shrink-0 my-2">
                <div className="w-20 h-24 sm:w-28 sm:h-32 rounded-2xl bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center">
                  <span className="text-5xl sm:text-7xl font-black font-mono text-white tracking-tighter">
                    {football_state?.team_a_score ?? 0}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                </div>

                <div className="w-20 h-24 sm:w-28 sm:h-32 rounded-2xl bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center">
                  <span className="text-5xl sm:text-7xl font-black font-mono text-white tracking-tighter">
                    {football_state?.team_b_score ?? 0}
                  </span>
                </div>
              </div>

              {/* Team B (Away) */}
              <div className="flex-1 text-center md:text-left flex flex-col md:items-start items-center">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{team_b.village || 'Away'}</span>
                  <div
                    className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                    style={{ backgroundColor: team_b.jersey_color || '#10B981' }}
                  />
                </div>
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black font-heading text-white tracking-tight leading-tight">
                  {team_b.name}
                </h2>

                {/* Team B Goal Scorers List */}
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center md:justify-start">
                  {teamBGoals.map((g: any) => (
                    <span key={g.id} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-[11px] text-emerald-400 font-medium font-mono">
                      <span>⚽</span>
                      <span>{getPlayerName(team_b, g.player_id)}</span>
                      <span className="text-slate-500">{g.minute}'</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================================
           * LIVE GAMEPLAY ORGANIZER SPONSOR BANNER (Configurable Lower-Third)
           * =================================================================== */}
          {adConfig.liveTickerEnabled && activeLiveAd && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-amber-500/30 shadow-lg flex items-center justify-between gap-4 transition-all animate-in fade-in">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={activeLiveAd.media_url}
                  alt={activeLiveAd.title}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      SPONSOR
                    </span>
                    <span className="text-xs font-bold text-white truncate font-heading">{activeLiveAd.business_name}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5">{activeLiveAd.description || activeLiveAd.title}</p>
                </div>
              </div>

              <div className="text-right shrink-0">
                {activeLiveAd.phone && (
                  <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1 justify-end">
                    <Phone className="w-3 h-3 text-amber-400" />
                    <span>{activeLiveAd.phone}</span>
                  </div>
                )}
                {activeLiveAd.website && (
                  <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{activeLiveAd.website}</div>
                )}
              </div>
            </div>
          )}

          {/* Timeline Stream of Events */}
          {football_state?.events && football_state.events.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px] uppercase tracking-wider shrink-0">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Match Log:</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
                {football_state.events.slice(-6).map((ev: any) => (
                  <span key={ev.id} className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono shrink-0 flex items-center gap-1.5">
                    <span>{ev.event_type === 'goal' ? '⚽ Goal' : ev.event_type === 'yellow_card' ? '🟨 Card' : '🟥 Card'}</span>
                    <span className="text-slate-500 font-bold">{ev.minute}'</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ===================================================================
         * REDESIGNED BROADCAST CRICKET SCOREBOARD
         * =================================================================== */
        <div className="my-auto max-w-5xl mx-auto w-full py-4 space-y-4">
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-xl">
            {/* Top Score Summary */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest">
                  1ST INNINGS • T20
                </span>
                <h2 className="text-2xl sm:text-4xl font-black font-heading text-white mt-1.5">
                  {team_a.name}
                </h2>
              </div>

              <div className="flex items-baseline gap-4">
                <div className="text-5xl sm:text-7xl font-black font-mono text-amber-400 tracking-tight">
                  {cricket_state?.team_a_runs || 86}/{cricket_state?.team_a_wickets || 2}
                </div>
                <div className="text-lg font-bold font-mono text-slate-300">
                  ({cricket_state?.team_a_overs || 9.4} / 20 Ov)
                </div>
              </div>
            </div>

            {/* Batters & Bowlers Grid */}
            <div className="grid md:grid-cols-2 gap-4 mt-6">
              {/* Batting Box */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase mb-3 flex items-center justify-between">
                  <span>Batting</span>
                  <span className="text-emerald-400 font-mono">CRR: {cricket_state?.current_run_rate || 8.89}</span>
                </div>
                <div className="space-y-2 text-sm font-semibold">
                  <div className="flex justify-between items-center text-white">
                    <span className="flex items-center gap-1.5">
                      <span className="text-emerald-400">🏏</span>
                      <span>Rahul R. Menon *</span>
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">42* (26b 4x4 2x6)</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Sanju V. Pillai</span>
                    <span className="font-mono text-slate-400">28* (19b 2x4 1x6)</span>
                  </div>
                </div>
              </div>

              {/* Bowling Box */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase mb-3 flex items-center justify-between">
                  <span>Bowling ({team_b.name})</span>
                  <span className="text-cyan-400 font-mono">Over 10</span>
                </div>
                <div className="space-y-2 text-sm font-semibold">
                  <div className="flex justify-between items-center text-white">
                    <span>Pranav Nair (Leg Spin)</span>
                    <span className="font-mono text-cyan-400 font-bold">1.4 - 0 - 12 - 0</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Recent: <span className="font-mono font-bold text-white">4 • 1 • 6 • 1 • . • 1</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Gameplay Organizer Sponsor Banner */}
          {adConfig.liveTickerEnabled && activeLiveAd && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-amber-500/30 shadow-lg flex items-center justify-between gap-4 transition-all">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={activeLiveAd.media_url}
                  alt={activeLiveAd.title}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      SPONSOR
                    </span>
                    <span className="text-xs font-bold text-white truncate font-heading">{activeLiveAd.business_name}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5">{activeLiveAd.description || activeLiveAd.title}</p>
                </div>
              </div>

              <div className="text-right shrink-0">
                {activeLiveAd.phone && (
                  <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1 justify-end">
                    <Phone className="w-3 h-3 text-amber-400" />
                    <span>{activeLiveAd.phone}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Sponsor Ticker Strip */}
      <footer className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">Official Sponsors:</span>
          <div className="flex items-center gap-4">
            {sponsors.map(sp => (
              <span key={sp.id} className="font-bold text-slate-300">{sp.name}</span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500">
          <span>Powered by Antigravity Sports SaaS</span>
          <span>•</span>
          <span className="text-emerald-400 font-bold">WebSocket Live Sync</span>
        </div>
      </footer>
    </div>
  );
};
