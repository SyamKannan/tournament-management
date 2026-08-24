import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Announcement, Tournament } from '../../types';
import { Radio, Plus, AlertCircle, Trash2, Tv, Sparkles } from 'lucide-react';

export const OrgAnnouncementsPage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'general' | 'urgent_match_delay' | 'venue_change'>('urgent_match_delay');
  const [activeOnScoreboard, setActiveOnScoreboard] = useState(true);
  const [selectedTourneyId, setSelectedTourneyId] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [annRes, tourneysRes] = await Promise.all([
        api.get('/sponsors/announcements'),
        api.get('/tournaments')
      ]);
      setAnnouncements(annRes);
      setTournaments(tourneysRes);
      if (tourneysRes.length > 0 && !selectedTourneyId) {
        setSelectedTourneyId(tourneysRes[0].id);
      }
    } catch (err) {
      console.error('Failed to load announcements', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/sponsors/announcements', {
        tournament_id: selectedTourneyId || undefined,
        title,
        message,
        type,
        is_active_on_scoreboard: activeOnScoreboard
      });
      setTitle('');
      setMessage('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create announcement');
    }
  };

  const handleToggleScoreboard = async (annId: string, currentState: boolean) => {
    try {
      await api.put(`/sponsors/announcements/${annId}/scoreboard-toggle`, {
        is_active_on_scoreboard: !currentState
      });
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle');
    }
  };

  const handleDelete = async (annId: string) => {
    try {
      await api.delete(`/sponsors/announcements/${annId}`);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black font-heading text-white">Emergency Announcements & Alerts</h1>
        <p className="text-xs text-slate-400 mt-1">Broadcast urgent messages (e.g. Rain delays, Venue changes) directly to public pages and 16:9 TV scoreboards</p>
      </div>

      <div className="grid md:grid-cols-12 gap-6">
        {/* Create Form */}
        <div className="md:col-span-5">
          <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white font-heading">Broadcast New Alert</h3>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Announcement Title *</label>
                <input
                  type="text"
                  placeholder="e.g. MATCH DELAY NOTICE"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl glass-input font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Message Text *</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Match is delayed due to light rain. Pitch drying in progress, game resumes at 6:30 PM."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl glass-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Alert Category</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                  >
                    <option value="urgent_match_delay">⚠️ Rain / Match Delay</option>
                    <option value="venue_change">📍 Venue Changed</option>
                    <option value="general">📢 General Update</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tournament</label>
                  <select
                    value={selectedTourneyId}
                    onChange={(e) => setSelectedTourneyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                  >
                    <option value="">All Tournaments</option>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={activeOnScoreboard}
                  onChange={(e) => setActiveOnScoreboard(e.target.checked)}
                  className="rounded text-rose-500"
                />
                <span className="text-rose-400 font-semibold">Broadcast immediately on Big Screen TV Scoreboard</span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-md shadow-rose-600/20"
              >
                Broadcast Announcement
              </button>
            </form>
          </div>
        </div>

        {/* Existing Announcements List */}
        <div className="md:col-span-7 space-y-3">
          {announcements.map(ann => (
            <div key={ann.id} className="p-4 rounded-2xl glass-card border border-slate-800 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Radio className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  ann.is_active_on_scoreboard ? 'text-rose-400 animate-pulse' : 'text-slate-500'
                }`} />
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                    {ann.is_active_on_scoreboard && (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold uppercase">
                        Active On Scoreboard TV
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{ann.message}</p>
                  <div className="text-[10px] text-slate-500 mt-2 font-mono">{new Date(ann.created_at).toLocaleString()}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleScoreboard(ann.id, ann.is_active_on_scoreboard)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    ann.is_active_on_scoreboard ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {ann.is_active_on_scoreboard ? 'Hide from TV' : 'Push to TV'}
                </button>
                <button
                  onClick={() => handleDelete(ann.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
