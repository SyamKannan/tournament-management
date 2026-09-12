import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { websocketUrl } from '../../config';
import { TournamentPicker } from '../../components/ui/TournamentPicker';
import { Skeleton, SkeletonCard, EmptyState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';
import { Image as ImageIcon, Download, Share2, Trash2, Sparkles, Loader2 } from 'lucide-react';

const POSTER_TYPES: { value: string; label: string; needsMatch: boolean }[] = [
  { value: 'matchday', label: 'Matchday (VS lockup)', needsMatch: true },
  { value: 'toss', label: 'Toss Result', needsMatch: true },
  { value: 'result', label: 'Match Result', needsMatch: true },
  { value: 'player_of_match', label: 'Player of the Match', needsMatch: true },
  { value: 'points_table', label: 'Points Table', needsMatch: false },
  { value: 'tournament_announcement', label: 'Tournament Announcement', needsMatch: false },
];

/**
 * AI-assisted match/tournament posters. Generation is async — POST just
 * queues GeneratePoster (a full render is 10-20s: art director call,
 * optional AI background, headless Chrome), so the finished poster shows up
 * over the `tournament:<id>` realtime room rather than in the POST response.
 */
export const OrgPostersPage: React.FC = () => {
  const toast = useToast();
  const { role } = useAuth();
  const canDelete = role === 'ORG_ADMIN' || role === 'SUPER_ADMIN';

  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [posterType, setPosterType] = useState('matchday');
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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

    // Live updates: GeneratePoster runs on a queue worker, so the finished
    // poster arrives here, not in the original POST response.
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(websocketUrl());
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'SUBSCRIBE', room: `tournament:${selectedTournamentId}` }));
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'POSTER_CREATED') {
            setPosters(prev => [msg.payload.poster, ...prev]);
            setGenerating(false);
            toast.success('Poster ready!');
          }
        } catch { /* ignore malformed frames */ }
      };
    } catch (err) {
      console.error('Realtime connection failed', err);
    }

    return () => ws?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId]);

  const handleGenerate = async () => {
    if (!selectedMatchId) {
      toast.error('Pick a match first.');
      return;
    }

    setGenerating(true);
    try {
      await api.post('/posters/generate', { match_id: selectedMatchId, poster_type: posterType });
      toast.success('Generating poster… it will appear below shortly.');
    } catch (err: any) {
      setGenerating(false);
      toast.error(err.message || 'Failed to start poster generation.');
    }
  };

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
            <label className="block text-slate-300 font-semibold mb-1 text-xs">Poster Type</label>
            <select
              value={posterType}
              onChange={(e) => setPosterType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900 text-xs"
            >
              {POSTER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1 text-xs">
              Match {!selectedTypeMeta.needsMatch && '(picks which tournament — not shown on this poster)'}
            </label>
            <select
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
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !selectedMatchId}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500
                     disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-amber-600/20
                     flex items-center justify-center gap-2"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Poster</>
          )}
        </button>
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
                  <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400">
                    {poster.poster_type.replace(/_/g, ' ')}
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
