import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';
import type {
  Match, Tournament, Team, Advertisement, Announcement, FootballMatchState, FootballScorecardSide,
  MatchLineupEntry, ScorecardInnings, ScorecardBattingRow, ScoreboardState,
} from '../../types';
import { websocketUrl } from '../../config';
import { CoinFlip, COIN_FLIP_MS } from '../../components/CoinFlip';
import { LineupReveal, LINEUP_REVEAL_SECONDS } from '../../components/LineupReveal';
import { BigScreenScorecard } from '../../components/BigScreenScorecard';
import { BigScreenFootballCard } from '../../components/BigScreenFootballCard';
import { firstTeamId, formatClock, periodLabel, tossDecisionPhrase, useFootballClock } from '../../lib/football';
import {
  Radio, Clock, Maximize2, Minimize2, MapPin, Sparkles, Phone, Globe
} from 'lucide-react';

/** A full-screen call: what just happened, said as loudly as the screen allows. */
interface ScoreFlash {
  label: string;
  detail?: string;
  tone: 'emerald' | 'amber' | 'rose' | 'cyan';
  ms: number;
}

const FLASH_TONES: Record<ScoreFlash['tone'], { text: string; glow: string }> = {
  emerald: { text: 'text-emerald-400', glow: 'rgba(200, 245, 53,0.35)' },
  amber: { text: 'text-amber-400', glow: 'rgba(245,158,11,0.35)' },
  rose: { text: 'text-rose-400', glow: 'rgba(244,63,94,0.35)' },
  cyan: { text: 'text-cyan-300', glow: 'rgba(56, 189, 248,0.32)' },
};

const DISMISSAL_WORDS: Record<string, string> = {
  bowled: 'Bowled',
  caught: 'Caught',
  lbw: 'LBW',
  run_out: 'Run Out',
  stumped: 'Stumped',
  hit_wicket: 'Hit Wicket',
  caught_and_bowled: 'Caught & Bowled',
  retired_hurt: 'Retired Hurt',
  obstructing_field: 'Obstructing the Field',
};

/**
 * The call a delivery or a football event deserves on the big screen, or null
 * when it deserves none — a dot ball and a single are read off the scoreline,
 * and flashing them would make the flash mean nothing.
 */
const flashFor = (payload: any, nameOf: (playerId?: string | null) => string | undefined = () => undefined): ScoreFlash | null => {
  const delivery = payload?.delivery;

  if (delivery) {
    if (delivery.is_wicket) {
      return {
        label: 'OUT!',
        detail: DISMISSAL_WORDS[delivery.wicket_type] || 'Wicket',
        tone: 'rose',
        ms: 5000,
      };
    }

    // Runs off the bat first: a six off a no-ball is a six to the crowd.
    if (delivery.runs_scored === 6) return { label: 'SIX!', detail: extraNote(delivery), tone: 'amber', ms: 4500 };
    if (delivery.runs_scored === 4) return { label: 'FOUR!', detail: extraNote(delivery), tone: 'emerald', ms: 4000 };

    switch (delivery.extras) {
      case 'wide': return { label: 'WIDE', detail: runNote(delivery.extras_runs), tone: 'cyan', ms: 2800 };
      case 'no_ball': return { label: 'NO BALL', detail: 'Free hit call', tone: 'amber', ms: 3200 };
      case 'bye': return { label: 'BYES', detail: runNote(delivery.extras_runs), tone: 'cyan', ms: 2600 };
      case 'leg_bye': return { label: 'LEG BYES', detail: runNote(delivery.extras_runs), tone: 'cyan', ms: 2600 };
      default: return null;
    }
  }

  const event = payload?.event;
  const who = nameOf(event?.player_id);
  const at = (text?: string) => [text, event?.minute != null ? `${event.minute}'` : undefined].filter(Boolean).join(' ') || undefined;

  switch (event?.event_type) {
    case 'goal': return { label: 'GOAL!', detail: at(who), tone: 'emerald', ms: 5000 };
    case 'penalty_goal': return { label: 'GOAL!', detail: at(who ? `${who} (pen)` : 'Penalty'), tone: 'emerald', ms: 5000 };
    case 'own_goal': return { label: 'OWN GOAL', detail: at(who), tone: 'amber', ms: 4000 };
    case 'penalty_missed': return { label: 'MISSED!', detail: at(who ? `${who} misses the penalty` : 'Penalty missed'), tone: 'rose', ms: 3800 };
    case 'yellow_card': return { label: 'YELLOW', detail: at(who || 'Booking'), tone: 'amber', ms: 3200 };
    case 'red_card': return { label: 'RED CARD', detail: at(who ? `${who} is sent off` : 'Sent off'), tone: 'rose', ms: 4500 };
    case 'substitution': {
      const on = nameOf(event.sub_in_player_id);
      const off = nameOf(event.sub_out_player_id);
      return on || off
        ? { label: 'SUB', detail: `${on ?? '—'} on, ${off ?? '—'} off`, tone: 'cyan', ms: 3200 }
        : null;
    }
    default: return null;
  }
};

