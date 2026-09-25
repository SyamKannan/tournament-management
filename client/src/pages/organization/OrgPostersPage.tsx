import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { TournamentPicker } from '../../components/ui/TournamentPicker';
import { Skeleton, SkeletonCard, EmptyState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { Image as ImageIcon, Download, Share2, Trash2, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { label } from '../../lib/labels';
import { useT } from '../../i18n';

const POSTER_TYPES: { value: string; label: string; needsMatch: boolean }[] = [
  { value: 'matchday', label: 'Matchday (VS lockup)', needsMatch: true },
  { value: 'toss', label: 'Toss Result', needsMatch: true },
  { value: 'result', label: 'Match Result', needsMatch: true },
  { value: 'player_of_match', label: 'Player of the Match', needsMatch: true },
  { value: 'points_table', label: 'Points Table', needsMatch: false },
  { value: 'tournament_announcement', label: 'Tournament Announcement', needsMatch: false },
];

/** Survives leaving the page, so a poster asked for is not forgotten. */
const PENDING_KEY = 'kickwick_pending_poster_job';

interface PosterJob {
  id: string;
  status: 'queued' | 'rendering' | 'done' | 'failed';
  attempt?: number;
  max_attempts?: number;
  message?: string;
  stalled?: boolean;
  poster?: any;
  tournament_id?: string;
}

function readPending(): { jobId: string; tournamentId: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePending(value: { jobId: string; tournamentId: string } | null) {
  try {
    if (value) sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the job is still followed while this page is open.
  }
}

/**
 * AI-assisted match/tournament posters. Generation is async — POST queues
 * GeneratePoster (a full render is 10-20s: art director call, optional AI
 * background, headless Chrome) and returns a job id. The page follows that id
 * — queued, rendering, retrying, done or failed — rather than guessing from
 * the gallery and timing out, and picks it back up after a reload.
 */
export const OrgPostersPage: React.FC = () => {
  const toast = useToast();
  const { role } = useAuth();
  const canDelete = role === 'ORG_ADMIN';

  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [posterType, setPosterType] = useState('matchday');
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useT();
  const [job, setJob] = useState<PosterJob | null>(null);
  const jobRef = useRef<PosterJob | null>(null);
  jobRef.current = job;
  const generating = job !== null && (job.status === 'queued' || job.status === 'rendering');

  const selectedTypeMeta = POSTER_TYPES.find(t => t.value === posterType)!;

  useEffect(() => {
    api.get('/tournaments').then(res => {
      setTournaments(res);
      if (res.length > 0) setSelectedTournamentId(res[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchMatchesAndPosters = async (tournamentId: string) => {
    try {
      const [matchesRes, postersRes] = await Promise.all([
        api.get(`/matches/tournament/${tournamentId}`),
        api.get(`/posters?tournament_id=${tournamentId}`),
      ]);
      setMatches(matchesRes);
      setSelectedMatchId(matchesRes[0]?.id || '');
      setPosters(postersRes);
    } catch (err) {
      console.error('Failed to load matches/posters', err);
    }
  };

  useEffect(() => {
    if (!selectedTournamentId) return;
    fetchMatchesAndPosters(selectedTournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId]);

  const addPoster = (poster: any) => {
    setPosters(prev => (prev.some(p => p.id === poster.id) ? prev : [poster, ...prev]));
  };

  const finishJob = (next: PosterJob) => {
    writePending(null);
    if (next.status === 'done') {
      if (next.poster) addPoster(next.poster);
      setJob(null);
      toast.success(t('poster.ready'));
    } else {
      setJob(next);
      toast.error(next.message || t('poster.failed'));
    }
  };

  // The finished poster usually arrives over the tournament room first.
  useRoomSocket(selectedTournamentId ? `tournament:${selectedTournamentId}` : null, msg => {
    if (msg.type === 'POSTER_CREATED' && msg.payload?.poster) {
      addPoster(msg.payload.poster);
      if (jobRef.current && (jobRef.current.status === 'queued' || jobRef.current.status === 'rendering')) {
        finishJob({ ...jobRef.current, status: 'done', poster: msg.payload.poster });
      }
    }
    if (msg.type === 'POSTER_FAILED' && jobRef.current && msg.payload?.job_id === jobRef.current.id) {
      finishJob({ ...jobRef.current, status: 'failed' });
    }
  }, undefined, 0);

  // Pick up a poster requested before a reload or a trip to another page.
  useEffect(() => {
    const pending = readPending();
    if (!pending) return;
    setSelectedTournamentId(current => current || pending.tournamentId);
    setJob({ id: pending.jobId, status: 'queued' });
    toast.info(t('poster.resumed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The gateway may be down, so the job is also asked about directly. No
  // give-up timer: the server retries a failed render and says when it has
  // stopped, which is the only honest end to the wait.
  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'rendering')) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const latest: PosterJob = await api.get(`/posters/jobs/${job.id}`);
        if (cancelled) return;
        if (latest.status === 'done' || latest.status === 'failed') {
          finishJob(latest);
        } else {
          setJob(previous => (previous && previous.id === latest.id ? { ...previous, ...latest } : previous));
        }
      } catch (err: any) {
        if (!cancelled && err?.status === 404) {
          finishJob({ id: job.id, status: 'failed', message: err.message });
        }
        // Anything else (offline, a blip) is retried on the next tick.
      }
    };
    const timer = setInterval(tick, 4000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  const handleGenerate = async () => {
    if (generating) return;
    if (selectedTypeMeta.needsMatch && !selectedMatchId) {
      toast.error('Pick a match first.');
      return;
    }

    setJob({ id: 'pending', status: 'queued' });
    try {
      const res: { job_id: string } = await api.post('/posters/generate', {
        poster_type: posterType,
        tournament_id: selectedTournamentId,
        ...(selectedTypeMeta.needsMatch ? { match_id: selectedMatchId } : {}),
      });
      setJob({ id: res.job_id, status: 'queued' });
      writePending({ jobId: res.job_id, tournamentId: selectedTournamentId });
    } catch (err: any) {
      setJob(null);
      toast.error(err.message || 'Failed to start poster generation.');
    }
  };

  /** One line saying where the poster has got to, in words an organizer can act on. */
  const jobMessage = (() => {
    if (!job) return null;
    if (job.status === 'failed') return job.message || t('poster.failed');
    if (job.stalled) return t('poster.stalled');
    if (job.status === 'rendering' && (job.attempt ?? 1) > 1) {
      return t('poster.retrying', { attempt: job.attempt ?? 2, max: job.max_attempts ?? 3 });
    }
    if (job.status === 'rendering') return t('poster.rendering');
    return t('poster.queued');
  })();

  const handleShare = async (poster: any) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Tournament Poster', url: poster.image_path });
        return;
      } catch { /* user cancelled the native share sheet */ }
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(poster.image_path)}`, '_blank');
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/posters/${id}`);
      setPosters(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete poster.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Posters</h1>
          <p className="text-xs text-slate-400 mt-1">Share-ready 1080×1350 posters for matchday, toss, results and more</p>
        </div>
        <TournamentPicker
          tournaments={tournaments}
          value={selectedTournamentId}
          onChange={(id) => setSelectedTournamentId(id)}
        />
      </div>

      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Generate a Poster
        </h3>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="orgposters-poster-type" className="block text-slate-300 font-semibold mb-1 text-xs">Poster Type</label>
            <select id="orgposters-poster-type"
              value={posterType}
              onChange={(e) => setPosterType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-xs"
            >
              {POSTER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {selectedTypeMeta.needsMatch && (
          <div>
            <label htmlFor="orgposters-match" className="block text-slate-300 font-semibold mb-1 text-xs">Match</label>
            <select id="orgposters-match"
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-xs"
            >
              {matches.length === 0 && <option value="">No matches yet</option>}
              {matches.map(m => (
                <option key={m.id} value={m.id}>
                  {m.round_name || 'Match'} · {m.team_a?.name || 'TBD'} vs {m.team_b?.name || 'TBD'}
                </option>
              ))}
            </select>
          </div>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !selectedTournamentId || (selectedTypeMeta.needsMatch && !selectedMatchId)}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500
                     disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-emerald-600/20
                     flex items-center justify-center gap-2"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Generating…</>
          ) : (
            <><Sparkles className="w-4 h-4" aria-hidden="true" /> Generate Poster</>
          )}
        </button>

        {jobMessage && (
          <p
            role="status"
            aria-live="polite"
            className={`flex items-start gap-2 text-sm ${job?.status === 'failed' || job?.stalled ? 'text-amber-300' : 'text-slate-400'}`}
          >
            {job?.status === 'failed' || job?.stalled
              ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              : <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" aria-hidden="true" />}
            <span>{jobMessage}</span>
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-white font-heading mb-3">Gallery</h3>

        {posters.length === 0 && !generating ? (
          <EmptyState
            icon={ImageIcon}
            title="No posters yet"
            message="Generate your first poster above — it'll show up here as soon as it's ready."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {generating && (
              <div className="rounded-2xl bg-slate-900/60 ring-1 ring-slate-800 overflow-hidden">
                <Skeleton className="w-full aspect-[4/5]" />
                <div className="p-3"><Skeleton className="h-3 w-2/3" /></div>
              </div>
            )}

            {posters.map(poster => (
              <div key={poster.id} className="rounded-2xl bg-slate-900/60 ring-1 ring-slate-800 overflow-hidden group relative">
                <img src={poster.image_path} alt={poster.poster_type} className="w-full aspect-[4/5] object-cover" loading="lazy" />
                <div className="p-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-amber-400">
                    {label(poster.poster_type)}
                  </span>
                  <div className="flex items-center gap-1">
                    <a
                      href={poster.image_path}
                      download
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                      title="Download PNG"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => handleShare(poster)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                      title="Share"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(poster.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
