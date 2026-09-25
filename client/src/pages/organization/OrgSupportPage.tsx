import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LifeBuoy, Loader2, Plus, RotateCcw, Search, Siren } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { SkeletonTable, ErrorState, EmptyState, LoadingState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { FieldError, fieldErrorId, useFieldErrors } from '../../components/ui/FieldError';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { useDraft, useLeaveWarning } from '../../lib/useDraft';
import { AttachmentPicker, SupportThreadView } from '../../components/support/SupportThreadView';
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_TONES, formatWhen, notifySupportChanged,
  type SupportCategory, type SupportThread, type SupportTicket,
} from '../../lib/support';


const FILTERS = [
  { value: 'active', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: '', label: 'All' },
];

const StatusChip: React.FC<{ ticket: SupportTicket }> = ({ ticket }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${STATUS_TONES[ticket.status]}`}>
    {STATUS_LABELS.club[ticket.status]}
  </span>
);

/**
 * Help & Support — the club's line to the people who run KickWick.
 *
 * Three views on one route so a link can land anywhere: the list, `?new=1`
 * (prefilled from wherever "Report a problem" was pressed) and `?ticket=<id>`.
 */
export const OrgSupportPage: React.FC = () => {
  const { organization } = useAuth();
  const [params] = useSearchParams();

  if (!organization) return null;

  const ticketId = params.get('ticket');
  if (ticketId) return <ClubTicket key={ticketId} orgId={organization.id} ticketId={ticketId} />;
  if (params.get('new')) return <NewTicket orgId={organization.id} params={params} />;
  return <TicketList orgId={organization.id} />;
};

const TicketList: React.FC<{ orgId: string }> = ({ orgId }) => {
  const [status, setStatus] = useState('active');
  const list = usePaginatedList<SupportTicket>(`/organizations/${orgId}/support/tickets`, { params: { status } });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Help & Support</h1>
          <p className="text-sm text-slate-400 mt-1">Questions about billing, problems on match day, or ideas — we read every one.</p>
        </div>
        <Link
          to="?new=1"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white"
        >
          <Plus className="w-4 h-4" /> New ticket
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter tickets">
          {FILTERS.map(filter => (
            <button
              key={filter.value}
              role="tab"
              aria-selected={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold ring-1 transition-colors ${
                status === filter.value
                  ? 'bg-emerald-500/20 ring-emerald-500/40 text-emerald-200'
                  : 'bg-slate-900/60 ring-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <label htmlFor="support-search" className="sr-only">Search tickets</label>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="support-search"
            type="search"
            placeholder="Search title or KW-number…"
            value={list.search}
            onChange={e => list.setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl glass-input text-sm"
          />
        </div>
      </div>

      {list.initialLoading ? (
        <SkeletonTable rows={4} />
      ) : list.error && list.rows.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={list.search || status !== 'active' ? 'No tickets here' : 'No open questions'}
          message="Stuck with something? Open a ticket and the KickWick team will answer here."
          action={{ label: 'New ticket', to: '?new=1' }}
        />
      ) : (
        <ul className="space-y-2">
          {list.rows.map(ticket => (
            <li key={ticket.id}>
              <Link
                to={`?ticket=${ticket.id}`}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-2xl glass-card border border-slate-800 hover:border-emerald-500/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono">{ticket.reference}</span>
                    <span>·</span>
                    <span>{CATEGORY_LABELS[ticket.category]}</span>
                    {ticket.priority === 'urgent' && <span className="text-rose-300 font-bold">Urgent</span>}
                  </div>
                  <div className="mt-0.5 font-semibold text-white truncate flex items-center gap-2">
                    {ticket.unread && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" aria-label="New reply" />}
                    {ticket.subject}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusChip ticket={ticket} />
                  <span className="text-xs text-slate-500">{formatWhen(ticket.last_message_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pager page={list.page} totalPages={list.totalPages} total={list.total} perPage={list.perPage} onPage={list.setPage} busy={list.loading} />
    </div>
  );
};

interface NewTicketDraft {
  category: SupportCategory | '';
  subject: string;
  body: string;
  urgent: boolean;
}

const NewTicket: React.FC<{ orgId: string; params: URLSearchParams }> = ({ orgId, params }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const { run, busy } = useSingleFlight();
  const draft = useDraft<NewTicketDraft>(`support-new:${orgId}`);

  const presetCategory = params.get('category') as SupportCategory | null;
  const [form, setForm] = useState<NewTicketDraft>(() => ({
    category: presetCategory && Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, presetCategory)
      ? presetCategory
      : draft.initial?.category ?? '',
    subject: draft.initial?.subject ?? '',
    body: draft.initial?.body ?? '',
    urgent: params.get('urgent') === '1' || (draft.initial?.urgent ?? false),
  }));
  const [attachments, setAttachments] = useState<string[]>([]);

  useLeaveWarning(form.body.trim().length > 0 && !busy);

  const update = <K extends keyof NewTicketDraft>(key: K, value: NewTicketDraft[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    draft.save(next);
    fields.clear(key);
  };

  // Where "Report a problem" was pressed from travels with the ticket.
  const context = Object.fromEntries(
    ['page', 'tournament_id', 'match_id', 'invoice_id']
      .map(key => [key, params.get(key)])
      .filter(([, value]) => value),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      try {
        const res = await api.post<SupportThread>(`/organizations/${orgId}/support/tickets`, {
          ...form,
          context,
          attachments,
        });
        draft.clear();
        notifySupportChanged();
        toast.success(`Ticket ${res.ticket.reference} sent. We'll reply here.`);
        navigate(`/organization/support?ticket=${res.ticket.id}`, { replace: true });
      } catch (err: any) {
        if (!fields.capture(err)) toast.error(err?.message || 'Could not send your ticket.');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link to="/organization/support" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> All tickets
      </Link>
      <div>
        <h1 className="text-2xl font-black font-heading text-white">New ticket</h1>
        <p className="text-sm text-slate-400 mt-1">Tell us what happened. Screenshots help us fix things faster.</p>
      </div>

      {draft.restored && (
        <p className="text-xs text-slate-400">
          We kept what you were writing.{' '}
          <button
            type="button"
            className="underline hover:text-white"
            onClick={() => { draft.clear(); setForm({ category: '', subject: '', body: '', urgent: false }); setAttachments([]); }}
          >
            Start over
          </button>
        </p>
      )}

      <form onSubmit={submit} className="space-y-5 p-5 rounded-2xl glass-card border border-slate-800">
        <fieldset>
          <legend className="block text-xs font-semibold text-slate-300 mb-2">What is it about?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" {...fields.inputProps('category')}>
            {(Object.keys(CATEGORY_LABELS) as SupportCategory[]).map(category => (
              <label
                key={category}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm cursor-pointer ring-1 transition-colors ${
                  form.category === category ? 'bg-emerald-500/15 ring-emerald-500/40 text-white' : 'bg-slate-900/60 ring-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={category}
                  checked={form.category === category}
                  onChange={() => update('category', category)}
                  className="accent-emerald-500"
                />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>
          <FieldError id={fieldErrorId('category')} message={fields.get('category')} />
        </fieldset>

        <div>
          <label htmlFor="support-subject" className="block text-xs font-semibold text-slate-300 mb-1.5">Title</label>
          <input
            id="support-subject"
            value={form.subject}
            maxLength={140}
            onChange={e => update('subject', e.target.value)}
            placeholder="e.g. Charged twice for the Pro plan"
            className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm"
            {...fields.inputProps('subject')}
          />
          <FieldError id={fieldErrorId('subject')} message={fields.get('subject')} />
        </div>

        <div>
          <label htmlFor="support-body" className="block text-xs font-semibold text-slate-300 mb-1.5">What happened?</label>
          <textarea
            id="support-body"
            rows={6}
            value={form.body}
            maxLength={5000}
            onChange={e => update('body', e.target.value)}
            placeholder="What were you doing, what did you expect, and what happened instead?"
            className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm"
            {...fields.inputProps('body')}
          />
          <FieldError id={fieldErrorId('body')} message={fields.get('body')} />
        </div>

        <div>
          <AttachmentPicker id="support-new-attach" value={attachments} onChange={setAttachments} />
          <FieldError id={fieldErrorId('attachments')} message={fields.get('attachments')} />
        </div>

        <label className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/5 ring-1 ring-rose-500/20 cursor-pointer">
          <input type="checkbox" checked={form.urgent} onChange={e => update('urgent', e.target.checked)} className="mt-0.5 accent-rose-500" />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-rose-200"><Siren className="w-4 h-4" /> A match is live right now</span>
            <span className="block text-xs text-slate-400 mt-0.5">Tick this only if the problem is stopping a game — it goes to the top of our queue.</span>
          </span>
        </label>

        {Object.keys(context).length > 0 && (
          <p className="text-xs text-slate-500">We'll attach where you came from so we can find it quickly.</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Send ticket
        </button>
      </form>
    </div>
  );
};

const ClubTicket: React.FC<{ orgId: string; ticketId: string }> = ({ orgId, ticketId }) => {
  const toast = useToast();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useSingleFlight();
  const base = `/organizations/${orgId}/support/tickets/${ticketId}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      setThread(await api.get<SupportThread>(base));
      notifySupportChanged();
    } catch (err: any) {
      setError(err?.message || 'Could not open this ticket.');
    }
  }, [base]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!thread) return <LoadingState label="Opening ticket" />;

  const { ticket } = thread;

  const setStatus = (status: 'resolved' | 'open') =>
    run(async () => {
      try {
        setThread(await api.put<SupportThread>(`${base}/status`, { status }));
        toast.success(status === 'resolved' ? 'Marked as resolved. Reply any time to reopen it.' : 'Ticket reopened.');
      } catch (err: any) {
        toast.error(err?.message || 'Could not update the ticket.');
      }
    });

  return (
    <div className="space-y-5 max-w-3xl">
      <Link to="/organization/support" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> All tickets
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-mono">{ticket.reference}</span>
            <span>·</span>
            <span>{CATEGORY_LABELS[ticket.category]}</span>
            <StatusChip ticket={ticket} />
          </div>
          <h1 className="mt-1 text-xl font-black font-heading text-white break-words">{ticket.subject}</h1>
        </div>
        {(ticket.status === 'open' || ticket.status === 'awaiting_reply') && (
          <button
            onClick={() => setStatus('resolved')}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Mark as resolved
          </button>
        )}
        {ticket.status === 'resolved' && (
          <button
            onClick={() => setStatus('open')}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-60"
          >
            <RotateCcw className="w-4 h-4" /> Reopen
          </button>
        )}
      </div>

      <SupportThreadView
        thread={thread}
        side="club"
        closedNote={ticket.status === 'closed' ? `This ticket is closed. Open a new one and mention ${ticket.reference}.` : null}
        onReply={async (body, attachments) => {
          setThread(await api.post<SupportThread>(`${base}/messages`, { body, attachments }));
        }}
      />
    </div>
  );
};
