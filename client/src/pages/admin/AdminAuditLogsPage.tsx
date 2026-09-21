import React from 'react';
import type { AuditLog } from '../../types';
import { Search } from 'lucide-react';
import { Skeleton, SkeletonTable, ErrorState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { label } from '../../lib/labels';
import { usePaginatedList } from '../../lib/usePaginatedList';

/**
 * The audit trail, a page at a time.
 *
 * It used to download every row ever written and filter them in the browser.
 * Search now runs in the database across the whole history, so last month's
 * incident is found, not just whatever the newest rows happened to contain.
 */
export const AdminAuditLogsPage: React.FC = () => {
  const list = usePaginatedList<AuditLog>('/admin/audit-logs', { perPage: 50 });
  const logs = list.rows;

  if (list.initialLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={8} />
      </div>
    );
  }

  if (list.error && logs.length === 0) {
    return <ErrorState message={list.error} onRetry={list.reload} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Platform Audit & Security Logs</h1>
          <p className="text-sm text-slate-400 mt-1">A record of admin actions, account switches and scoring changes</p>
        </div>

        <div className="relative w-full sm:w-72">
          <label htmlFor="audit-search" className="sr-only">Search the audit log</label>
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="audit-search"
            type="search"
            placeholder="Search action, person or details…"
            value={list.search}
            onChange={e => list.setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl glass-input text-sm"
          />
        </div>
      </div>

      <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
        <div className="overflow-x-auto">
          <table className="responsive-table w-full min-w-[860px] text-sm text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Actor</th>
                <th className="px-4 py-3.5">Action Code</th>
                <th className="px-4 py-3.5">Target Entity</th>
                <th className="px-5 py-3.5">Log Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {logs.map(log => {
                const isViolation = log.action.includes('VIOLATION') || log.action.includes('BLOCKED');
                return (
                  <tr key={log.id} className={`hover:bg-slate-800/40 transition-colors ${isViolation ? 'bg-rose-500/5' : ''}`}>
                    <td data-label="Timestamp" className="px-5 py-3.5 text-slate-400 whitespace-nowrap text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td data-label="Actor" className="rt-full px-4 py-3.5 font-sans">
                      <div className="font-semibold text-white">{log.user_name}</div>
                      <span className="text-xs text-slate-500 font-mono">{log.user_role}</span>
                    </td>
                    <td data-label="Action Code" className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        isViolation ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {label(log.action)}
                      </span>
                    </td>
                    <td data-label="Target Entity" className="px-4 py-3.5 text-slate-300">
                      {log.entity_type} <span className="text-slate-500">({log.entity_id.substring(0, 10)})</span>
                    </td>
                    <td data-label="Log Details" className="rt-full px-5 py-3.5 font-sans text-slate-300 text-xs">
                      {log.details}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {logs.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">
              {list.search ? 'Nothing in the audit log matches that search.' : 'No audit entries yet.'}
            </p>
          )}
        </div>
      </div>

      <Pager
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        perPage={list.perPage}
        onPage={list.setPage}
        busy={list.loading}
      />
    </div>
  );
};
