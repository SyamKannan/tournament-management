import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Announcement, Match } from '../../types';
import { Clock, Radio, Trash2, Tv } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { MatchPicker } from '../../components/MatchPicker';
import { formatDateTime } from '../../lib/format';

const DURATION_CHOICES = [0, 10, 15, 20, 30, 45, 60, 120, 300, 600];

const durationLabel = (seconds: number) =>
  seconds === 0 ? 'Hold until switched back' : seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;

const TYPE_LABELS: Record<Announcement['type'], string> = {
  urgent_match_delay: '⚠️ Rain / Match Delay',
  venue_change: '📍 Venue Changed',
  general: '📢 General Update',
  registration_alert: '📝 Registration',
};

/**
 * Announcements are written here for one match. They reach the big screen
 * only when someone running that match presses Show in the scorer console.
 */
export const OrgAnnouncementsPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [match, setMatch] = useState<Match | null>(null);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'general' | 'urgent_match_delay' | 'venue_change'>('urgent_match_delay');
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [saving, setSaving] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    if (!match) {
      setAnnouncements([]);
      return;
    }
    try {
      setAnnouncements(await api.get(`/sponsors/announcements?matchId=${encodeURIComponent(match.id)}`));
    } catch (err) {
      console.error('Failed to load announcements', err);
    }
  }, [match?.id]);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!match) return;
    setSaving(true);
    try {
      await api.post('/sponsors/announcements', {
        match_id: match.id,
        title,
        message,
        type,
        duration_seconds: durationSeconds,
      });
      setTitle('');
      setMessage('');
      loadAnnouncements();
      toast.success('Announcement saved. Show it from the Big Screen Director.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create announcement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (annId: string) => {
    const proceed = await confirm({
      title: 'Delete this announcement?',
      message: 'If it is on the big screen right now it comes off immediately.',
      confirmLabel: 'Delete announcement',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      await api.delete(`/sponsors/announcements/${annId}`);
      loadAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Match Announcements</h1>
          <p className="text-xs text-slate-400 mt-1">Write announcements for a match here, then show them full screen from that match's Big Screen Director</p>
        </div>
        {match && (
          <Link
            to={`/organization/scorer/${match.id}`}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors w-fit"
          >
            <Tv className="w-3.5 h-3.5 text-emerald-400" />
            <span>Open Big Screen Director</span>
          </Link>
        )}
      </div>

      <div className="p-5 rounded-3xl glass-panel border border-slate-800">
        <MatchPicker onChange={next => setMatch(next)} />
      </div>

      <div className="grid md:grid-cols-12 gap-6">
        {/* Create Form */}
        <div className="md:col-span-5">
          <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white font-heading">New Announcement</h3>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label htmlFor="organnouncements-announcement-title" className="block text-slate-300 font-semibold mb-1">Announcement Title *</label>
                <input id="organnouncements-announcement-title"
                  type="text"
                  placeholder="e.g. MATCH DELAY NOTICE"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl glass-input font-bold"
                />
              </div>

              <div>
                <label htmlFor="organnouncements-message-text" className="block text-slate-300 font-semibold mb-1">Message Text *</label>
                <textarea id="organnouncements-message-text"
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
                  <label htmlFor="organnouncements-alert-category" className="block text-slate-300 font-semibold mb-1">Alert Category</label>
                  <select id="organnouncements-alert-category"
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                  >
                    <option value="urgent_match_delay">{TYPE_LABELS.urgent_match_delay}</option>
                    <option value="venue_change">{TYPE_LABELS.venue_change}</option>
                    <option value="general">{TYPE_LABELS.general}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="organnouncements-time-on-big-screen" className="block text-slate-300 font-semibold mb-1">Time on Big Screen</label>
                  <select id="organnouncements-time-on-big-screen"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                  >
                    {DURATION_CHOICES.map(seconds => (
                      <option key={seconds} value={seconds}>{durationLabel(seconds)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={!match || saving}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Announcement'}
              </button>
            </form>
          </div>
        </div>

        {/* This match's announcements */}
        <div className="md:col-span-7 space-y-3">
          {!match ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
              Pick a match to see its announcements.
            </div>
          ) : announcements.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
              No announcements for this match yet.
            </div>
          ) : announcements.map(ann => (
            <div key={ann.id} className="p-4 rounded-2xl glass-card border border-slate-800 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <Radio className="w-5 h-5 flex-shrink-0 mt-0.5 text-slate-500" />
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                  <p className="text-xs text-slate-300 mt-1 [overflow-wrap:anywhere]">{ann.message}</p>
                  <div className="text-xs text-slate-500 mt-2 font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{TYPE_LABELS[ann.type] ?? ann.type}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {ann.duration_seconds === 0 ? 'Hold' : `${ann.duration_seconds}s`}
                    </span>
                    <span>{formatDateTime(ann.created_at)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDelete(ann.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 shrink-0"
                title="Delete announcement"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
