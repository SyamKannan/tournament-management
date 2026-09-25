import React, { useCallback, useEffect, useState } from 'react';
import { ScrollText, Search, Plus, X, Eye, Pencil, Users, ExternalLink } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { SkeletonTable, ErrorState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { FieldError, fieldErrorId, useFieldErrors } from '../../components/ui/FieldError';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { formatDate, formatDateTime } from '../../lib/format';
import { label } from '../../lib/labels';
import { LegalMarkdown } from '../../components/legal/LegalMarkdown';
import {
  LEGAL_PATHS, LEGAL_TITLES, LEGAL_TYPES,
  type AdminLegalSummary, type LegalAcceptanceRow, type LegalType,
} from '../../lib/legal';

const METHOD_LABELS: Record<LegalAcceptanceRow['method'], string> = {
  signup: 'When signing up',
  prompt: 'When asked at sign-in',
};

/**
 * Terms & Conditions and Privacy Policy. Publishing never edits a version in
 * place — it adds the next one — and the admin decides whether a change is big
 * enough that every account must accept it again.
 */
export const AdminLegalPage: React.FC = () => {
  const [type, setType] = useState<LegalType>('terms');
  const [documents, setDocuments] = useState<Record<LegalType, AdminLegalSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<{ documents: Record<LegalType, AdminLegalSummary> }>('/admin/legal')
      .then(res => setDocuments(res.documents))
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load the documents.'));
  }, []);

  useEffect(load, [load]);
  useEffect(() => { setEditing(false); setViewingVersion(null); }, [type]);

  if (error && !documents) return <ErrorState message={error} onRetry={load} />;

  const summary = documents?.[type];
  const current = summary?.versions[0] ?? null;
  const coverage = summary?.coverage;
  const percent = coverage && coverage.total > 0 ? Math.round((coverage.accepted / coverage.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2.5">
          <ScrollText className="w-7 h-7 text-emerald-400" />
          <span>Terms & Privacy</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Every club, player and team manager agrees to these. Signing up asks for it; everyone else is asked when they next sign in.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Document">
        {LEGAL_TYPES.map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => setType(t)}
            className={`min-h-11 px-4 rounded-xl text-sm font-semibold border ${
              type === t ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {LEGAL_TITLES[t]}
          </button>
        ))}
      </div>

      {!documents ? <SkeletonTable rows={4} /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Current version</div>
              <div className="mt-1 text-2xl font-black text-white">{current ? `Version ${current.version}` : 'Not published'}</div>
              {current && <div className="text-sm text-slate-400 mt-1">{formatDate(current.published_at)}{current.published_by_name && ` · ${current.published_by_name}`}</div>}
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Everyone must have accepted</div>
              <div className="mt-1 text-2xl font-black text-white">{summary?.required_version ? `Version ${summary.required_version}` : '—'}</div>
              <div className="text-sm text-slate-400 mt-1">Later versions without "accept again" are shown but not asked for.</div>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Accounts up to date</div>
              <div className="mt-1 text-2xl font-black text-white">
                {coverage ? `${coverage.accepted} of ${coverage.total}` : '—'}
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
              </div>
              <div className="text-sm text-slate-400 mt-1">The rest are asked when they next sign in.</div>
            </div>
          </div>

          {editing ? (
            <PublishForm
              type={type}
              base={current}
              onCancel={() => setEditing(false)}
              onPublished={() => { setEditing(false); load(); }}
            />
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold">
                {current ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {current ? 'Publish a new version' : `Publish the ${LEGAL_TITLES[type]}`}
              </button>
              {current && (
                <a href={LEGAL_PATHS[type]} target="_blank" rel="noopener" className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white">
                  <ExternalLink className="w-4 h-4" /> Open the public page
                </a>
              )}
            </div>
          )}

          <section className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
            <h2 className="px-5 py-4 text-base font-bold text-white border-b border-slate-800">Version history</h2>
            {summary && summary.versions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">Nothing published yet — until something is, nobody is asked to agree.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-bold">Version</th>
                      <th className="px-5 py-3 font-bold">Published</th>
                      <th className="px-5 py-3 font-bold">What changed</th>
                      <th className="px-5 py-3 font-bold">Accept again?</th>
                      <th className="px-5 py-3 font-bold text-right">Accepted by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {summary?.versions.map(v => (
                      <tr key={v.version} className={viewingVersion === v.version ? 'bg-emerald-500/5' : ''}>
                        <td className="px-5 py-3 font-bold text-white whitespace-nowrap">
                          <a href={`${LEGAL_PATHS[type]}?version=${v.version}`} target="_blank" rel="noopener" className="hover:text-emerald-400 inline-flex items-center gap-1.5">
                            Version {v.version} <Eye className="w-3.5 h-3.5" aria-label="Read this version" />
                          </a>
                        </td>
                        <td className="px-5 py-3 text-slate-300 whitespace-nowrap">
                          {formatDate(v.published_at)}
                          {v.published_by_name && <span className="block text-xs text-slate-500">{v.published_by_name}</span>}
                        </td>
                        <td className="px-5 py-3 text-slate-300 min-w-[14rem]">{v.summary_of_changes || '—'}</td>
                        <td className="px-5 py-3 text-slate-300">{v.requires_reacceptance ? 'Yes' : 'No'}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setViewingVersion(viewingVersion === v.version ? null : v.version)}
                            className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                            aria-expanded={viewingVersion === v.version}
                          >
                            <Users className="w-4 h-4" /> {v.acceptances}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {viewingVersion !== null && (
            <AcceptanceList type={type} version={viewingVersion} onClose={() => setViewingVersion(null)} />
          )}
        </>
      )}
    </div>
  );
};

const PublishForm: React.FC<{
  type: LegalType;
  base: { title: string; body: string } | null;
  onCancel: () => void;
  onPublished: () => void;
}> = ({ type, base, onCancel, onPublished }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const fields = useFieldErrors();
  const flight = useSingleFlight();
  const [title, setTitle] = useState(base?.title ?? LEGAL_TITLES[type]);
  const [body, setBody] = useState(base?.body ?? '');
  const [summary, setSummary] = useState('');
  const [reaccept, setReaccept] = useState(true);
  const [preview, setPreview] = useState(false);
  const isFirst = !base;

  const publish = () => flight.run(async () => {
    const proceed = await confirm({
      title: isFirst ? `Publish the ${LEGAL_TITLES[type]}?` : 'Publish this new version?',
      message: isFirst || reaccept
        ? 'Every club, player and team manager will be asked to accept it before they can carry on using KickWick. Published versions cannot be edited.'
        : 'It replaces the current text, but nobody is asked to accept it again. Published versions cannot be edited.',
      confirmLabel: 'Publish',
    });
    if (!proceed) return;

    try {
      await api.post(`/admin/legal/${type}`, {
        title,
        body,
        summary_of_changes: summary,
        requires_reacceptance: isFirst || reaccept,
      });
      toast.success(`${LEGAL_TITLES[type]} published`);
      onPublished();
    } catch (err) {
      if (!fields.capture(err)) toast.error(err instanceof Error ? err.message : 'Could not publish');
    }
  });

  const input = 'w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-white placeholder-slate-500';

  return (
    <div className="p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-white">{isFirst ? `Publish the ${LEGAL_TITLES[type]}` : 'New version'}</h2>
        <button type="button" onClick={onCancel} className="w-9 h-9 grid place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label htmlFor="legal-title" className="block text-sm font-semibold text-slate-300 mb-1.5">Title</label>
        <input id="legal-title" value={title} onChange={e => { setTitle(e.target.value); fields.clear('title'); }} className={input} {...fields.inputProps('title')} />
        <FieldError id={fieldErrorId('title')} message={fields.get('title')} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="legal-body" className="block text-sm font-semibold text-slate-300">Text</label>
          <button type="button" onClick={() => setPreview(p => !p)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300">
            {preview ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-4">
            <LegalMarkdown source={body} />
          </div>
        ) : (
          <textarea
            id="legal-body"
            value={body}
            onChange={e => { setBody(e.target.value); fields.clear('body'); }}
            rows={20}
            className={`${input} font-mono text-sm leading-relaxed`}
            {...fields.inputProps('body')}
          />
        )}
        <p className="mt-1 text-xs text-slate-400">"## Heading" starts a section, "- " starts a list item, **double stars** make text bold. Leave a blank line between paragraphs.</p>
        <FieldError id={fieldErrorId('body')} message={fields.get('body')} />
      </div>

      {!isFirst && (
        <>
          <div>
            <label htmlFor="legal-summary" className="block text-sm font-semibold text-slate-300 mb-1.5">What changed</label>
            <input
              id="legal-summary"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              maxLength={1000}
              placeholder="e.g. New rules for refunds of entry fees"
              className={input}
            />
            <p className="mt-1 text-xs text-slate-400">Shown to people when they are asked to accept again, and in the version history.</p>
          </div>

          <label className="flex items-start gap-3 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={reaccept} onChange={e => setReaccept(e.target.checked)} className="mt-0.5 w-5 h-5 accent-emerald-500" />
            <span>
              <span className="font-semibold">Everyone must accept this version again</span>
              <span className="block text-slate-400">Turn off for small fixes like a typo — people who accepted the earlier version won't be asked again.</span>
            </span>
          </label>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={publish}
          disabled={flight.busy || !title.trim() || !body.trim()}
          className="min-h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold disabled:opacity-40"
        >
          {flight.busy ? 'Publishing…' : 'Publish'}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white">
          Cancel
        </button>
      </div>
    </div>
  );
};

const AcceptanceList: React.FC<{ type: LegalType; version: number; onClose: () => void }> = ({ type, version, onClose }) => {
  const list = usePaginatedList<LegalAcceptanceRow>(`/admin/legal/${type}/versions/${version}/acceptances`);

  return (
    <section className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-base font-bold text-white">Who accepted version {version}</h2>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={list.search}
              onChange={e => list.setSearch(e.target.value)}
              placeholder="Search name, email or phone"
              aria-label="Search who accepted"
              className="w-full min-h-10 rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3 text-sm text-white placeholder-slate-500"
            />
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 grid place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {list.error && list.rows.length === 0 ? (
        <div className="p-5"><ErrorState message={list.error} onRetry={list.reload} /></div>
      ) : list.loading && list.rows.length === 0 ? (
        <div className="p-5"><SkeletonTable rows={3} /></div>
      ) : list.rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">{list.search ? 'Nobody matches that search.' : 'Nobody has accepted this version yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-bold">Person</th>
                <th className="px-5 py-3 font-bold">Role</th>
                <th className="px-5 py-3 font-bold">Accepted</th>
                <th className="px-5 py-3 font-bold">How</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {list.rows.map(row => (
                <tr key={row.id}>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-white">{row.name || 'Deleted account'}</div>
                    <div className="text-xs text-slate-400">{[row.email, row.phone].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{row.role ? label(row.role) : '—'}</td>
                  <td className="px-5 py-3 text-slate-300 whitespace-nowrap">{formatDateTime(row.accepted_at)}</td>
                  <td className="px-5 py-3 text-slate-300">{METHOD_LABELS[row.method] ?? label(row.method)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 pb-4">
        <Pager page={list.page} totalPages={list.totalPages} total={list.total} perPage={list.perPage} onPage={list.setPage} busy={list.loading} />
      </div>
    </section>
  );
};
