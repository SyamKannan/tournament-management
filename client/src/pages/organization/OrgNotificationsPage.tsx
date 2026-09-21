import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { PhoneInput } from '../../components/PhoneInput';
import { Pager } from '../../components/ui/Pager';
import { formatDateTime } from '../../lib/format';
import { label } from '../../lib/labels';
import {
  BellRing, CheckCircle2, Clock, MessageCircle, Phone, Send,
  ShieldOff, TriangleAlert, UserRoundX, XCircle,
} from 'lucide-react';

type NotificationEvent = {
  event: string;
  channel: 'whatsapp' | 'sms';
  audience: string;
  description: string;
  enabled: boolean;
};

type Settings = {
  enabled: boolean;
  sender_name: string;
  events: NotificationEvent[];
};

type LogEntry = {
  id: string;
  event: string;
  channel: 'whatsapp' | 'sms';
  recipient_name: string;
  recipient_role: string;
  to: string;
  body: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  attempts: number;
  created_at: string;
  /** Written to the server log by the `log` driver — nobody received it. */
  simulated?: boolean;
};

type OptOut = { phone: string; reason: string; created_at: string };

const STATUS_STYLES: Record<LogEntry['status'], { icon: React.ElementType; tone: string; label: string }> = {
  sent: { icon: CheckCircle2, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Sent' },
  queued: { icon: Clock, tone: 'text-sky-400 bg-sky-500/10 border-sky-500/30', label: 'Waiting to send' },
  failed: { icon: TriangleAlert, tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'Failed' },
  skipped: { icon: XCircle, tone: 'text-slate-400 bg-slate-500/10 border-slate-600/40', label: 'Not sent' },
};

const AUDIENCE_LABELS: Record<string, string> = {
  team_manager: 'Team managers',
  organizer: 'You and your admins',
  player: 'Players',
};

/**
 * What this club sends to its teams and players, and what has actually gone out.
 *
 * Managers and players are reached on their phones, not by email, so this is the
 * page that decides whether a village side finds out its match moved. The log
 * exists because "we told them" has to be checkable.
 */
export const OrgNotificationsPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [counts, setCounts] = useState({ total: 0, sent: 0, queued: 0, failed: 0, skipped: 0 });
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | LogEntry['status']>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newOptOut, setNewOptOut] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, per_page: 25, total: 0, total_pages: 1 });
  const [delivery, setDelivery] = useState({ sms_simulated: false, whatsapp_simulated: false });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter, debouncedSearch]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // The log is paged and searched on the server: "did the Kondotty team
      // get told?" is usually about something older than the newest fifty.
      const query = new URLSearchParams({ page: String(page), per_page: '25' });
      if (statusFilter) query.set('status', statusFilter);
      if (debouncedSearch) query.set('search', debouncedSearch);

      const [settingsRes, logRes] = await Promise.all([
        api.get(`/organizations/${orgId}/notification-settings`),
        api.get(`/organizations/${orgId}/notifications?${query.toString()}`),
      ]);
      setSettings(settingsRes);
      setLog(logRes.notifications || []);
      setCounts(logRes.counts || counts);
      setOptOuts(logRes.opted_out || []);
      if (logRes.pagination) setPagination(logRes.pagination);
      if (logRes.delivery) setDelivery(logRes.delivery);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load your notification settings');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, statusFilter, page, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const simulatedChannels = [
    delivery.whatsapp_simulated && 'WhatsApp',
    delivery.sms_simulated && 'SMS',
  ].filter(Boolean) as string[];

  const save = async (payload: Record<string, unknown>) => {
    if (!orgId) return;
    setSaving(true);
    try {
      setSettings(await api.put(`/organizations/${orgId}/notification-settings`, payload));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save that change');
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleEvent = (event: NotificationEvent) => {
    // Flip it on screen straight away; the save reconciles.
    setSettings(current => current && {
      ...current,
      events: current.events.map(e => (e.event === event.event ? { ...e, enabled: !e.enabled } : e)),
    });
    save({ events: { [event.event]: !event.enabled } });
  };

  const addOptOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !newOptOut.trim()) return;
    try {
      await api.post(`/organizations/${orgId}/notifications/opt-out`, {
        phone: newOptOut,
        reason: 'Asked not to be contacted',
      });
      setNewOptOut('');
      toast.success('We will stop messaging that number');
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add that number');
    }
  };

  const removeOptOut = async (phone: string) => {
    if (!orgId) return;
    if (!(await confirm({
      title: 'Start messaging this number again?',
      message: `${phone} will receive match reminders and fee notices from your club again.`,
      confirmLabel: 'Start again',
    }))) return;

    try {
      await api.post(`/organizations/${orgId}/notifications/opt-in`, { phone });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update that number');
    }
  };

  if (!orgId) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2">
          <BellRing className="w-6 h-6 text-emerald-400" />
          WhatsApp &amp; SMS
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          What your club tells teams and players, and what has already gone out
        </p>
      </div>

      {simulatedChannels.length > 0 && (
        <div role="alert" className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-start gap-3">
          <TriangleAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-bold text-amber-200">
              {simulatedChannels.join(' and ')} {simulatedChannels.length > 1 ? 'are' : 'is'} not connected yet — messages are recorded here but not delivered.
            </p>
            <p className="text-amber-100 mt-1">
              Teams and players are not receiving these. Until the platform connects a messaging service, tell them directly.
            </p>
          </div>
        </div>
      )}

      {/* Tallies */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['sent', 'queued', 'failed', 'skipped'] as const).map(status => {
          const { icon: Icon, tone, label: text } = STATUS_STYLES[status];
          return (
            <div key={status} className={`p-4 rounded-2xl glass-card border ${tone}`}>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                <Icon className="w-3.5 h-3.5" />
                <span>{text}</span>
              </div>
              <div className="text-2xl font-black text-white mt-1 tabular-nums">{counts[status]}</div>
            </div>
          );
        })}
      </div>

      {/* Master switch */}
      <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white font-heading">Send messages from this club</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Off means nothing at all goes out — no approvals, no reminders, no fee notices.
              Individual messages can be switched off below instead.
            </p>
          </div>
          <button
            type="button"
            disabled={saving || !settings}
            onClick={() => settings && save({ enabled: !settings.enabled })}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-60 ${
              settings?.enabled
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {settings?.enabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Per-event switches */}
      <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading">Which messages to send</h3>

        {loading && !settings ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-2">
            {settings?.events.map(event => (
              <div
                key={event.event}
                className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-slate-900/50 border border-slate-800"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">{label(event.event)}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                      {event.channel === 'whatsapp'
                        ? <><MessageCircle className="w-3 h-3 text-emerald-400" /> WhatsApp</>
                        : <><Send className="w-3 h-3 text-sky-400" /> SMS</>}
                    </span>
                    <span className="text-xs text-slate-500">
                      → {AUDIENCE_LABELS[event.audience] || label(event.audience)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{event.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={event.enabled}
                  aria-label={label(event.event)}
                  disabled={saving || !settings.enabled}
                  onClick={() => toggleEvent(event)}
                  title={settings.enabled ? undefined : 'Turn messages on for this club first'}
                  className={`shrink-0 w-12 h-7 rounded-full border transition-colors relative disabled:opacity-40 ${
                    event.enabled ? 'bg-emerald-600/40 border-emerald-500/50' : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      event.enabled ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Numbers we leave alone */}
      <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-amber-400" />
          Numbers we do not message
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          If a manager or player asks you to stop messaging them, add their number here. It is
          honoured for every message, on both WhatsApp and SMS.
        </p>

        <form onSubmit={addOptOut} className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <label htmlFor="opt-out-phone" className="sr-only">Phone number to stop messaging</label>
            <PhoneInput id="opt-out-phone" value={newOptOut} onChange={setNewOptOut} className="w-full px-4 py-2.5 rounded-xl glass-input text-sm" />
          </div>
          <button
            type="submit"
            disabled={!newOptOut.trim()}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <UserRoundX className="w-4 h-4 text-amber-400" />
            <span>Stop messaging</span>
          </button>
        </form>

        {optOuts.length > 0 && (
          <div className="space-y-2">
            {optOuts.map(optOut => (
              <div
                key={optOut.phone}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/50 border border-slate-800"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white tabular-nums flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-slate-500" />
                    +{optOut.phone}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {optOut.reason} · {formatDateTime(optOut.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeOptOut(optOut.phone)}
                  className="shrink-0 text-xs font-bold text-emerald-400 hover:text-emerald-300"
                >
                  Start again
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The log */}
      <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-white font-heading">Message log</h3>
          <div className="w-full sm:w-64">
            <label htmlFor="notification-search" className="sr-only">Search messages</label>
            <input
              id="notification-search"
              type="search"
              placeholder="Search by number or text…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl glass-input text-sm"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['', 'sent', 'queued', 'failed', 'skipped'] as const).map(status => (
              <button
                key={status || 'all'}
                type="button"
                onClick={() => setStatusFilter(status as '' | LogEntry['status'])}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                  statusFilter === status
                    ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {status === '' ? 'All' : STATUS_STYLES[status].label}
              </button>
            ))}
          </div>
        </div>

        {log.length === 0 ? (
          <p className="text-xs text-slate-400">
            {counts.total === 0
              ? 'Nothing sent yet. Approve a team or publish a fixture list and it will show up here.'
              : search ? 'No messages match that search.' : 'No messages match that filter.'}
          </p>
        ) : (
          <div className="space-y-2">
            {log.map(entry => {
              const { icon: Icon, tone, label: statusLabel } = STATUS_STYLES[entry.status];
              return (
                <div key={entry.id} className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">{label(entry.event)}</span>
                        {entry.status === 'sent' && entry.simulated ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-lg border text-amber-400 bg-amber-500/10 border-amber-500/30"
                            title="No messaging service is connected, so this was recorded but not delivered"
                          >
                            <TriangleAlert className="w-3 h-3" aria-hidden="true" />
                            Recorded, not delivered
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-lg border ${tone}`}>
                            <Icon className="w-3 h-3" aria-hidden="true" />
                            {statusLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {entry.recipient_name || 'Unknown'}
                        {entry.to ? <span className="tabular-nums"> · +{entry.to}</span> : ' · no number on file'}
                        {' · '}{formatDateTime(entry.created_at)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">
                      {entry.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mt-2 whitespace-pre-line leading-relaxed border-l-2 border-slate-700 pl-2.5">
                    {entry.body}
                  </p>

                  {entry.error && (
                    <p className="text-xs text-amber-400 mt-1.5">
                      {entry.error}
                      {entry.attempts > 1 ? ` (tried ${entry.attempts} times)` : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Pager
          page={pagination.page}
          totalPages={pagination.total_pages}
          total={pagination.total}
          perPage={pagination.per_page}
          onPage={setPage}
          busy={loading}
        />
      </div>
    </div>
  );
};
