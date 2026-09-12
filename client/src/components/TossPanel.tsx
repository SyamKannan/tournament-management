import React, { useState } from 'react';
import { api } from '../services/api';
import { useToast } from './ui/Toast';
import type { Match, Team, TossResult } from '../types';
import { CoinFlip } from './CoinFlip';

interface TossPanelProps {
  match: Match;
  teamA: Team;
  teamB: Team;
  /** Called after any successful toss action so the parent can refetch the match. */
  onUpdated: (toss: TossResult) => void;
}

/**
 * Scorer controls for the pre-match coin toss — digital (server-flipped,
 * away side calls heads/tails) or manual (toss happened on the ground,
 * record the outcome directly). Locked out once the toss decision is in,
 * matching the server-side gate that gates cricket scoring on it.
 */
export const TossPanel: React.FC<TossPanelProps> = ({ match, teamA, teamB, onUpdated }) => {
  const toast = useToast();
  const [mode, setMode] = useState<'digital' | 'manual'>('digital');
  const [callerTeamId, setCallerTeamId] = useState(teamB.id);
  const [call, setCall] = useState<'heads' | 'tails'>('heads');
  const [manualWinnerId, setManualWinnerId] = useState(teamA.id);
  const [manualDecision, setManualDecision] = useState<'bat' | 'bowl'>('bat');
  const [isFlipping, setIsFlipping] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const teamName = (teamId?: string | null) =>
    teamId === teamA.id ? teamA.name : teamId === teamB.id ? teamB.name : teamId || '—';

  const handleFlip = async () => {
    if (submitting) return;
    setSubmitting(true);
    setIsFlipping(true);
    try {
      const result = await api.post<TossResult>(`/matches/${match.id}/toss/call`, {
        team_id: callerTeamId,
        call,
      });
      // Let the flip animation play out before the winner is revealed.
      setTimeout(() => {
        setIsFlipping(false);
        onUpdated(result);
      }, 1400);
    } catch (err: any) {
      setIsFlipping(false);
      toast.error(err.message || 'Failed to flip the coin');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (decision: 'bat' | 'bowl') => {
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
      });
      onUpdated(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record the toss');
    } finally {
      setSubmitting(false);
    }
  };

  // Toss decision already recorded — read-only summary, matches the copy used
  // on the public/big-screen views.
  if (match.toss_decision) {
    return (
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-3">
        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Coin Toss</span>
        <p className="text-white font-bold">
          <span className="text-amber-400">{teamName(match.toss_winner_team_id)}</span> won the toss and chose to{' '}
          <span className="uppercase">{match.toss_decision}</span>.
        </p>
        <p className="text-xs text-slate-400">
          {match.toss_method === 'digital' ? 'Decided by a digital coin flip.' : 'Recorded manually by the scorer.'}
        </p>
      </div>
    );
  }

  // Coin called, winner known — waiting on their bat/bowl decision.
  if (match.toss_winner_team_id) {
    return (
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Coin Toss</span>
        <div className="flex flex-col items-center gap-4 py-2">
          <CoinFlip isFlipping={false} />
          <p className="text-white font-bold text-center">
            <span className="text-amber-400">{teamName(match.toss_winner_team_id)}</span> won the toss
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => handleDecision('bat')}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
            >
              Elects to BAT
            </button>
            <button
              onClick={() => handleDecision('bowl')}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-cyan-600/20"
            >
              Elects to BOWL
            </button>
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
          <h3 className="text-lg font-bold text-white font-heading">Decide Who Bats First</h3>
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
          <CoinFlip isFlipping={isFlipping} />

          {isFlipping ? (
            <span className="text-sm font-bold text-amber-300 uppercase tracking-wider">Flipping…</span>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 w-full text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Team Calling</label>
                  <select
                    value={callerTeamId}
                    onChange={(e) => setCallerTeamId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
                  >
                    <option value={teamA.id}>{teamA.name}</option>
                    <option value={teamB.id}>{teamB.name}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Call</label>
                  <select
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
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">Toss Winner</label>
              <select
                value={manualWinnerId}
                onChange={(e) => setManualWinnerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white"
              >
                <option value={teamA.id}>{teamA.name}</option>
                <option value={teamB.id}>{teamB.name}</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">Their Decision</label>
              <select
                value={manualDecision}
                onChange={(e) => setManualDecision(e.target.value as 'bat' | 'bowl')}
                className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-white capitalize"
              >
                <option value="bat">Bat</option>
                <option value="bowl">Bowl</option>
              </select>
            </div>
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