/** "off a no-ball" / "off a wide", when a boundary came off one. */
const extraNote = (delivery: any): string | undefined =>
  delivery.extras === 'no_ball' ? 'Off a no-ball'
    : delivery.extras === 'wide' ? 'Off a wide'
      : undefined;

/** How many runs an extra was worth, when it was worth more than one. */
const runNote = (extrasRuns: number): string | undefined =>
  (extrasRuns ?? 0) > 1 ? `${extrasRuns} runs` : undefined;

/**
 * The stadium display.
 *
 * Everything lives on one screen: the page is exactly the height of the
 * viewport and never scrolls, because nobody walks up to a big screen to
 * scroll it. Sections are sized to fit rather than stacked — the scoreline
 * takes the space it needs, the card takes what is left — and the type is
 * scaled against the viewport (`tv-*` in index.css) so it stays readable from
 * across a ground.
 */
export const ScoreboardTVPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    match: Match;
    tournament: Tournament;
    team_a: Team & { players?: any[] };
    team_b: Team & { players?: any[] };
    football_state?: FootballMatchState | null;
    cricket_state?: any;
    lineups: MatchLineupEntry[];
    scorecard: ScorecardInnings[];
    football_scorecard?: FootballScorecardSide[] | null;
    sent_off_player_ids?: string[];
    scoreboard: ScoreboardState;
  } | null>(null);

  // Called before any early return, like every hook. Ticks only while the
  // football clock runs; a cricket match never starts it.
  const footballClock = useFootballClock(data?.football_state);

  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ticks once a second while an ad or announcement with a set time is up, so
  // its countdown moves.
  const [, setItemTick] = useState(0);

  // The full-screen call for the ball just bowled. Cleared on a timer, so the
  // display always returns to the scoreline on its own.
  const [flash, setFlash] = useState<ScoreFlash | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  // How much of the play log this display has already seen, so a refetch can
  // tell a new ball from the same data arriving again. Null until first load.
  const lastSeenPlayRef = useRef<{ deliveries: number; events: number } | null>(null);
  // Guards against an older response landing after a newer one.
  const fetchSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);

  // Whether the live socket is actually connected. When it isn't, the display
  // polls instead of silently freezing on the last score it heard.
  const [socketLive, setSocketLive] = useState(false);

  // Coin toss reveal state — the flip plays on the big screen in sync with the
  // scorer's console, landing on the face carried in the broadcast payload.
  const [tossFlipping, setTossFlipping] = useState(false);
  const [tossFace, setTossFace] = useState<'heads' | 'tails' | null>(null);
  const [tossRetakeNotice, setTossRetakeNotice] = useState(false);

  // Squad reveal position. A playing reveal (cursor -1) advances on a local
  // tick anchored to when this display learned the stage started, so a screen
  // switched on midway catches up rather than replaying from the first player.
  const [revealTick, setRevealTick] = useState(0);
  const revealAnchorRef = useRef<number | null>(null);

  /**
   * Fix the point a playing squad reveal is measured from.
   *
   * A reveal that arrives over the socket starts from now; one found already
   * running on a cold load is measured from the server's own start time, so a
   * display opened late joins at the right player. Any other stage clears it.
   */
  const anchorReveal = (scoreboard?: ScoreboardState, fromBroadcast = false) => {
    if (!scoreboard || scoreboard.resolved_stage !== 'lineups' || scoreboard.cursor >= 0) {
      revealAnchorRef.current = null;
      return;
    }

    if (fromBroadcast || revealAnchorRef.current === null) {
      const startedAt = scoreboard.stage_at ? Date.parse(scoreboard.stage_at) : NaN;
      revealAnchorRef.current = fromBroadcast || Number.isNaN(startedAt) ? Date.now() : startedAt;
      setRevealTick(0);
    }
  };

  /**
   * Put a call on the screen and take it off again.
   *
   * Replacing a flash that is still showing restarts the clock rather than
   * stacking, so a quick wide after a four can never leave the display stuck
   * on a call the match has moved past.
   */
  const showFlash = (next: ScoreFlash | null) => {
    if (!next) return;

    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);

    setFlash(next);
    flashTimerRef.current = window.setTimeout(() => {
      setFlash(null);
      flashTimerRef.current = null;
    }, next.ms);
  };

  // A display left open across a match would otherwise keep a stray timer.
  useEffect(() => () => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, []);

  /**
   * Flash the play that just arrived in the match data.
   *
   * Driven by the data rather than by the socket message, so the flash still
   * fires when the display only learns of the ball by polling — which is
   * exactly when the gateway is down and the crowd most needs the screen to
   * keep up. It fires only when exactly one new ball (or football event) has
   * appeared since the last look: an undo shrinks the log and a reconnect
   * after a long gap adds several, and neither should replay an old call.
   */
  const flashNewestPlay = (res: any) => {
    const deliveries = res.cricket_state?.deliveries || [];
    const events = res.football_state?.events || [];
    const seen = lastSeenPlayRef.current;
    const players = [...(res.team_a?.players || []), ...(res.team_b?.players || [])];
    const nameOf = (playerId?: string | null) =>
      playerId ? players.find((player: any) => player.id === playerId)?.full_name : undefined;

    if (seen) {
      if (deliveries.length === seen.deliveries + 1) {
        showFlash(flashFor({ delivery: deliveries[deliveries.length - 1] }));
      } else if (events.length === seen.events + 1) {
        showFlash(flashFor({ event: events[events.length - 1] }, nameOf));
      }
    }

    lastSeenPlayRef.current = { deliveries: deliveries.length, events: events.length };
  };

  const fetchScoreboard = async () => {
    const requestNo = ++fetchSeqRef.current;

    try {
      const res = await api.get(`/matches/scoreboard/match/${id || 'match-fb-live-1'}`);

      // A socket event and a poll can overlap. A slower, older response must
      // not overwrite a newer one — or re-announce a ball already flashed.
      if (requestNo < appliedSeqRef.current) return;
      appliedSeqRef.current = requestNo;

      setData(res);
      anchorReveal(res.scoreboard);
      flashNewestPlay(res);
    } catch (err) {
      console.error('Failed to load scoreboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScoreboard();

    // The live socket. It reconnects on its own: a display opened while the
    // gateway was down — or one that loses it mid-match — used to stay deaf
    // until someone reloaded the page, which on a stadium screen means for the
    // rest of the match.
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let stopped = false;

    const scheduleReconnect = () => {
      if (stopped || retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
      }, 3000);
    };

    const connect = () => {
      try {
        ws = new WebSocket(websocketUrl());
      } catch (err) {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        setSocketLive(true);
        ws?.send(JSON.stringify({ type: 'SUBSCRIBE', room: `scoreboard:${id || 'match-fb-live-1'}` }));
        // Catch up on anything that happened while disconnected.
        fetchScoreboard();
      };

      ws.onclose = () => {
        setSocketLive(false);
        scheduleReconnect();
      };

      // onclose follows an error, and that is where the retry is scheduled.
      ws.onerror = () => ws?.close();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SCORE_UPDATED' || msg.type === 'MATCH_STATUS_CHANGED') {
            // The refetch brings the new ball, and flashNewestPlay announces it.
            fetchScoreboard();
          } else if (msg.type === 'TOSS_CALLED') {
            // The payload already carries the settled face, so the big screen
            // spins toward the real result instead of guessing.
            setTossRetakeNotice(false);
            setTossFace(msg.payload?.toss_result ?? null);
            setTossFlipping(true);
            setTimeout(async () => {
              await fetchScoreboard();
              setTossFlipping(false);
            }, COIN_FLIP_MS);
          } else if (msg.type === 'TOSS_DECIDED' || msg.type === 'TOSS_RECORDED') {
            setTossRetakeNotice(false);
            fetchScoreboard();
          } else if (msg.type === 'SCOREBOARD_STAGE_CHANGED') {
            // Anchor first, then refetch: the stage payload is authoritative
            // about the reveal, and the refetch only brings the sheets along.
            anchorReveal(msg.payload, true);
            fetchScoreboard();
          } else if (msg.type === 'LINEUP_UPDATED') {
            fetchScoreboard();
          } else if (msg.type === 'TOSS_RESET') {
            setTossFlipping(false);
            setTossFace(null);
            setTossRetakeNotice(true);
            fetchScoreboard();
            setTimeout(() => setTossRetakeNotice(false), 6000);
          }
        } catch (e) {}
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [id]);

  // Without the socket, look for changes every few seconds instead, so the
  // score — and every four, six and wicket — still reaches the crowd. Stops the
  // moment the socket is back.
  useEffect(() => {
    if (socketLive) return;

    const interval = window.setInterval(fetchScoreboard, 4000);
    return () => window.clearInterval(interval);
  }, [socketLive, id]);

  // Drives a playing squad reveal forward. Only the tick lives here — how far
  // the reveal has got is worked out at render time from the anchor, so a
  // dropped frame or a backgrounded tab can't lose a player.
  useEffect(() => {
    const scoreboard = data?.scoreboard;
    if (!scoreboard || scoreboard.resolved_stage !== 'lineups' || scoreboard.cursor >= 0) return;

    const interval = setInterval(() => setRevealTick(tick => tick + 1), 500);
    return () => clearInterval(interval);
  }, [data?.scoreboard?.resolved_stage, data?.scoreboard?.cursor]);

  // An ad or announcement with a set time: count it down, and when it is up
  // ask the server what comes next — it has already resolved the stage back,
  // so every screen in the ground drops the item together.
  const endsAt = data?.scoreboard?.ends_at ?? null;

  useEffect(() => {
    if (!endsAt) return;

    const tick = window.setInterval(() => setItemTick(value => value + 1), 1000);
    const expire = window.setTimeout(fetchScoreboard, Math.max(Date.parse(endsAt) - Date.now(), 0) + 400);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(expire);
    };
  }, [endsAt]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (loading || !data) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="tv-sub font-bold font-heading tracking-wider">CONNECTING TO STADIUM FEED...</span>
        </div>
      </div>
    );
  }

  const { match, tournament, team_a, team_b, football_state, cricket_state } = data;
  const isFootball = match.sport_code === 'football';

  // What the organizer has the screen on. `auto` is already resolved server
  // side, so pre-match still shows the toss without anyone directing anything.
  const stage = data.scoreboard?.resolved_stage ?? (match.status === 'scheduled' ? 'toss' : 'live');
  const lineups = data.lineups ?? [];

  // A playing reveal counts players off the anchor; a held one shows exactly
  // what the organizer parked it on. `revealTick` only forces the re-read.
  void revealTick;
  const revealedPlayers = (() => {
    const cursor = data.scoreboard?.cursor ?? -1;
    if (cursor >= 0) return cursor;

    const anchor = revealAnchorRef.current;
    if (anchor === null) return 1;

    const seconds = data.scoreboard?.reveal_interval_seconds || LINEUP_REVEAL_SECONDS;
    return Math.floor((Date.now() - anchor) / (seconds * 1000)) + 1;
  })();

  // Goals under the side they counted for: an own goal is scored by one team's
  // player and credited to the other, and a penalty is as much a goal as any.
  const footballEvents = football_state?.events || [];
  const goalsFor = (teamId: string) => footballEvents.filter(event =>
    ((event.event_type === 'goal' || event.event_type === 'penalty_goal') && event.team_id === teamId) ||
    (event.event_type === 'own_goal' && event.team_id !== teamId));
  const teamAGoals = goalsFor(team_a.id);
  const teamBGoals = goalsFor(team_b.id);

  const sentOff = data.sent_off_player_ids || [];
  const redCardsFor = (teamId: string) => {
    const squad = new Set(((teamId === team_a.id ? team_a : team_b).players || []).map((player: any) => player.id));
    return sentOff.filter(playerId => squad.has(playerId)).length;
  };

  const getPlayerName = (playerId?: string | null) => {
    if (!playerId) return 'Player';
    const player = [...(team_a.players || []), ...(team_b.players || [])].find((p: any) => p.id === playerId);
    return player ? player.full_name : 'Player';
  };

  const goalTag = (type: string) => (type === 'penalty_goal' ? ' (pen)' : type === 'own_goal' ? ' (OG)' : '');

  // Cricket: everything below is derived from real state — the innings in
  // progress decides which side's tally is on show, and who's at the crease.
  const secondInnings = cricket_state?.current_innings === 2;
  const inningsRuns = (secondInnings ? cricket_state?.team_b_runs : cricket_state?.team_a_runs) ?? 0;
  const inningsWickets = (secondInnings ? cricket_state?.team_b_wickets : cricket_state?.team_a_wickets) ?? 0;
  const inningsOvers = (secondInnings ? cricket_state?.team_b_overs : cricket_state?.team_a_overs) ?? 0;

  const teamById = (teamId?: string | null) =>
    teamId === team_a.id ? team_a : teamId === team_b.id ? team_b : null;
  const battingTeam = teamById(cricket_state?.batting_team_id);
  const bowlingTeam = teamById(cricket_state?.bowling_team_id);

  const squadPlayerName = (playerId?: string | null) => {
    if (!playerId) return '—';
    const player = [...(team_a.players || []), ...(team_b.players || [])].find((p: any) => p.id === playerId);
    return player ? player.full_name : '—';
  };

  // The innings on show, straight from the server-derived card.
  const currentCard = (data.scorecard || []).find(
    (card: ScorecardInnings) => card.innings === (cricket_state?.current_innings ?? 1)
  );

  // The crease, with each player's figures beside their name — a bare name
  // tells the crowd nothing they can't already see on the field.
  const cardFor = (playerId?: string | null) =>
    currentCard?.batting.find(row => row.player_id === playerId);
  const strikerCard = cardFor(cricket_state?.current_striker_id);
  const nonStrikerCard = cardFor(cricket_state?.current_non_striker_id);
  const bowlerCard = currentCard?.bowling.find(row => row.player_id === cricket_state?.current_bowler_id);

  const inningsDeliveries = (cricket_state?.deliveries || [])
    .filter((ball: any) => ball.innings === (cricket_state?.current_innings ?? 1));

  const ballLabel = (ball: any) => {
    if (ball.is_wicket) return 'W';
    const runs = ball.runs_scored + (ball.extras_runs || 0);
    if (ball.extras && ball.extras !== 'none') {
      return `${runs}${ball.extras === 'wide' ? 'wd' : ball.extras === 'no_ball' ? 'nb' : 'b'}`;
    }
    return ball.runs_scored === 0 ? '•' : String(ball.runs_scored);
  };

  // This over rather than the last six balls, so the strip reads the way a
  // commentator calls it.
  const currentOver = inningsDeliveries.length
    ? Math.max(...inningsDeliveries.map((ball: any) => ball.over_number))
    : 0;
  const thisOver = inningsDeliveries.filter((ball: any) => ball.over_number === currentOver);

  const target = cricket_state?.target_runs;
  const runsNeeded = target ? Math.max(0, target - inningsRuns) : null;

  // An ad or announcement the organizer has put up takes the whole screen.
  const screenItem = (stage === 'ad' || stage === 'announcement') ? data.scoreboard?.item ?? null : null;
  const itemSecondsLeft = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 1000)) : null;

  return (
    <div className="h-screen w-screen bg-[#070b1d] text-white flex flex-col select-none overflow-hidden p-3 sm:p-4 lg:p-6 font-sans relative">
      {/* The call for the ball just bowled — over everything, including a
          break takeover, because it is the thing the crowd looked up for. It
          clears itself and the scoreline is straight back underneath. */}
      {flash && (
        <div className="tv-flash-backdrop absolute inset-0 z-[120] flex flex-col items-center justify-center bg-slate-950/92 backdrop-blur-sm">
          <div
            className="absolute w-[70vw] h-[70vw] max-w-[900px] max-h-[900px] rounded-full blur-3xl pointer-events-none"
            style={{ backgroundColor: FLASH_TONES[flash.tone].glow }}
          />

          <div className="tv-flash-in relative text-center px-6">
            <div
              className={`tv-flash-word font-black font-heading ${FLASH_TONES[flash.tone].text}`}
              style={{ '--flash-chars': flash.label.length } as React.CSSProperties}
            >
              {flash.label}
            </div>
            {flash.detail && (
              <div className="tv-headline font-black text-white/90 mt-2 [overflow-wrap:normal]">{flash.detail}</div>
            )}
          </div>
        </div>
      )}

      {/* Top Stadium Broadcast Header */}
      <header className="shrink-0 flex items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              {isFootball ? <span className="text-xl">⚽</span> : <span className="text-xl">🏏</span>}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 tv-label font-black uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span>LIVE</span>
              </span>
              <span className="tv-label text-slate-400 font-semibold truncate">{match.round_name || 'Group Stage'}</span>
            </div>
            <h1 className="tv-sub font-black font-heading tracking-tight text-white mt-0.5 truncate">
              {tournament.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 tv-label text-slate-300">
            <MapPin className="w-4 h-4 text-emerald-400" />
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

      {/* An ad or announcement pushed from the scorer console. It covers the
          whole display — never squeezed beside or under the score — and only
          the call for a ball just bowled sits above it. */}
      {screenItem && (
        <FullScreenItem
          kind={stage as 'ad' | 'announcement'}
          item={screenItem}
          secondsLeft={itemSecondsLeft}
        />
      )}

      {/* The stage fills whatever is left between the header and the footer,
          and each section inside is sized to fit it rather than to grow. */}
      <main className="flex-1 min-h-0 flex flex-col py-3">
        {stage === 'lineups' ? (
          /* ===================================================================
           * SQUAD REVEAL — both team sheets announced a player at a time once
           * the toss has settled. Sport-agnostic, so football gets a walk-out
           * too; the order is the one the toss decided.
           * =================================================================== */
          <div className="flex-1 min-h-0">
            <LineupReveal
              lineups={lineups}
              teamA={team_a}
              teamB={team_b}
              firstTeamId={firstTeamId(match)}
              sport={match.sport_code}
              revealed={revealedPlayers}
            />
          </div>
        ) : stage === 'scorecard' && isFootball ? (
          /* ===================================================================
           * FOOTBALL MATCH CARD — scorers, bookings and changes for both sides,
           * at half time and full time.
           * =================================================================== */
          <div className="flex-1 min-h-0">
            <BigScreenFootballCard
              match={match}
              teamA={team_a}
              teamB={team_b}
              card={data.football_scorecard || []}
              footballState={football_state}
            />
          </div>
        ) : stage === 'scorecard' ? (
          /* ===================================================================
           * FULL SCORECARD — every batter and bowler, between innings and at
           * full time. The server switches to this on its own when an innings
           * ends or the match is decided.
           * =================================================================== */
          <div className="flex-1 min-h-0">
            <BigScreenScorecard
              match={match}
              teamA={team_a}
              teamB={team_b}
              scorecard={data.scorecard || []}
              cricketState={cricket_state}
            />
          </div>
        ) : stage === 'toss' ? (
          /* ===================================================================
           * COIN TOSS REVEAL — shown pre-match, before the first ball.
           * =================================================================== */
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-amber-500/30 shadow-2xl backdrop-blur-xl px-6 py-8 text-center">
            <span className="px-4 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 tv-label font-black uppercase">
              Coin Toss
            </span>

            {tossRetakeNotice && (
              <div className="px-5 py-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 font-bold tv-sub animate-pulse-subtle">
                ↺ The toss is being retaken…
              </div>
            )}

            <CoinFlip
              isFlipping={tossFlipping}
              result={tossFlipping ? tossFace : match.toss_result}
              size="lg"
            />

            {tossFlipping ? (
              <span className="tv-headline font-black text-amber-300 uppercase tracking-widest animate-pulse-subtle">
                Flipping…
              </span>
            ) : match.toss_winner_team_id ? (
              <div className="space-y-2">
                {match.toss_result && (
                  <p className="tv-sub font-black uppercase tracking-[0.3em] text-amber-400">
                    It's {match.toss_result}
                  </p>
                )}
                {/* Say which kind of toss this was, so a scorer-entered result
                    is never mistaken for the server's own flip. */}
                <p className="tv-label uppercase text-slate-500">
                  {match.toss_method === 'digital' ? 'Digital coin flip' : 'Toss held at the ground'}
                </p>
                <h2 className="tv-headline font-black font-heading text-white">
                  {match.toss_winner_team_id === team_a.id ? team_a.name : team_b.name}
                  <span className="text-amber-400"> won the toss</span>
                </h2>
                {match.toss_decision ? (
                  <>
                    <p className="tv-team font-bold text-slate-300">
                      Elected to <span className="text-white uppercase">{tossDecisionPhrase(match.toss_decision)}</span>
                      {!isFootball && ' first'}
                    </p>
                    {isFootball && match.kick_off_team_id && (
                      <p className="tv-sub font-black text-emerald-400">
                        {match.kick_off_team_id === team_a.id ? team_a.name : team_b.name} kick off
                      </p>
                    )}
                  </>
                ) : (
                  <p className="tv-sub text-slate-400 animate-pulse-subtle">
                    {isFootball ? 'Choosing the kick-off or an end…' : 'Deciding whether to bat or bowl…'}
                  </p>
                )}
              </div>
            ) : (
              <span className="tv-headline font-bold text-slate-400">Waiting for the toss…</span>
            )}
          </div>
        ) : isFootball ? (
          /* ===================================================================
           * FOOTBALL SCOREBOARD
           * =================================================================== */
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex-1 min-h-0 p-5 lg:p-8 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-xl flex flex-col justify-center">
              <div className="flex justify-center mb-6">
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-slate-950 border border-slate-800 shadow-inner">
                  <span className="flex items-center gap-1.5 tv-label font-bold text-emerald-400 uppercase">
                    <span className={`w-2 h-2 rounded-full ${football_state?.is_timer_running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                    <span>{match.status === 'completed' ? 'Full Time' : periodLabel(football_state?.current_half)}</span>
                  </span>
                  {football_state?.current_half !== 'penalties' && (
                    <>
                      <span className="w-1 h-3 bg-slate-800" />
                      <span className="font-mono tv-sub font-black text-white tracking-wider">
                        {formatClock(footballClock)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 lg:gap-10">
                <div className="flex-1 min-w-0 text-right flex flex-col items-end">
                  <div className="flex items-center gap-3 mb-1">
                    <div
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: team_a.jersey_color || '#EF4444' }}
                    />
                    <span className="tv-label font-bold uppercase text-slate-400">{team_a.village || 'Home'}</span>
                  </div>
                  <h2 className="tv-team font-black font-heading text-white tracking-tight">
                    {team_a.name}
                    <RedCards count={redCardsFor(team_a.id)} />
                  </h2>

                  <div className="mt-2 flex flex-wrap gap-1.5 justify-end">
                    {teamAGoals.slice(-5).map(g => (
                      <span key={g.id} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 tv-label text-emerald-400 font-mono">
                        <span>⚽</span>
                        <span>{getPlayerName(g.player_id)}{goalTag(g.event_type)}</span>
                        <span className="text-slate-500">{g.minute}'</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3 lg:gap-5">
                  <span className="tv-score font-black font-mono text-white tracking-tighter">
                    {football_state?.team_a_score ?? 0}
                  </span>
                  <span className="tv-team font-black text-slate-700">:</span>
                  <span className="tv-score font-black font-mono text-white tracking-tighter">
                    {football_state?.team_b_score ?? 0}
                  </span>
                </div>

                <div className="flex-1 min-w-0 text-left flex flex-col items-start">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="tv-label font-bold uppercase text-slate-400">{team_b.village || 'Away'}</span>
                    <div
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: team_b.jersey_color || '#10B981' }}
                    />
                  </div>
                  <h2 className="tv-team font-black font-heading text-white tracking-tight">
                    {team_b.name}
                    <RedCards count={redCardsFor(team_b.id)} />
                  </h2>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {teamBGoals.slice(-5).map(g => (
                      <span key={g.id} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 tv-label text-emerald-400 font-mono">
                        <span>⚽</span>
                        <span>{getPlayerName(g.player_id)}{goalTag(g.event_type)}</span>
                        <span className="text-slate-500">{g.minute}'</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ===================================================================
           * CRICKET SCOREBOARD — scoreline, crease, this over and the full card
           * on one screen.
           * =================================================================== */
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Scoreline */}
            <div className="shrink-0 px-5 py-4 lg:px-8 lg:py-5 rounded-3xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-xl flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div className="min-w-0">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 tv-label font-black uppercase">
                  {secondInnings ? '2ND' : '1ST'} INNINGS • {cricket_state?.total_overs ?? 20} OV
                </span>
                <h2 className="tv-team font-black font-heading text-white mt-1">
                  {battingTeam?.name || team_a.name}
                </h2>
              </div>

              <div className="flex items-baseline gap-4 lg:gap-6">
                <span className="tv-score font-black font-mono text-amber-400 tracking-tight">
                  {inningsRuns}/{inningsWickets}
                </span>
                <span className="tv-team font-bold font-mono text-slate-300">
                  ({inningsOvers})
                </span>
              </div>

              <div className="text-right">
                <div className="tv-label uppercase text-slate-500">
                  CRR <span className="font-mono text-emerald-400">{cricket_state?.current_run_rate ?? 0}</span>
                  {cricket_state?.required_run_rate ? (
                    <> • RRR <span className="font-mono text-rose-400">{cricket_state.required_run_rate}</span></>
                  ) : null}
                </div>
                {runsNeeded !== null && (
                  <div className="tv-sub font-black text-white">
                    Need <span className="text-amber-400">{runsNeeded}</span> to win
                  </div>
                )}
              </div>
            </div>

            {/* Only who is out there right now. A full card can't be read from
                the boundary rope, so the two batters and the bowler get the
                whole screen instead of a table nobody can see. */}
            <div className="flex-1 min-h-0 grid lg:grid-cols-2 gap-3">
              <div className="p-4 lg:p-6 rounded-3xl bg-slate-950/80 border border-slate-800 flex flex-col min-h-0 overflow-hidden">
                <div className="tv-label font-bold text-slate-400 uppercase shrink-0">
                  Batting • {battingTeam?.name || team_a.name}
                </div>

                <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-2 overflow-hidden">
                  <BatterLine
                    name={squadPlayerName(cricket_state?.current_striker_id)}
                    card={strikerCard}
                    onStrike
                  />
                  <BatterLine
                    name={squadPlayerName(cricket_state?.current_non_striker_id)}
                    card={nonStrikerCard}
                  />
                </div>
              </div>

              <div className="p-4 lg:p-6 rounded-3xl bg-slate-950/80 border border-slate-800 flex flex-col min-h-0 overflow-hidden">
                <div className="tv-label font-bold text-slate-400 uppercase shrink-0">
                  Bowling • {bowlingTeam?.name || team_b.name}
                </div>

                <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-2 overflow-hidden">
                  <div>
                    <div className="tv-name font-black font-heading text-white">
                      {squadPlayerName(cricket_state?.current_bowler_id)}
                    </div>
                    <div className="flex items-baseline gap-4 mt-1">
                      <span className="tv-headline font-black font-mono text-cyan-400">
                        {bowlerCard ? `${bowlerCard.wickets}/${bowlerCard.runs}` : '—'}
                      </span>
                      <span className="tv-sub font-mono font-bold text-slate-400">
                        {bowlerCard ? `${bowlerCard.overs} ov` : ''}
                      </span>
                    </div>
                    {bowlerCard && (
                      <div className="tv-label uppercase text-slate-500 mt-1">
                        Econ <span className="font-mono text-slate-300">{bowlerCard.economy}</span>
                        {' • '}Maidens <span className="font-mono text-slate-300">{bowlerCard.maidens}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="tv-label font-bold text-slate-400 uppercase">This Over</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {thisOver.length === 0 && <span className="tv-sub text-slate-600">—</span>}
                      {thisOver.map((ball: any) => (
                        <span
                          key={ball.id}
                          className={`min-w-[1.8em] px-2 py-0.5 rounded-xl text-center font-mono font-black tv-sub ${
                            ball.is_wicket
                              ? 'bg-rose-600 text-white'
                              : ball.runs_scored >= 4
                                ? 'bg-emerald-600 text-white'
                                : ball.extras !== 'none'
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'bg-slate-900 text-slate-300 border border-slate-800'
                          }`}
                        >
                          {ballLabel(ball)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="shrink-0 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-4">
        <div className="flex items-center gap-2 tv-label text-slate-500 shrink-0">
          <span>KickWick Live Score</span>
          {/* Honest about the connection, so whoever runs the screen can tell a
              dead gateway from a quiet over. */}
          {socketLive
            ? <span className="text-emerald-400 font-bold">• Live Sync</span>
            : <span className="text-amber-400 font-bold animate-pulse-subtle">• Reconnecting…</span>}
        </div>
      </footer>
    </div>
  );
};

/** A red card per player a side has had sent off, beside its name. */
const RedCards: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? (
    <span className="inline-flex gap-1 ml-3 align-middle" aria-label={`${count} sent off`}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="inline-block w-[0.45em] h-[0.65em] rounded-[0.08em] bg-rose-600" />
      ))}
    </span>
  ) : null;

/**
 * One batter at the crease: their name, then the only figures worth reading
 * from a distance — runs off balls, with the rest a size down.
 */
const BatterLine: React.FC<{
  name: string;
  card?: ScorecardBattingRow;
  onStrike?: boolean;
}> = ({ name, card, onStrike }) => (
  <div className="min-w-0">
    <div className="tv-name font-black font-heading text-white">
      {name}
      {onStrike && <span className="text-emerald-400"> *</span>}
    </div>

    <div className="flex items-baseline gap-3 mt-1">
      <span className={`tv-headline font-black font-mono ${onStrike ? 'text-emerald-400' : 'text-slate-300'}`}>
        {card ? card.runs : 0}
      </span>
      <span className="tv-sub font-mono font-bold text-slate-400">({card ? card.balls : 0})</span>
    </div>

    {card && (
      <div className="tv-label uppercase text-slate-500 mt-0.5">
        SR <span className="font-mono text-slate-300">{card.strike_rate}</span>
        {' • '}4s <span className="font-mono text-slate-300">{card.fours}</span>
        {' • '}6s <span className="font-mono text-slate-300">{card.sixes}</span>
      </div>
    )}
  </div>
);

const ANNOUNCEMENT_LABELS: Record<Announcement['type'], string> = {
  general: 'Announcement',
  urgent_match_delay: 'Match Delay',
  venue_change: 'Venue Change',
  registration_alert: 'Registration',
};

/**
 * An ad or announcement across the whole display. Sized off the viewport like
 * the rest of the screen, so it reads from the far stand.
 */
const FullScreenItem: React.FC<{
  kind: 'ad' | 'announcement';
  item: Advertisement | Announcement;
  secondsLeft: number | null;
}> = ({ kind, item, secondsLeft }) => {
  const countdown = secondsLeft !== null && (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/80 border border-slate-700 tv-label font-mono font-bold text-slate-200">
      <Clock className="w-4 h-4" />
      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
    </span>
  );

  if (kind === 'announcement') {
    const announcement = item as Announcement;
    const urgent = announcement.type === 'urgent_match_delay' || announcement.type === 'venue_change';

    return (
      <div className={`tv-flash-backdrop absolute inset-0 z-[100] flex flex-col items-center justify-center p-[5vw] text-center ${
        urgent ? 'bg-gradient-to-br from-rose-950 via-slate-950 to-rose-950' : 'bg-gradient-to-br from-slate-950 via-[#0d1430] to-slate-950'
      }`}>
        <div className="absolute top-[3vh] right-[3vw]">{countdown}</div>

        <span className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border tv-sub font-black uppercase tracking-widest ${
          urgent ? 'bg-rose-500/20 border-rose-400/50 text-rose-300' : 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
        }`}>
          <Radio className="w-6 h-6" />
          {ANNOUNCEMENT_LABELS[announcement.type] ?? 'Announcement'}
        </span>

        <h2 className="tv-headline font-black font-heading text-white mt-[4vh] max-w-[90vw] [overflow-wrap:anywhere]">
          {announcement.title}
        </h2>
        <p className="tv-team font-bold text-slate-200 mt-[3vh] max-w-[80vw] leading-snug [overflow-wrap:anywhere]">
          {announcement.message}
        </p>
      </div>
    );
  }

  const ad = item as Advertisement;

  return (
    <div className="tv-flash-backdrop absolute inset-0 z-[100] bg-black flex flex-col">
      <div className="relative flex-1 min-h-0">
        {ad.media_url && (
          <img src={ad.media_url} alt={ad.title} className="absolute inset-0 w-full h-full object-contain" />
        )}
        <div className="absolute top-[3vh] left-[3vw] inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/90 text-slate-950 tv-label font-black uppercase">
          <Sparkles className="w-4 h-4" />
          Sponsor
        </div>
        <div className="absolute top-[3vh] right-[3vw]">{countdown}</div>
      </div>

      <div className="shrink-0 px-[3vw] py-[2.5vh] bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-6">
        <div className="min-w-0">
          <h3 className="tv-team font-black text-white font-heading truncate">{ad.business_name}</h3>
          <p className="tv-sub font-semibold text-amber-300 truncate">{ad.title}</p>
          {ad.description && <p className="tv-body text-slate-400 truncate">{ad.description}</p>}
        </div>
        <div className="text-right shrink-0 space-y-1">
          {ad.phone && (
            <div className="tv-sub font-mono font-bold text-emerald-400 flex items-center justify-end gap-2">
              <Phone className="w-5 h-5" />
              {ad.phone}
            </div>
          )}
          {ad.website && (
            <div className="tv-body text-slate-400 flex items-center justify-end gap-2">
              <Globe className="w-4 h-4" />
              {ad.website.replace(/^https?:\/\//, '')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
