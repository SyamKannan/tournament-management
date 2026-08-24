import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Match, Tournament } from '../../types';
import { Calendar, Plus, Play, Sparkles, RefreshCw, MapPin, Tv } from 'lucide-react';
import { Link } from 'react-router-dom';

export const OrgFixturesPage: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTourneyId, setSelectedTourneyId] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchTourneys = async () => {
      try {
        setLoading(true);
        const res = await api.get('/tournaments');
        setTournaments(res);
        if (res.length > 0) setSelectedTourneyId(res[0].id);
      } catch (err) {
        console.error('Failed to load tournaments', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTourneys();
  }, []);

  const fetchMatches = async (tourneyId: string) => {
    if (!tourneyId) return;
    try {
      const res = await api.get(`/matches/tournament/${tourneyId}`);
      setMatches(res);
    } catch (err) {
      console.error('Failed to load matches', err);
    }
  };

  useEffect(() => {
    if (selectedTourneyId) fetchMatches(selectedTourneyId);
  }, [selectedTourneyId]);

  const handleAutoGenerate = async (format: 'round_robin' | 'knockout') => {
    if (!confirm(`Auto-generate ${format === 'round_robin' ? 'Round Robin Group' : 'Knockout Bracket'} fixtures for all approved teams?`)) return;
    setGenerating(true);
    try {
      await api.post('/matches/auto-generate-fixtures', {
        tournament_id: selectedTourneyId,
        format
      });
      fetchMatches(selectedTourneyId);
    } catch (err: any) {
      alert(err.message || 'Failed to generate fixtures');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Fixtures & Bracket Scheduler</h1>
          <p className="text-xs text-slate-400 mt-1">Generate Round Robin or Single Elimination fixtures and schedule stadium match venues</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={generating}
            onClick={() => handleAutoGenerate('round_robin')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto Round Robin</span>
          </button>
          <button
            disabled={generating}
            onClick={() => handleAutoGenerate('knockout')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Generate Knockout Bracket</span>
          </button>
        </div>
      </div>

      {/* Match Cards List */}
      <div className="grid md:grid-cols-2 gap-4">
        {matches.map(m => {
          const isLive = m.status === 'in_progress' || m.status === 'half_time' || m.status === 'innings_break';

          return (
            <div key={m.id} className={`p-5 rounded-2xl glass-card border transition-all ${
              isLive ? 'border-rose-500/40 glow-emerald' : 'border-slate-800'
            }`}>
              <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
                <span className="font-semibold text-slate-400">{m.round_name} • Match #{m.match_number}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isLive ? 'bg-rose-500/20 text-rose-400 animate-pulse' :
                  m.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'
                }`}>
                  {m.status.replace('_', ' ')}
                </span>
              </div>

              <div className="py-4 flex items-center justify-between">
                <div className="text-left flex-1 font-bold text-sm text-white truncate pr-2">
                  {m.team_a?.name || m.team_a_id}
                </div>
                <div className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 font-mono font-black text-sm text-emerald-400">
                  {m.sport_code === 'football' ? (
                    `${m.football_state?.team_a_score || 0} - ${m.football_state?.team_b_score || 0}`
                  ) : (
                    `${m.cricket_state?.team_a_runs || 0}/${m.cricket_state?.team_a_wickets || 0}`
                  )}
                </div>
                <div className="text-right flex-1 font-bold text-sm text-white truncate pl-2">
                  {m.team_b?.name || m.team_b_id}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span>{m.venue?.name || 'Main Stadium'}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/scoreboard/match/${m.id}`}
                    target="_blank"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                    title="Open Scoreboard TV"
                  >
                    <Tv className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to={`/organization/scorer/${m.id}`}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold"
                  >
                    Live Scorer Pad →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
