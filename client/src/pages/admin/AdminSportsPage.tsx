import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../../services/api';
import type { Sport } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { Skeleton } from '../../components/ui/Feedback';

export const AdminSportsPage: React.FC = () => {
  const toast = useToast();
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchSports = async () => {
    try {
      setLoading(true);
      const res = await api.get<Sport[]>('/admin/sports');
      setSports(res);
    } catch (err) {
      console.error('Failed to fetch sports', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSports();
  }, []);

  const handleToggle = async (sport: Sport) => {
    const nextActive = !sport.is_active;
    setSavingId(sport.id);
    try {
      const updated = await api.put<Sport>(`/admin/sports/${sport.id}`, { is_active: nextActive });
      setSports(prev => prev.map(s => (s.id === sport.id ? updated : s)));
      toast.success(`${sport.name} ${nextActive ? 'enabled' : 'disabled'} for all organizers and players`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update sport');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black font-heading text-white">Sports</h1>
        <p className="text-xs text-slate-400 mt-1">
          Control which sports are available platform-wide. A disabled sport disappears from tournament
          creation, player registration, and every other picker for organizers and players — existing
          tournaments in that sport keep running untouched.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {sports.map(sport => (
          <div
            key={sport.id}
            className={`p-5 rounded-3xl glass-card border flex items-center justify-between gap-4 transition-all ${
              sport.is_active ? 'border-slate-800' : 'border-slate-800/50 opacity-70'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center text-xl shrink-0">
                {sport.icon}
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-white font-heading truncate">{sport.name}</div>
                <div className={`text-xs font-semibold uppercase tracking-wider ${sport.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {sport.is_active ? 'Visible to end users' : 'Hidden from end users'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggle(sport)}
              disabled={savingId === sport.id}
              role="switch"
              aria-checked={sport.is_active}
              aria-label={`Toggle ${sport.name}`}
              className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
                sport.is_active ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                  sport.is_active ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
