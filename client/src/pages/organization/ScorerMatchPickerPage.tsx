import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, Calendar } from 'lucide-react';
import { api } from '../../services/api';
import type { Match, Tournament } from '../../types';
import { SkeletonCard, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { formatMatchTime } from '../../lib/format';
import { label } from '../../lib/labels';

type PickerMatch = Match & { tournamentName: string };

const FINISHED = ['completed', 'cancelled'];

/**
 * `/organization/scorer` with no match named: the club's live and upcoming
 * fixtures, each opening the scorer pad. It is also where a scorer account
 * starts, since scorers have no dashboard of their own.
 */
export const ScorerMatchPickerPage: React.FC = () => {
  const [matches, setMatches] = useState<PickerMatch[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setMatches(null);
    try {
      const res = await api.get<Tournament[] | { data: Tournament[] }>('/tournaments');
      const tournaments = Array.isArray(res) ? res : res?.data ?? [];
      const lists = await Promise.all(tournaments.map(async t => {
        const list = await api.get<Match[] | { data: Match[] }>(`/matches/tournament/${t.id}`);
        return (Array.isArray(list) ? list : list?.data ?? []).map(m => ({ ...m, tournamentName: t.name }));
      }));
      const open = lists.flat()
        .filter(m => m.team_a_id && m.team_b_id && !FINISHED.includes(m.status))
        .sort((a, b) => {
          const liveA = a.status === 'scheduled' ? 1 : 0;
          const liveB = b.status === 'scheduled' ? 1 : 0;
          return liveA - liveB || String(a.scheduled_at ?? '').localeCompare(String(b.scheduled_at ?? ''));
        });
      setMatches(open);
    } catch (err: any) {
      setError(err?.message || 'Could not load your matches.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-heading">Live Scorer</h1>
        <p className="text-sm text-slate-400 mt-1">Pick the match you are scoring.</p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : matches === null ? (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No matches to score"
          message="Every fixture is finished, or none have been scheduled yet."
        />
      ) : (
        <ul className="space-y-3">
          {matches.map(m => {
            const live = m.status !== 'scheduled';
            return (
              <li key={m.id}>
                <Link
                  to={`/organization/scorer/${m.id}`}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/60 ring-1 ring-slate-800 hover:ring-emerald-500/50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400 truncate">
                      {m.tournamentName}{m.round_name ? ` · ${m.round_name}` : ''}
                    </p>
                    <p className="font-bold text-white truncate">
                      {m.team_a?.name ?? 'Team A'} vs {m.team_b?.name ?? 'Team B'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{formatMatchTime(m.scheduled_at, 'Time not set')}</p>
                  </div>
                  {live ? (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 text-xs font-bold shrink-0">
                      <Radio className="w-3 h-3" aria-hidden="true" /> {label(m.status)}
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-bold shrink-0">Score →</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

