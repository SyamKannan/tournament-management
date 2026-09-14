import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type {
  Match, FootballMatchState, CricketMatchState, Team, Player,
  MatchLineupEntry, ScorecardInnings, ScoreboardState,
} from '../../types';
import { websocketUrl } from '../../config';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { TossPanel } from '../../components/TossPanel';
import { BigScreenDirector } from '../../components/BigScreenDirector';
import { MatchLineupEditor } from '../../components/MatchLineupEditor';
import { CreasePanel } from '../../components/CreasePanel';
import { WicketDialog, type WicketDetails } from '../../components/WicketDialog';
import { CricketScorecardTables } from '../../components/CricketScorecardTables';
import { SelectPlayerDialog } from '../../components/SelectPlayerDialog';
import { MatchExport } from '../../components/MatchExport';
import {
  Play, Pause, RotateCcw, Tv, Radio, Coins, Users, ClipboardList, MonitorPlay,
} from 'lucide-react';

/** What the scorer has armed for the next delivery. */
type ExtraType = 'none' | 'wide' | 'no_ball' | 'bye' | 'leg_bye';

const EXTRA_LABELS: Record<Exclude<ExtraType, 'none'>, string> = {
  wide: 'Wide',
  no_ball: 'No Ball',
  bye: 'Bye',
  leg_bye: 'Leg Bye',
};

/**
 * The console is split into three so the scorer isn't scrolling past setup
 * panels to reach the keypad between balls. Scoring is the tab they live in;
 * the other two are opened once and left alone.
 */
type ConsoleTab = 'scoring' | 'setup' | 'screen';

const TABS: { id: ConsoleTab; label: string; icon: React.ElementType }[] = [
  { id: 'scoring', label: 'Scoring', icon: ClipboardList },
  { id: 'setup', label: 'Toss & Squads', icon: Coins },
  { id: 'screen', label: 'Big Screen & Export', icon: MonitorPlay },
];

interface MatchPayload {
  match: Match;
  tournament: any;
  team_a: Team & { players: Player[] };
  team_b: Team & { players: Player[] };
  football_state?: FootballMatchState;
  cricket_state?: CricketMatchState;
  lineups: MatchLineupEntry[];
  scorecard: ScorecardInnings[];
  scoreboard: ScoreboardState;
}

