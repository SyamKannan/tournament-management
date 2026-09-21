import React, { useState } from 'react';
import { api } from '../services/api';
import { useToast } from './ui/Toast';
import type { Match, Team, TossDecision, TossResult } from '../types';
import { CoinFlip, COIN_FLIP_MS } from './CoinFlip';
import { TOSS_DECISIONS, tossDecisionPhrase } from '../lib/football';

interface TossPanelProps {
  match: Match;
  teamA: Team;
  teamB: Team;
  /** Called after any successful toss action so the parent can refetch the match. */
  onUpdated: (toss: TossResult) => void;
}

/**
 * Scorer controls for the pre-match coin toss — manual (the toss happened on
 * the ground: the scorer records the winner, their decision and, if noted, the
 * face the coin showed) or digital (the server flips at random and the away
 * side calls it). Locked out once the toss decision is in, matching the
 * server-side gate that gates cricket scoring on it.
 *
 * The winner's choice follows the sport: bat or bowl in cricket, the kick-off
 * or an end in football.
 */
export const TossPanel: React.FC<TossPanelProps> = ({ match, teamA, teamB, onUpdated }) => {
  const toast = useToast();
  const decisions = TOSS_DECISIONS[match.sport_code] ?? TOSS_DECISIONS.cricket;
  const isFootball = match.sport_code === 'football';
  // Manual first: most grounds toss a real coin and the scorer records what it
  // showed. The digital flip is the alternative, not the default.
  const [mode, setMode] = useState<'digital' | 'manual'>('manual');
  const [callerTeamId, setCallerTeamId] = useState(teamB.id);
  const [call, setCall] = useState<'heads' | 'tails'>('heads');
  const [manualWinnerId, setManualWinnerId] = useState(teamA.id);
  const [manualDecision, setManualDecision] = useState<TossDecision>(decisions[0].value);
  const [manualResult, setManualResult] = useState<'' | 'heads' | 'tails'>('');
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipResult, setFlipResult] = useState<'heads' | 'tails' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const teamName = (teamId?: string | null) =>
    teamId === teamA.id ? teamA.name : teamId === teamB.id ? teamB.name : teamId || '—';

  const handleFlip = async () => {
    if (submitting) return;
    setSubmitting(true);
    // Spin straight away on the click; the coin keeps turning until the
    // server's result arrives, then settles onto that face.
    setFlipResult(null);
    setIsFlipping(true);
    try {
      const result = await api.post<TossResult>(`/matches/${match.id}/toss/call`, {
        team_id: callerTeamId,
        call,
      });
      setFlipResult(result.toss_result);
      setTimeout(() => {
        setIsFlipping(false);
        onUpdated(result);
      }, COIN_FLIP_MS);
    } catch (err: any) {
      setIsFlipping(false);
      toast.error(err.message || 'Failed to flip the coin');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (decision: TossDecision) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await api.post<TossResult>(`/matches/${match.id}/toss/decision`, { decision });
      onUpdated(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record the toss decision');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManual = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await api.post<TossResult>(`/matches/${match.id}/toss/manual`, {
        winner_team_id: manualWinnerId,
        decision: manualDecision,
        toss_result: manualResult || null,
      });
      onUpdated(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record the toss');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await api.post<TossResult>(`/matches/${match.id}/toss/reset`);
      onUpdated(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset the toss');
    } finally {
      setSubmitting(false);
    }
  };

  // Retrying is only ever safe before the match has actually started —
  // the server rejects a reset once the first ball has flipped the status
  // away from `scheduled`, so don't offer a button that would just 400.
  const canRetry = match.status === 'scheduled';

  // Toss decision already recorded — read-only summary, matches the copy used
  // on the public/big-screen views.
  if (match.toss_decision) {
    return (
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Coin Toss</span>
          {canRetry && (
            <button
              onClick={handleReset}
              disabled={submitting}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-xs"
            >
              ↺ Retry Toss
            </button>
          )}
        </div>
        <p className="text-white font-bold">
          <span className="text-amber-400">{teamName(match.toss_winner_team_id)}</span> won the toss and chose to{' '}
          <span className="uppercase">{tossDecisionPhrase(match.toss_decision)}</span>.
        </p>
        {isFootball && match.kick_off_team_id && (
          <p className="text-xs font-bold text-emerald-300">{teamName(match.kick_off_team_id)} kick off.</p>
        )}
        <p className="text-xs text-slate-400">
          {match.toss_method === 'digital'
            ? `Decided by a random digital coin flip${match.toss_result ? ` — it landed ${match.toss_result}` : ''}.`
            : `Recorded manually by the scorer${match.toss_result ? ` — the coin showed ${match.toss_result}` : ''}.`}
        </p>
      </div>
    );
  }

  // Coin called, winner known — waiting on their decision.
  if (match.toss_winner_team_id) {
    return (
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Coin Toss</span>
          {canRetry && (
            <button
              onClick={handleReset}
              disabled={submitting}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-xs"
            >
              ↺ Retry Toss
            </button>
          )}
        </div>
        <div className="flex flex-col items-center gap-4 py-2">
          <CoinFlip isFlipping={false} result={match.toss_result} />
          <p className="text-white font-bold text-center">
            <span className="text-amber-400">{teamName(match.toss_winner_team_id)}</span> won the toss
            {match.toss_result && (
              <span className="text-slate-400 font-semibold"> — it landed {match.toss_result}</span>
            )}
          </p>
          {match.toss_method === 'manual' && (
            <p className="text-xs text-slate-500">Recorded by the scorer, not flipped by the server.</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {decisions.map(({ value, label }, index) => (
              <button
                key={value}
                onClick={() => handleDecision(value)}
                disabled={submitting}
                className={`px-4 py-2 rounded-xl disabled:opacity-50 text-white font-bold text-xs shadow-md uppercase ${
                  index === 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                    : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20'
                }`}
              >
                Elects to {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // No toss recorded yet.
  return (
    <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Coin Toss</span>
          <h3 className="text-lg font-bold text-white font-heading">
            {isFootball ? 'Decide Kick-off & Ends' : 'Decide Who Bats First'}
          </h3>
        </div>
        <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs font-bold">
          <button
            onClick={() => setMode('digital')}
            className={`px-3 py-1.5 rounded-lg transition-all ${mode === 'digital' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
          >
            Digital
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`px-3 py-1.5 rounded-lg transition-all ${mode === 'manual' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
          >
            Manual
          </button>
        </div>
      </div>

      {mode === 'digital' ? (
        <div className="flex flex-col items-center gap-4 py-2">
          <CoinFlip isFlipping={isFlipping} result={flipResult} />

          {!isFlipping && (
            <p className="text-xs text-slate-400 text-center">
              The server flips the coin at random — nobody, including the scorer, can set the face.
              Use Manual to record a toss held on the ground.
            </p>
          )}

          {isFlipping ? (
            <span className="text-sm font-bold text-amber-300 uppercase tracking-wider">Flipping…</span>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 w-full text-xs">
                <div>
                  <label htmlFor="tosspanel-team-calling" className="block text-slate-400 mb-1 font-semibold">Team Calling</label>
                  <select id="tosspanel-team-calling"
                    value={callerTeamId}
                    onChange={(e) => setCallerTeamId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
                  >
                    <option value={teamA.id}>{teamA.name}</option>
                    <option value={teamB.id}>{teamB.name}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="tosspanel-call" className="block text-slate-400 mb-1 font-semibold">Call</label>
                  <select id="tosspanel-call"
                    value={call}
                    onChange={(e) => setCall(e.target.value as 'heads' | 'tails')}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white capitalize"
                  >
                    <option value="heads">Heads</option>
                    <option value="tails">Tails</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleFlip}
                disabled={submitting}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 hover:scale-[1.02] transition-all"
              >
                FLIP COIN
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Record the toss exactly as it happened on the ground — you set the outcome, nothing is
            flipped by the server.
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="tosspanel-toss-winner" className="block text-slate-400 mb-1 font-semibold">Toss Winner</label>
              <select id="tosspanel-toss-winner"
                value={manualWinnerId}
                onChange={(e) => setManualWinnerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
              >
                <option value={teamA.id}>{teamA.name}</option>
                <option value={teamB.id}>{teamB.name}</option>
              </select>
            </div>
            <div>
              <label htmlFor="tosspanel-their-decision" className="block text-slate-400 mb-1 font-semibold">Their Decision</label>
              <select id="tosspanel-their-decision"
                value={manualDecision}
                onChange={(e) => setManualDecision(e.target.value as TossDecision)}
                className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
              >
                {decisions.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs">
            <label htmlFor="tosspanel-coin-landed-on-optional" className="block text-slate-400 mb-1 font-semibold">Coin Landed On (optional)</label>
            <select id="tosspanel-coin-landed-on-optional"
              value={manualResult}
              onChange={(e) => setManualResult(e.target.value as '' | 'heads' | 'tails')}
              className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white capitalize"
            >
              <option value="">Not recorded</option>
              <option value="heads">Heads</option>
              <option value="tails">Tails</option>
            </select>
          </div>

          <button
            onClick={handleManual}
            disabled={submitting}
            className="w-full px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition-all"
          >
            RECORD TOSS
          </button>
        </div>
      )}
    </div>
  );
};
