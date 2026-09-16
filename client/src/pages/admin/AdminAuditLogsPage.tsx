import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { AuditLog } from '../../types';
import { Search } from 'lucide-react';
import { Skeleton, SkeletonTable } from '../../components/ui/Feedback';

export const AdminAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/audit-logs');
        setLogs(res);
      } catch (err) {
        console.error('Failed to load audit logs', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(filter.toLowerCase()) ||
    l.user_name.toLowerCase().includes(filter.toLowerCase()) ||
    l.details.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={8} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Platform Audit & Security Logs</h1>
          <p className="text-xs text-slate-400 mt-1">A record of admin actions, account switches and scoring changes</p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search action or user..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl glass-input text-xs"
          />
        </div>
      </div>

      <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Actor</th>
                <th className="px-4 py-3.5">Action Code</th>
                <th className="px-4 py-3.5">Target Entity</th>
                <th className="px-5 py-3.5">Log Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {filteredLogs.map(log => {
                const isViolation = log.action.includes('VIOLATION') || log.action.includes('BLOCKED');
                return (
                  <tr key={log.id} className={`hover:bg-slate-800/40 transition-colors ${isViolation ? 'bg-rose-500/5' : ''}`}>
                    <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 font-sans">
                      <div className="font-semibold text-white">{log.user_name}</div>
                      <span className="text-[11px] text-slate-500 font-mono">{log.user_role}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                        isViolation ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">
                      {log.entity_type} <span className="text-slate-500">({log.entity_id.substring(0, 10)})</span>
                    </td>
                    <td className="px-5 py-3.5 font-sans text-slate-300 text-xs">
                      {log.details}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
