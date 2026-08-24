import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Match, FootballMatchState, CricketMatchState, Team, Player } from '../../types';
import { 
  Play, Pause, RotateCcw, Flame, ShieldCheck, 
  Tv, Award, Users, AlertCircle, Radio, Clock, Check
} from 'lucide-react';

export const OrgLiveScorerPage: React.FC = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const [matchData, setMatchData] = useState<{
    match: Match;
    tournament: any;
    team_a: Team & { players: Player[] };
    team_b: Team & { players: Player[] };
    football_state?: FootballMatchState;
    cricket_state?: CricketMatchState;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeScoringTeam, setActiveScoringTeam] = useState<'A' | 'B'>('A');

  // Football Event state
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [selectedAssistId, setSelectedAssistId] = useState<string>('');
  const [eventMinute, setEventMinute] = useState<number>(25);

  // Cricket Delivery state
  const [crickRuns, setCrickRuns] = useState<number>(0);
  const [crickExtras, setCrickExtras] = useState<string>('none');
  const [isWicket, setIsWicket] = useState<boolean>(false);
  const [wicketType, setWicketType] = useState<string>('bowled');
  const [commentary, setCommentary] = useState<string>('');

  const fetchMatch = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/matches/${matchId || 'match-fb-live-1'}`);
      setMatchData(res);
      if (res.football_state) {
        setEventMinute(res.football_state.match_minute || 25);
      }
      if (res.team_a?.players?.length > 0 && !selectedPlayerId) {
        setSelectedPlayerId(res.team_a.players[0].id);
      }
    } catch (err) {
      console.error('Failed to load live match', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatch();
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
      alert(err.message || 'Failed to record goal');
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
      alert(err.message || 'Failed to record card');
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
      alert(err.message || 'Failed to update timer');
    }
  };

  const handleFootballUndo = async () => {
    if (!matchData) return;
    try {
      await api.post(`/matches/${matchData.match.id}/football/undo`);
      fetchMatch();
    } catch (err: any) {
      alert(err.message || 'Failed to undo event');
    }
  };

  /* =========================================================================
   * CRICKET ACTIONS
   * ========================================================================= */
  const handleRecordCricketBall = async (runs: number, extrasType: string = 'none', wicket: boolean = false) => {
    if (!matchData) return;
    const crick = matchData.cricket_state;
    if (!crick) return;

    try {
      await api.post(`/matches/${matchData.match.id}/cricket/ball`, {
        innings: crick.current_innings,
        runs_scored: runs,
        extras: extrasType,
        is_wicket: wicket,
        wicket_type: wicket ? wicketType : undefined,
        striker_id: crick.current_striker_id,
        non_striker_id: crick.current_non_striker_id,
        bowler_id: crick.current_bowler_id,
        commentary: commentary || (wicket ? 'WICKET FALLS!' : runs === 4 ? 'FOUR runs hit!' : runs === 6 ? 'SIX runs maximum!' : `${runs} run scored`)
      });
      setCommentary('');
      fetchMatch();
    } catch (err: any) {
      alert(err.message || 'Failed to record delivery');
    }
  };

  const handleCricketUndo = async () => {
    if (!matchData) return;
    try {
      await api.post(`/matches/${matchData.match.id}/cricket/undo`);
      fetchMatch();
    } catch (err: any) {
      alert(err.message || 'Failed to undo ball');
    }
  };

  const handleSwitchInnings = async () => {
    if (!matchData) return;
    if (!confirm('Switch to 2nd Innings? Target will be calculated automatically.')) return;
    try {
      await api.post(`/matches/${matchData.match.id}/cricket/innings`);
      fetchMatch();
    } catch (err: any) {
      alert(err.message || 'Failed to switch innings');
    }
  };

  if (loading || !matchData) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span>Connecting to Scorer Engine...</span>
      </div>
    );
  }

  const { match, tournament, team_a, team_b, football_state, cricket_state } = matchData;
  const isFootball = match.sport_code === 'football';
  const scoringTeam = activeScoringTeam === 'A' ? team_a : team_b;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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

        <div className="flex items-center gap-2">
          <Link
            to={`/scoreboard/match/${match.id}`}
            target="_blank"
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 border border-slate-700"
          >
            <Tv className="w-3.5 h-3.5 text-emerald-400" />
            <span>Open Big Screen TV ↗</span>
          </Link>
        </div>
      </div>

      {/* Main Scoreboard Display Bar */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-2 border-slate-800 text-center shadow-2xl relative">
        <div className="grid grid-cols-12 items-center">
          {/* Team A */}
          <div className="col-span-5 text-right pr-4">
            <div className="text-xs font-semibold text-slate-400 uppercase">Team A</div>
            <h2 className="text-xl sm:text-2xl font-black font-heading text-white">{team_a.name}</h2>
          </div>

          {/* Center Score */}
          <div className="col-span-2 flex flex-col items-center">
            {isFootball ? (
              <div className="font-mono text-4xl sm:text-5xl font-black text-emerald-400">
                {football_state?.team_a_score || 0} : {football_state?.team_b_score || 0}
              </div>
            ) : (
              <div className="font-mono text-3xl sm:text-4xl font-black text-amber-400">
                {cricket_state?.team_a_runs || 86}/{cricket_state?.team_a_wickets || 2}
              </div>
            )}
            <div className="text-[11px] font-mono text-slate-400 mt-1">
              {isFootball ? `${football_state?.match_minute || 24}' Minute` : `Over ${cricket_state?.team_a_overs || 9.4}`}
            </div>
          </div>

          {/* Team B */}
          <div className="col-span-5 text-left pl-4">
            <div className="text-xs font-semibold text-slate-400 uppercase">Team B</div>
            <h2 className="text-xl sm:text-2xl font-black font-heading text-white">{team_b.name}</h2>
          </div>
        </div>
      </div>

      {/* FOOTBALL LIVE SCORER INTERFACE */}
      {isFootball && (
        <div className="grid md:grid-cols-12 gap-6">
          {/* Action Pad */}
          <div className="md:col-span-7 space-y-4">
            <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
              {/* Select Active Team */}
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

              {/* Player Selector & Minute */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Goal Scorer / Player</label>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
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
                    className="w-full px-3 py-2 rounded-xl glass-input font-mono font-bold text-center"
                  />
                </div>
              </div>

              {/* Event Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleAddFootballGoal}
                  className="py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
                >
                  <span className="text-xl">⚽</span>
                  <span>RECORD GOAL</span>
                </button>

                <button
                  onClick={() => handleAddFootballCard('yellow_card')}
                  className="py-4 rounded-2xl bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <span className="text-lg">🟨</span>
                  <span>YELLOW CARD</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAddFootballCard('red_card')}
                  className="py-3 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <span className="text-lg">🟥</span>
                  <span>RED CARD</span>
                </button>

                <button
                  onClick={handleFootballUndo}
                  className="py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                  <span>UNDO LAST EVENT</span>
                </button>
              </div>
            </div>
          </div>

          {/* Match Clock & Half Controls */}
          <div className="md:col-span-5 space-y-4">
            <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Match Timer & Clock Control
              </h3>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-3xl font-black font-mono text-white tracking-tight">
                  {football_state?.match_minute || 24}' : 00"
                </div>
                <div className="text-xs text-emerald-400 font-semibold mt-1">
                  {football_state?.is_timer_running ? '🟢 Clock Running' : '⏸️ Clock Paused'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleFootballTimer('start')}
                  className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Clock</span>
                </button>
                <button
                  onClick={() => handleFootballTimer('pause')}
                  className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause Clock</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <button
                  onClick={() => handleFootballTimer('set_half', { half: '2' })}
                  className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-800"
                >
                  Start 2nd Half (45')
                </button>
                <button
                  onClick={() => handleFootballTimer('finish')}
                  className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 font-bold text-xs border border-rose-600/30"
                >
                  Full Time (Final Whistle 🏁)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CRICKET LIVE SCORER INTERFACE */}
      {!isFootball && (
        <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase">Ball-by-Ball Cricket Scorer</span>
              <h3 className="text-lg font-bold text-white font-heading">Innings {cricket_state?.current_innings || 1}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSwitchInnings}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs"
              >
                Switch Innings →
              </button>
              <button
                onClick={handleCricketUndo}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo Ball</span>
              </button>
            </div>
          </div>

          {/* Runs Keypad */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Runs Scored Off Delivery
            </label>
            <div className="grid grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 6].map(runs => (
                <button
                  key={runs}
                  onClick={() => handleRecordCricketBall(runs)}
                  className={`py-4 rounded-2xl font-mono text-2xl font-black shadow-lg transition-all hover:scale-105 ${
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

          {/* Extras & Wickets */}
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Extras (+1 Run)</span>
              <div className="grid grid-cols-4 gap-2">
                {['wide', 'no_ball', 'bye', 'leg_bye'].map(ex => (
                  <button
                    key={ex}
                    onClick={() => handleRecordCricketBall(0, ex)}
                    className="py-2 px-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-bold text-cyan-400 uppercase"
                  >
                    {ex.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-rose-400 uppercase">Wicket Fall</span>
              <div className="flex gap-2">
                <select
                  value={wicketType}
                  onChange={(e) => setWicketType(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl glass-input text-xs bg-slate-900 text-white capitalize"
                >
                  <option value="bowled">Bowled</option>
                  <option value="caught">Caught</option>
                  <option value="lbw">LBW</option>
                  <option value="run_out">Run Out</option>
                  <option value="stumped">Stumped</option>
                </select>
                <button
                  onClick={() => handleRecordCricketBall(0, 'none', true)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-600/20"
                >
                  OUT (Wicket)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
