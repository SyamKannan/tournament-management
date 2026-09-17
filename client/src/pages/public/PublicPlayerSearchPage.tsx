import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import type { PageMeta, SportCode } from '../../types';
import { playerPhoto } from '../../lib/playerStats';

interface PlayerSearchResult {
  player_id: string;
  full_name: string;
  photo: string | null;
  jersey_number: number;
  role: string | null;
  team_name: string | null;
  organization_name: string | null;
  tournament: { id: string; name: string; slug: string; sport_code: SportCode };
  headline: { matches: number; runs?: number; wickets?: number; goals?: number; assists?: number };
}

const PER_PAGE = 20;

/**
 * Looks like a Player Code: "SP-7K4Q2", "sp7k4q2", "SP 7K4Q2". The SP prefix is
 * required here so a five-letter name is never mistaken for a code; a bare
 * code still works on the API, and a name that happens to match falls back to
 * a name search below.
 */
const PLAYER_CODE = /^sp[\s-]*[a-z0-9]{5}$/i;

/**
 * "Player Stats": a player types their Player Code to go straight to their
 * profile, or searches their name — no account, no login.
 */
export const PublicPlayerSearchPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = params.get('q') ?? '';

  const [input, setInput] = useState(initial);
  const [sport, setSport] = useState<'' | SportCode>((params.get('sport') as SportCode) || '');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const term = params.get('q')?.trim() ?? '';

  const search = async (page: number) => {
    const query = new URLSearchParams({ q: term, page: String(page), per_page: String(PER_PAGE) });
    if (sport) query.set('sport', sport);

    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/players/search?${query}`);
      setResults(prev => (page === 1 ? res.data : [...prev, ...res.data]));
      setMeta(res.meta);
    } catch (err: any) {
      setError(err.message || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // The search lives in the URL, so a result list can be shared or reloaded.
  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      setMeta(null);
      return;
    }
    search(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, sport]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (q.length < 2) {
      setError('Enter your Player Code or at least 2 letters of your name.');
      return;
    }

    if (PLAYER_CODE.test(q)) {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/players/code/${encodeURIComponent(q)}`);
        navigate(`/players/${res.player_id}`);
        return;
      } catch {
        // Not a code after all — search it as a name instead.
      } finally {
        setLoading(false);
      }
    }

    setParams(sport ? { q, sport } : { q });
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black font-heading text-white tracking-tight">Find Your Player Stats</h1>
          <p className="text-sm text-slate-400">
            Enter your Player Code (like SP-7K4Q2) or search your name to see your matches, runs, wickets, goals and awards. No login needed.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Player Code or name</span>
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Player Code (SP-7K4Q2) or your name"
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </label>
          <label>
            <span className="sr-only">Sport</span>
            <select
              value={sport}
              onChange={e => setSport(e.target.value as '' | SportCode)}
              className="w-full sm:w-auto px-3 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">All sports</option>
              <option value="cricket">Cricket</option>
              <option value="football">Football</option>
            </select>
          </label>
          <button
            type="submit"
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm"
          >
            Search
          </button>
        </form>

        {error && <p className="text-sm text-rose-400 text-center">{error}</p>}

        {meta && (
          <p className="text-xs text-slate-500">
            {meta.total === 0
              ? PLAYER_CODE.test(term)
                ? `No player has the code “${term.toUpperCase()}”. Check it with your team manager, or search your name.`
                : `No players found for “${term}”.`
              : `${meta.total} player${meta.total === 1 ? '' : 's'} found`}
          </p>
        )}

        <div className="space-y-2">
          {results.map(r => (
            <Link
              key={r.player_id}
              to={`/players/${r.player_id}`}
              className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 flex items-center gap-3 sm:gap-4 transition-colors"
            >
              <img
                src={playerPhoto(r.photo, r.tournament.sport_code)}
                alt=""
                className="w-12 h-12 rounded-xl object-cover bg-slate-950 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white truncate">{r.full_name}</div>
                <div className="text-xs text-slate-400 truncate">
                  {[r.role, r.team_name].filter(Boolean).join(' • ')}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {[r.tournament.name, r.organization_name].filter(Boolean).join(' • ')}
                </div>
              </div>
              <div className="hidden sm:flex gap-4 text-center shrink-0">
                <Headline label="Matches" value={r.headline.matches} />
                {r.tournament.sport_code === 'cricket' ? (
                  <>
                    <Headline label="Runs" value={r.headline.runs} />
                    <Headline label="Wkts" value={r.headline.wickets} />
                  </>
                ) : (
                  <>
                    <Headline label="Goals" value={r.headline.goals} />
                    <Headline label="Assists" value={r.headline.assists} />
                  </>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            </Link>
          ))}
        </div>

        {meta && meta.page < meta.last_page && (
          <button
            onClick={() => search(meta.page + 1)}
            disabled={loading}
            className="w-full py-2.5 rounded-2xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-sm font-bold disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Show more'}
          </button>
        )}

        {loading && results.length === 0 && (
          <div className="flex justify-center py-6">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

const Headline: React.FC<{ label: string; value: number | undefined }> = ({ label, value }) => (
  <div>
    <div className="text-lg font-black font-mono text-white">{value ?? 0}</div>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
  </div>
);