export const OrgLiveScorerPage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const { matchId } = useParams<{ matchId: string }>();
  const [matchData, setMatchData] = useState<MatchPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ConsoleTab>('scoring');
  const [tabChosen, setTabChosen] = useState(false);
  const [activeScoringTeam, setActiveScoringTeam] = useState<'A' | 'B'>('A');

  // Football Event state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [selectedAssistId, _setSelectedAssistId] = useState<string>('');
  const [eventMinute, setEventMinute] = useState<number>(25);

  // Cricket delivery state. The crease is held locally because nothing is
  // written until a ball is recorded — the server only learns who is batting
  // and bowling from the delivery itself.
  const [crease, setCrease] = useState<{ striker: string; nonStriker: string; bowler: string }>({
    striker: '', nonStriker: '', bowler: '',
  });
  const [armedExtra, setArmedExtra] = useState<ExtraType>('none');
  const [wicketOpen, setWicketOpen] = useState(false);
  // The prompt the scorer waved away, so "choose later" isn't re-asked on
  // every render — a new one is raised as soon as the match needs a different
  // player.
  const [promptDismissed, setPromptDismissed] = useState<string | null>(null);
  // The crease as the server last reported it, so a refetch can tell a real
  // change (adopt it) from the same stale value arriving again (ignore it).
  const serverCreaseRef = useRef({ striker: '', nonStriker: '', bowler: '' });
  const [commentary, setCommentary] = useState<string>('');

  const fetchMatch = async () => {
    try {
      const res: MatchPayload = await api.get(`/matches/${matchId || 'match-fb-live-1'}`);
      setMatchData(res);

      if (res.football_state) {
        setEventMinute(res.football_state.match_minute || 25);
      }
      if (res.team_a?.players?.length > 0 && !selectedPlayerId) {
        setSelectedPlayerId(res.team_a.players[0].id);
      }

      // Open on whatever still needs doing, but only before the scorer has
      // picked a tab themselves — nothing is more annoying than a screen that
      // jumps while you are working.
      if (!tabChosen) {
        setTab(res.match.sport_code === 'cricket' && !res.match.toss_decision ? 'setup' : 'scoring');
      }

      // The server's crease is adopted only where it has *changed* since the
      // last fetch — a ball rotated the strike, an undo restored the ends, or
      // another device switched innings. Otherwise the scorer's own pick
      // stands. "Server wins whenever set" would undo a choice the moment any
      // unrelated refetch landed: after a wicket the server still names the
      // dismissed batter, and at over end the bowler who just finished, until
      // the next ball is recorded.
      const server = {
        striker: res.cricket_state?.current_striker_id || '',
        nonStriker: res.cricket_state?.current_non_striker_id || '',
        bowler: res.cricket_state?.current_bowler_id || '',
      };
      const seen = serverCreaseRef.current;

      setCrease(previous => ({
        striker: server.striker !== seen.striker ? server.striker : previous.striker,
        nonStriker: server.nonStriker !== seen.nonStriker ? server.nonStriker : previous.nonStriker,
        bowler: server.bowler !== seen.bowler ? server.bowler : previous.bowler,
      }));
      serverCreaseRef.current = server;
    } catch (err) {
      console.error('Failed to load live match', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMatch();
  }, [matchId]);

  // Two officials often work one match from separate devices, and the toss and
  // the big screen are driven from here as well. Listening on the match room
  // keeps this console honest about what the others have already recorded.
  const matchIdRef = useRef(matchId);
  useEffect(() => { matchIdRef.current = matchId; }, [matchId]);

  useEffect(() => {
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(websocketUrl());

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'SUBSCRIBE', room: `match:${matchIdRef.current}` }));
      };

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          if ([
            'SCORE_UPDATED', 'MATCH_STATUS_CHANGED', 'LINEUP_UPDATED', 'SCOREBOARD_STAGE_CHANGED',
            'TOSS_CALLED', 'TOSS_DECIDED', 'TOSS_RECORDED', 'TOSS_RESET',
          ].includes(msg.type)) {
            fetchMatch();
          }
        } catch (e) {}
      };
    } catch (err) {}

    return () => { ws?.close(); };
  }, [matchId]);

  /* =========================================================================
   * FOOTBALL ACTIONS
   * ========================================================================= */
  const handleAddFootballGoal = async () => {
    if (!matchData) return;
    const targetTeam = activeScoringTeam === 'A' ? matchData.team_a : matchData.team_b;
    try {
      await api.post(`/matches/${matchData.match.id}/football/event`, {
        team_id: targetTeam.id,
        player_id: selectedPlayerId || targetTeam.players?.[0]?.id,
        assist_player_id: selectedAssistId || undefined,
        event_type: 'goal',
        minute: eventMinute
      });
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record goal');
    }
  };

  const handleAddFootballCard = async (type: 'yellow_card' | 'red_card') => {
    if (!matchData) return;
    const targetTeam = activeScoringTeam === 'A' ? matchData.team_a : matchData.team_b;
    try {
      await api.post(`/matches/${matchData.match.id}/football/event`, {
        team_id: targetTeam.id,
        player_id: selectedPlayerId || targetTeam.players?.[0]?.id,
        event_type: type,
        minute: eventMinute
      });
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record card');
    }
  };

  const handleFootballTimer = async (action: 'start' | 'pause' | 'set_half' | 'finish', payload?: any) => {
    if (!matchData) return;
    try {
      await api.post(`/matches/${matchData.match.id}/football/timer`, {
        action,
        half: payload?.half,
        minute: eventMinute
      });
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update timer');
    }
  };

  const handleFootballUndo = async () => {
    if (!matchData) return;
    try {
      await api.post(`/matches/${matchData.match.id}/football/undo`);
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to undo event');
    }
  };

  /* =========================================================================
   * CRICKET ACTIONS
   * ========================================================================= */

  /**
   * Turn the armed extra and the tapped runs into the two figures the API
   * keeps apart: what the batter earned, and what the team was given.
   *
   * A wide or a no-ball carries a one-run penalty on top of anything run; byes
   * and leg-byes are all extras and none of them the batter's.
   */
  const splitRuns = (runs: number, extra: ExtraType) => {
    switch (extra) {
      case 'wide': return { runs_scored: 0, extras_runs: 1 + runs };
      case 'no_ball': return { runs_scored: runs, extras_runs: 1 };
      case 'bye':
      case 'leg_bye': return { runs_scored: 0, extras_runs: Math.max(runs, 1) };
      default: return { runs_scored: runs, extras_runs: 0 };
    }
  };

  const postDelivery = async (runs: number, extra: ExtraType, wicket?: WicketDetails) => {
    if (!matchData?.cricket_state) return;
    const split = splitRuns(wicket ? wicket.runs_scored : runs, extra);

    try {
      await api.post(`/matches/${matchData.match.id}/cricket/ball`, {
        innings: matchData.cricket_state.current_innings,
        ...split,
        extras: extra,
        is_wicket: Boolean(wicket),
        wicket_type: wicket?.wicket_type,
        dismissed_player_id: wicket?.dismissed_player_id,
        fielder_id: wicket?.fielder_id,
        next_striker_id: wicket?.next_striker_id,
        striker_id: crease.striker,
        non_striker_id: crease.nonStriker,
        bowler_id: effectiveBowlerId,
        commentary: commentary || undefined,
      });
      setCommentary('');
      setArmedExtra('none');
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record delivery');
    }
  };

  const handleCricketUndo = async () => {
    if (!matchData) return;
    try {
      await api.post(`/matches/${matchData.match.id}/cricket/undo`);
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to undo ball');
    }
  };

  const handleSwitchInnings = async () => {
    if (!matchData) return;
    const proceed = await confirm({
      title: 'Switch to the second innings?',
      message: 'The target is set from the first innings total and the batting sides swap.',
      confirmLabel: 'Start second innings',
    });
    if (!proceed) return;
    try {
      await api.post(`/matches/${matchData.match.id}/cricket/switch-innings`);
      setCrease({ striker: '', nonStriker: '', bowler: '' });
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to switch innings');
    }
  };

  const handleFinishMatch = async () => {
    if (!matchData) return;
    const proceed = await confirm({
      title: 'Finish the match now?',
      message: 'The result is settled on the runs as they stand. A chase that is reached, bowled out or runs out of overs finishes by itself — use this for a declaration or when play cannot continue.',
      confirmLabel: 'Finish match',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      await api.post(`/matches/${matchData.match.id}/cricket/finish`);
      fetchMatch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to finish the match');
    }
  };

  const openTab = (next: ConsoleTab) => {
    setTab(next);
    setTabChosen(true);
  };

  if (loading || !matchData) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span>Connecting to Scorer Engine...</span>
      </div>
    );
  }

  const { match, tournament, team_a, team_b, football_state, cricket_state, scoreboard } = matchData;
  const isFootball = match.sport_code === 'football';
  const scoringTeam = activeScoringTeam === 'A' ? team_a : team_b;
  const lineups = matchData.lineups ?? [];

  /* ----------------------------------------------------------- Cricket view */

  const innings = cricket_state?.current_innings ?? 1;
  const inningsDeliveries = (cricket_state?.deliveries || []).filter(ball => ball.innings === innings);
  const legalBalls = inningsDeliveries.filter(ball => ball.extras !== 'wide' && ball.extras !== 'no_ball').length;

  // `team_a_*` on the state row is the first innings, not team A — which side
  // that is was decided by the toss.
  const inningsRuns = (innings === 2 ? cricket_state?.team_b_runs : cricket_state?.team_a_runs) ?? 0;
  const inningsWickets = (innings === 2 ? cricket_state?.team_b_wickets : cricket_state?.team_a_wickets) ?? 0;
  const inningsOvers = (innings === 2 ? cricket_state?.team_b_overs : cricket_state?.team_a_overs) ?? 0;

  const battingTeam = cricket_state?.batting_team_id === team_b.id ? team_b : team_a;
  const bowlingTeam = battingTeam.id === team_a.id ? team_b : team_a;

  const playingFor = (teamId: string) =>
    lineups.filter(row => row.team_id === teamId && row.is_playing);

  const batters = playingFor(battingTeam.id);
  const fielders = playingFor(bowlingTeam.id);

  const dismissedIds = inningsDeliveries
    .filter(ball => ball.is_wicket)
    .map(ball => ball.dismissed_player_id || ball.striker_id)
    .filter(Boolean) as string[];

  // A completed over means a different bowler, so the one who just finished is
  // withheld until the scorer names someone else.
  const overComplete = legalBalls > 0 && legalBalls % 6 === 0;
  const lastBowlerId = inningsDeliveries[inningsDeliveries.length - 1]?.bowler_id;
  const bowlerOptions = overComplete ? fielders.filter(row => row.player_id !== lastBowlerId) : fielders;
  const effectiveBowlerId = overComplete && crease.bowler === lastBowlerId ? '' : crease.bowler;

  const creaseReady = Boolean(
    crease.striker && crease.nonStriker && effectiveBowlerId &&
    !dismissedIds.includes(crease.striker) &&
    !dismissedIds.includes(crease.nonStriker)
  );

  // When an innings or the match is over, the keypad stops. The engine ends
  // the chase by itself; the first innings needs the scorer to start the
  // second, and recording a ball past the end would corrupt both totals.
  const totalOvers = cricket_state?.total_overs ?? 20;
  const allOutAt = batters.length > 1 ? batters.length - 1 : 10;
  const matchFinished = match.status === 'completed';
  const firstInningsOver = innings === 1 && (legalBalls >= totalOvers * 6 || inningsWickets >= allOutAt);
  const scoringLocked = matchFinished || firstInningsOver;
  const canScore = creaseReady && !scoringLocked;

  const currentCard = (matchData.scorecard || []).find(card => card.innings === innings);

  const currentOver = inningsDeliveries.length
    ? Math.max(...inningsDeliveries.map(ball => ball.over_number))
    : 0;
  const thisOver = inningsDeliveries.filter(ball => ball.over_number === currentOver);

  const ballLabel = (ball: any) => {
    if (ball.is_wicket) return 'W';
    const runs = ball.runs_scored + (ball.extras_runs || 0);
    if (ball.extras && ball.extras !== 'none') {
      return `${runs}${ball.extras === 'wide' ? 'wd' : ball.extras === 'no_ball' ? 'nb' : 'b'}`;
    }
    return ball.runs_scored === 0 ? '•' : String(ball.runs_scored);
  };

  const playerName = (playerId?: string | null) => {
    if (!playerId) return '—';
    const player = [...(team_a.players || []), ...(team_b.players || [])].find(p => p.id === playerId);
    return player?.full_name || '—';
  };

  /*
   * What the match is waiting on, if anything.
   *
   * Worked out from state rather than raised by an event, so it is right
   * however the gap appeared — a wicket where nobody named the next batter, an
   * over that just ended, an innings that has only just started, or a console
   * reopened halfway through. The order matters: both ends are filled before a
   * bowler is asked for.
   */
  const pendingChoice = (() => {
    if (isFootball || !match.toss_decision || scoringLocked) return null;

    const needsStriker = !crease.striker || dismissedIds.includes(crease.striker);
    const needsNonStriker = !crease.nonStriker || dismissedIds.includes(crease.nonStriker);

    const availableBatters = batters.filter(row =>
      !dismissedIds.includes(row.player_id) &&
      row.player_id !== crease.striker &&
      row.player_id !== crease.nonStriker);

    if (needsStriker) {
      return {
        field: 'striker' as const,
        tone: 'emerald' as const,
        title: inningsDeliveries.length === 0 ? 'Who opens the batting?' : 'Who is the next batter in?',
        subtitle: 'They take strike. Scoring stays locked until both ends are filled.',
        options: availableBatters,
      };
    }

    if (needsNonStriker) {
      return {
        field: 'nonStriker' as const,
        tone: 'emerald' as const,
        title: 'Who is at the other end?',
        subtitle: `Batting with ${playerName(crease.striker)}.`,
        options: availableBatters,
      };
    }

    if (overComplete && !effectiveBowlerId) {
      return {
        field: 'bowler' as const,
        tone: 'cyan' as const,
        title: 'Who bowls the next over?',
        subtitle: lastBowlerId
          ? `${playerName(lastBowlerId)} has just finished and cannot bowl again.`
          : undefined,
        options: bowlerOptions,
      };
    }

    if (!effectiveBowlerId) {
      return {
        field: 'bowler' as const,
        tone: 'cyan' as const,
        title: 'Who takes the ball?',
        subtitle: 'Every delivery is recorded against the bowler you name.',
        options: bowlerOptions,
      };
    }

    return null;
  })();

  // A key that changes whenever the match needs a *different* player, so a
  // prompt the scorer waved away doesn't come straight back, but the next one
  // still does.
  const pendingKey = pendingChoice
    ? `${pendingChoice.field}:${innings}:${legalBalls}:${dismissedIds.length}`
    : null;


  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-8">
      {/* Top Scorer Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-3xl glass-panel border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>LIVE OFFICIAL SCORER CONSOLE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            </div>
            <h1 className="text-lg font-black font-heading text-white">{match.round_name} • {tournament.name}</h1>
          </div>
        </div>

        <Link
          to={`/scoreboard/match/${match.id}`}
          target="_blank"
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 border border-slate-700"
        >
          <Tv className="w-3.5 h-3.5 text-emerald-400" />
          <span>Open Big Screen TV ↗</span>
        </Link>
      </div>

      {/* Where the match stands. Sticky so the scoreline, the crease and the
          over in progress stay in view however far down the tab is scrolled. */}
      <div className="sticky top-2 z-20 p-4 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-2 border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400 uppercase truncate">
              {isFootball ? team_a.name : `${battingTeam.name} batting`}
            </div>
            <div className="font-mono text-3xl sm:text-4xl font-black text-amber-400 leading-none mt-0.5">
              {isFootball
                ? `${football_state?.team_a_score ?? 0} : ${football_state?.team_b_score ?? 0}`
                : `${inningsRuns}/${inningsWickets}`}
            </div>
          </div>

          <div className="text-center shrink-0">
            <div className="text-[11px] font-semibold text-slate-400 uppercase">
              {isFootball ? 'Minute' : `Over ${inningsOvers}`}
            </div>
            <div className="font-mono text-lg font-bold text-white">
              {isFootball
                ? `${football_state?.match_minute ?? 0}'`
                : `CRR ${cricket_state?.current_run_rate ?? 0}`}
            </div>
          </div>

          <div className="min-w-0 text-right">
            <div className="text-[11px] font-semibold text-slate-400 uppercase truncate">
              {isFootball ? team_b.name : `${bowlingTeam.name} bowling`}
            </div>
            {!isFootball && (
              <div className="text-xs font-bold text-white truncate mt-1">
                {playerName(crease.striker)} <span className="text-emerald-400">*</span>
                <span className="text-slate-600"> / </span>
                {playerName(crease.nonStriker)}
              </div>
            )}
          </div>
        </div>

        {/* This over, always visible */}
        {!isFootball && match.toss_decision && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">This over</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {thisOver.length === 0 && <span className="text-xs text-slate-600">—</span>}
              {thisOver.map(ball => (
                <span
                  key={ball.id}
                  className={`min-w-[1.9rem] px-1.5 py-0.5 rounded-lg text-center font-mono text-xs font-black ${
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
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const needsSetup = id === 'setup' && !isFootball && !match.toss_decision;
          return (
            <button
              key={id}
              onClick={() => openTab(id)}
              className={`py-3 px-2 rounded-2xl border text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
                tab === id
                  ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {needsSetup && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ SETUP */}
      {tab === 'setup' && (
        <div className="space-y-4">
          {!isFootball && (
            <TossPanel match={match} teamA={team_a} teamB={team_b} onUpdated={() => fetchMatch()} />
          )}

          <MatchLineupEditor
            matchId={match.id}
            teams={[team_a, team_b]}
            lineups={lineups}
            onSaved={fetchMatch}
          />
        </div>
      )}

      {/* ----------------------------------------------------------- SCREEN */}
      {tab === 'screen' && (
        <div className="space-y-4">
          <BigScreenDirector
            matchId={match.id}
            sport={match.sport_code}
            scoreboard={scoreboard}
            revealTotal={lineups.filter(row => row.is_playing).length}
            onChanged={fetchMatch}
          />

          <MatchExport
            match={match}
            tournamentName={tournament?.name || 'Match'}
            teamA={team_a}
            teamB={team_b}
            cricketState={cricket_state}
            footballState={football_state}
            scorecard={matchData.scorecard}
          />
        </div>
      )}

      {/* ---------------------------------------------------------- SCORING */}
      {tab === 'scoring' && isFootball && (
        <div className="grid md:grid-cols-12 gap-4">
          <div className="md:col-span-7 space-y-4">
            <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Select Scoring Team
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setActiveScoringTeam('A'); setSelectedPlayerId(team_a.players?.[0]?.id || ''); }}
                    className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all ${
                      activeScoringTeam === 'A'
                        ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {team_a.name}
                  </button>
                  <button
                    onClick={() => { setActiveScoringTeam('B'); setSelectedPlayerId(team_b.players?.[0]?.id || ''); }}
                    className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all ${
                      activeScoringTeam === 'B'
                        ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {team_b.name}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Goal Scorer / Player</label>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl glass-input bg-slate-900 text-white"
                  >
                    {scoringTeam.players?.map(p => (
                      <option key={p.id} value={p.id}>
                        #{p.jersey_number} {p.full_name} ({p.football_position || 'Forward'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Match Minute</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={eventMinute}
                    onChange={(e) => setEventMinute(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl glass-input font-mono font-bold text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleAddFootballGoal}
                  className="py-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
                >
                  <span className="text-xl">⚽</span>
                  <span>RECORD GOAL</span>
                </button>

                <button
                  onClick={() => handleAddFootballCard('yellow_card')}
                  className="py-5 rounded-2xl bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <span className="text-lg">🟨</span>
                  <span>YELLOW CARD</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAddFootballCard('red_card')}
                  className="py-4 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <span className="text-lg">🟥</span>
                  <span>RED CARD</span>
                </button>

                <button
                  onClick={handleFootballUndo}
                  className="py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                  <span>UNDO LAST EVENT</span>
                </button>
              </div>
            </div>
          </div>

          <div className="md:col-span-5 space-y-4">
            <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Match Timer & Clock Control
              </h3>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-3xl font-black font-mono text-white tracking-tight">
                  {football_state?.match_minute ?? 0}' : 00"
                </div>
                <div className="text-xs text-emerald-400 font-semibold mt-1">
                  {football_state?.is_timer_running ? '🟢 Clock Running' : '⏸️ Clock Paused'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleFootballTimer('start')}
                  className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Clock</span>
                </button>
                <button
                  onClick={() => handleFootballTimer('pause')}
                  className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause Clock</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <button
                  onClick={() => handleFootballTimer('set_half', { half: '2' })}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-800"
                >
                  Start 2nd Half (45')
                </button>
                <button
                  onClick={() => handleFootballTimer('finish')}
                  className="w-full py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-bold text-xs border border-rose-600/30"
                >
                  Full Time (Final Whistle 🏁)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cricket scoring is locked until the toss is recorded, matching the
          backend's 422 on /cricket/ball without a toss_decision. */}
      {tab === 'scoring' && !isFootball && !match.toss_decision && (
        <div className="p-8 rounded-3xl glass-panel border border-slate-800 text-center space-y-3">
          <Coins className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-sm text-slate-400">The coin toss decides who bats first, so scoring waits on it.</p>
          <button
            onClick={() => openTab('setup')}
            className="px-4 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs"
          >
            Go to the toss →
          </button>
        </div>
      )}

      {tab === 'scoring' && !isFootball && match.toss_decision && (
        <div className="space-y-4">
          <CreasePanel
            batters={batters}
            bowlers={bowlerOptions}
            strikerId={crease.striker}
            nonStrikerId={crease.nonStriker}
            bowlerId={effectiveBowlerId}
            dismissedIds={dismissedIds}
            onChange={(field, playerId) => setCrease(previous => ({ ...previous, [field]: playerId }))}
            onSwap={() => setCrease(previous => ({
              ...previous,
              striker: previous.nonStriker,
              nonStriker: previous.striker,
            }))}
          />

          <div className="p-5 sm:p-6 rounded-3xl glass-panel border border-slate-800 space-y-5">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase">Ball-by-Ball Scorer</span>
                <h3 className="text-lg font-bold text-white font-heading">Innings {innings}</h3>
              </div>
              <div className="flex items-center gap-2">
                {innings === 1 ? (
                  <button
                    onClick={handleSwitchInnings}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs"
                  >
                    Switch Innings →
                  </button>
                ) : !matchFinished && (
                  <button
                    onClick={handleFinishMatch}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-xs"
                  >
                    Finish Match
                  </button>
                )}
                <button
                  onClick={handleCricketUndo}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo Ball</span>
                </button>
              </div>
            </div>

            {matchFinished && (
              <div className="px-4 py-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 space-y-1">
                <div className="text-xs font-black uppercase tracking-wider text-emerald-300">Match complete</div>
                <div className="text-base font-bold text-white">{match.result_summary || 'Result recorded'}</div>
                <div className="text-xs text-slate-400">
                  The big screen is showing the full scorecard. Undo Ball reopens the match if the last ball was wrong.
                </div>
              </div>
            )}

            {firstInningsOver && (
              <div className="px-4 py-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-300">First innings complete</div>
                  <div className="text-sm font-bold text-white">
                    {battingTeam.name} {inningsRuns}/{inningsWickets} — {bowlingTeam.name} need {inningsRuns + 1} to win
                  </div>
                </div>
                <button
                  onClick={handleSwitchInnings}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-500 text-amber-950 font-black text-xs"
                >
                  Start Second Innings →
                </button>
              </div>
            )}

            {overComplete && !effectiveBowlerId && !scoringLocked && (
              <div className="px-4 py-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 text-xs font-bold flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0" />
                <span>Over complete — name the next bowler above. The bowler who just finished can't bowl again.</span>
              </div>
            )}

            {/* Arm an extra before tapping the runs, so a wide that goes for
                four or a no-ball hit for six is one action, not a guess. */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Delivery Type
              </label>
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={() => setArmedExtra('none')}
                  className={`py-3 px-1 rounded-xl border text-[11px] font-bold uppercase ${
                    armedExtra === 'none'
                      ? 'bg-emerald-500/20 border-emerald-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Legal
                </button>
                {(Object.keys(EXTRA_LABELS) as (keyof typeof EXTRA_LABELS)[]).map(extra => (
                  <button
                    key={extra}
                    onClick={() => setArmedExtra(armedExtra === extra ? 'none' : extra)}
                    className={`py-3 px-1 rounded-xl border text-[11px] font-bold uppercase ${
                      armedExtra === extra
                        ? 'bg-cyan-500/20 border-cyan-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-cyan-400'
                    }`}
                  >
                    {EXTRA_LABELS[extra]}
                  </button>
                ))}
              </div>
            </div>

            {/* Runs Keypad — deliberately large; this is tapped on a phone at
                the boundary rope between every ball. */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {armedExtra === 'none'
                  ? 'Runs Scored Off Delivery'
                  : armedExtra === 'no_ball'
                    ? 'Runs Off The Bat (no-ball penalty added)'
                    : `Runs Run (${EXTRA_LABELS[armedExtra]})`}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {[0, 1, 2, 3, 4, 6].map(runs => (
                  <button
                    key={runs}
                    disabled={!canScore}
                    onClick={() => postDelivery(runs, armedExtra)}
                    className={`py-7 rounded-2xl font-mono text-3xl font-black shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed ${
                      runs === 4 ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-500/20' :
                      runs === 6 ? 'bg-gradient-to-tr from-amber-600 to-yellow-500 text-white shadow-amber-500/20' :
                      'bg-slate-900 border border-slate-800 text-white hover:bg-slate-800'
                    }`}
                  >
                    {runs}
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={!canScore}
              onClick={() => setWicketOpen(true)}
              className="w-full py-5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-base shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              OUT — RECORD A WICKET
            </button>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Commentary (optional)
              </label>
              <input
                value={commentary}
                onChange={event => setCommentary(event.target.value)}
                placeholder="Edged past slip for four…"
                className="w-full px-3 py-2.5 rounded-xl glass-input bg-slate-900 text-white text-xs"
              />
            </div>
          </div>

          {/* The card the crowd is seeing, in front of the scorer too. */}
          <CricketScorecardTables
            card={currentCard}
            strikerId={crease.striker}
            bowlerId={effectiveBowlerId}
          />
        </div>
      )}

      {/* The console asks for the player it is waiting on rather than leaving
          the scorer to notice a locked keypad. */}
      {pendingChoice && pendingKey !== promptDismissed && !wicketOpen && (
        <SelectPlayerDialog
          title={pendingChoice.title}
          subtitle={pendingChoice.subtitle}
          options={pendingChoice.options}
          tone={pendingChoice.tone}
          onSelect={playerId => setCrease(previous => ({ ...previous, [pendingChoice.field]: playerId }))}
          onCancel={() => setPromptDismissed(pendingKey)}
        />
      )}

      {wicketOpen && (
        <WicketDialog
          batters={batters}
          fielders={fielders}
          strikerId={crease.striker}
          nonStrikerId={crease.nonStriker}
          dismissedIds={dismissedIds}
          onCancel={() => setWicketOpen(false)}
          onConfirm={details => {
            setWicketOpen(false);
            postDelivery(0, armedExtra, details);
          }}
        />
      )}
    </div>
  );
};
