import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Inbox, KeyRound, Mail, Phone, Search } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { SkeletonTable, ErrorState, EmptyState, LoadingState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { label } from '../../lib/labels';
import { SupportThreadView } from '../../components/support/SupportThreadView';
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_TONES, formatWhen, notifySupportChanged,
  type SupportCategory, type SupportStatus, type SupportThread, type SupportTicket,
} from '../../lib/support';


interface Summary {
  open: number;
  awaiting_reply: number;
  unread: number;
  urgent: number;
}

const TABS: { value: string; label: string; summaryKey?: keyof Summary }[] = [
  { value: 'open', label: 'Needs a reply', summaryKey: 'open' },
  { value: 'awaiting_reply', label: 'Waiting on club', summaryKey: 'awaiting_reply' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: '', label: 'All' },
];

const CONTEXT_LABELS: Record<string, string> = {
  page: 'Page',
  tournament_id: 'Tournament',
  match_id: 'Match',
  invoice_id: 'Invoice',
  user_agent: 'Browser',
};

const StatusChip: React.FC<{ status: SupportStatus }> = ({ status }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${STATUS_TONES[status]}`}>
    {STATUS_LABELS.admin[status]}
  </span>
);

/** The platform's support inbox: every club's tickets, and the public contact form's. */
export const AdminSupportPage: React.FC = () => {
  const [params] = useSearchParams();
  const ticketId = params.get('ticket');
  return ticketId ? <AdminTicket key={ticketId} ticketId={ticketId} /> : <SupportInbox />;
};

const SupportInbox: React.FC = () => {
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState('');
  const list = usePaginatedList<SupportTicket>('/admin/support/tickets', { params: { status, category } });
  const summary = (list.raw?.summary ?? null) as Summary | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Support Inbox</h1>
          <p className="text-sm text-slate-400 mt-1">Club tickets and messages from the sign-in page's contact form</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <label htmlFor="support-category" className="sr-only">Category</label>
          <select
            id="support-category"
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2.5 rounded-xl glass-input text-sm"
          >
            <option value="">Every category</option>
            {(Object.keys(CATEGORY_LABELS) as SupportCategory[]).map(key => (
              <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>
            ))}
          </select>
          <div className="relative flex-1 sm:w-64">
            <label htmlFor="admin-support-search" className="sr-only">Search tickets</label>
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="admin-support-search"
              type="search"
              placeholder="Title, name, phone or KW-number…"
              value={list.search}
              onChange={e => list.setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl glass-input text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
        {TABS.map(tab => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ring-1 transition-colors ${
              status === tab.value
                ? 'bg-emerald-500/20 ring-emerald-500/40 text-emerald-200'
                : 'bg-slate-900/60 ring-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.summaryKey && summary ? ` (${summary[tab.summaryKey]})` : ''}
          </button>
        ))}
        {summary && summary.urgent > 0 && (
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">
            {summary.urgent} urgent
          </span>
        )}
      </div>

      {list.initialLoading ? (
        <SkeletonTable rows={6} />
      ) : list.error && list.rows.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing here" message="No tickets match this view." />
      ) : (
        <ul className="space-y-2">
          {list.rows.map(ticket => (
            <li key={ticket.id}>
              <Link
                to={`?ticket=${ticket.id}`}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-2xl glass-card border transition-colors hover:border-emerald-500/40 ${
                  ticket.priority === 'urgent' && ticket.status === 'open' ? 'border-rose-500/40' : 'border-slate-800'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono">{ticket.reference}</span>
                    <span>·</span>
                    <span className="truncate">{ticket.organization_name ?? `${ticket.contact_name} (contact form)`}</span>
                    <span>·</span>
                    <span>{CATEGORY_LABELS[ticket.category]}</span>
                    {ticket.priority === 'urgent' && <span className="text-rose-300 font-bold">Urgent</span>}
                  </div>
                  <div className="mt-0.5 font-semibold text-white truncate flex items-center gap-2">
                    {ticket.unread && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" aria-label="Unread" />}
                    {ticket.subject}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusChip status={ticket.status} />
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

const AdminTicket: React.FC<{ ticketId: string }> = ({ ticketId }) => {
  const toast = useToast();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { run, busy } = useSingleFlight();
  const base = `/admin/support/tickets/${ticketId}`;

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

  const change = (patch: Partial<Pick<SupportTicket, 'status' | 'priority' | 'category'>>) =>
    run(async () => {
      try {
        setThread(await api.put<SupportThread>(base, patch));
        notifySupportChanged();
      } catch (err: any) {
        toast.error(err?.message || 'Could not update the ticket.');
      }
    });

  const context = Object.entries(ticket.context ?? {});

  return (
    <div className="space-y-5">
      <Link to="/admin/support" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Inbox
      </Link>

      <div className="grid lg:grid-cols-[1fr_18rem] gap-6 items-start">
        <div className="space-y-5 min-w-0">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-mono">{ticket.reference}</span>
              <StatusChip status={ticket.status} />
              {ticket.priority === 'urgent' && <span className="text-rose-300 font-bold">Urgent</span>}
            </div>
            <h1 className="mt-1 text-xl font-black font-heading text-white break-words">{ticket.subject}</h1>
          </div>

          <SupportThreadView
            thread={thread}
            side="admin"
            onReply={async (body, attachments, internal) => {
              setThread(await api.post<SupportThread>(`${base}/messages`, { body, attachments, internal }));
              notifySupportChanged();
            }}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <section className="p-4 rounded-2xl glass-card border border-slate-800 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ticket</h2>
            {([
              ['status', 'Status', Object.keys(STATUS_LABELS.admin), (v: string) => STATUS_LABELS.admin[v as SupportStatus]],
              ['priority', 'Priority', ['normal', 'urgent'], (v: string) => label(v)],
              ['category', 'Category', Object.keys(CATEGORY_LABELS), (v: string) => CATEGORY_LABELS[v as SupportCategory]],
            ] as const).map(([field, title, options, show]) => (
              <div key={field}>
                <label htmlFor={`ticket-${field}`} className="block text-xs font-semibold text-slate-400 mb-1">{title}</label>
                <select
                  id={`ticket-${field}`}
                  value={ticket[field]}
                  disabled={busy}
                  onChange={e => change({ [field]: e.target.value } as any)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-sm"
                >
                  {options.map(option => <option key={option} value={option}>{show(option)}</option>)}
                </select>
              </div>
            ))}
            <p className="text-xs text-slate-500">Opened {formatWhen(ticket.created_at)}</p>
          </section>

          <section className="p-4 rounded-2xl glass-card border border-slate-800 space-y-2 text-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">From</h2>
            {ticket.organization_name && (
              <Link to="/admin/organizations" className="flex items-center gap-2 text-emerald-300 hover:underline">
                <Building2 className="w-4 h-4" /> {ticket.organization_name}
              </Link>
            )}
            <p className="text-white font-semibold">{ticket.contact_name || 'Unknown'}</p>
            {ticket.contact_phone && (
              <a href={`tel:+${ticket.contact_phone.replace(/^\+/, '')}`} className="flex items-center gap-2 text-slate-300 hover:text-white">
                <Phone className="w-4 h-4" /> +{ticket.contact_phone}
              </a>
            )}
            {ticket.contact_email && (
              <a href={`mailto:${ticket.contact_email}`} className="flex items-center gap-2 text-slate-300 hover:text-white break-all">
                <Mail className="w-4 h-4 shrink-0" /> {ticket.contact_email}
              </a>
            )}
          </section>

          {thread.matched_accounts && (
            <section className="p-4 rounded-2xl glass-card border border-slate-800 space-y-2 text-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Accounts on this number</h2>
              {thread.matched_accounts.length === 0 ? (
                <p className="text-slate-400">No account uses this number.</p>
              ) : (
                thread.matched_accounts.map(account => (
                  <div key={account.id} className="p-2 rounded-xl bg-slate-900/60">
                    <p className="font-semibold text-white">{account.name}</p>
                    <p className="text-xs text-slate-400">{label(account.role)}{account.organization_name ? ` · ${account.organization_name}` : ''}</p>
                    <p className="text-xs text-slate-500 break-all">{account.email}</p>
                  </div>
                ))
              )}
              {thread.matched_accounts.length > 0 && (
                <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:underline">
                  <KeyRound className="w-3.5 h-3.5" /> Issue a temporary password from Users
                </Link>
              )}
            </section>
          )}

          {context.length > 0 && (
            <section className="p-4 rounded-2xl glass-card border border-slate-800 space-y-1.5 text-xs">
              <h2 className="font-bold uppercase tracking-wider text-slate-400">Sent from</h2>
              {context.map(([key, value]) => (
                <p key={key} className="text-slate-300 break-all">
                  <span className="text-slate-500">{CONTEXT_LABELS[key] ?? label(key)}: </span>{value}
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
