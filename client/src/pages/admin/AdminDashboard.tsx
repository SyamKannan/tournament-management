import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { 
  Building2, CreditCard, DollarSign, TrendingUp, 
  Trophy, Users, ShieldCheck, ArrowUpRight, Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/metrics');
        setMetrics(res);
      } catch (err) {
        console.error('Failed to fetch admin metrics', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  if (loading || !metrics) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span>Loading Platform Metrics...</span>
      </div>
    );
  }

  const { organizations, subscriptions, revenue, activity } = metrics;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Platform Super Admin Overview</h1>
          <p className="text-xs text-slate-400 mt-1">Platform-wide monetization, organization tenants, and SaaS revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/plans"
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
          >
            Manage SaaS Plans & Pricing ↗
          </Link>
        </div>
      </div>

      {/* Primary Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Monthly Recurring (MRR)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-white font-heading font-mono">₹{revenue.mrr.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>₹{(revenue.arr).toLocaleString()} Projected Annual (ARR)</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Platform Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-heading font-mono">₹{revenue.totalPlatformRevenue.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400 mt-1">From Subscriptions & One-Time Packs</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Organizations</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-white font-heading font-mono">{organizations.active} <span className="text-xs text-slate-500 font-normal">/ {organizations.total}</span></div>
            <div className="text-[11px] text-slate-400 mt-1">{subscriptions.active} Paying Subscriptions</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Platform Tournaments</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-amber-400 font-heading font-mono">{activity.totalTournaments}</div>
            <div className="text-[11px] text-slate-400 mt-1">{activity.totalTeams} Teams • {activity.totalPlayers} Players</div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Link
          to="/admin/plans"
          className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <h3 className="text-sm font-bold text-white font-heading">SaaS Plans & Pricing</h3>
          <p className="text-xs text-slate-400 mt-1">Configure monthly/yearly prices, tournament limits, and feature flags.</p>
        </Link>

        <Link
          to="/admin/organizations"
          className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-900 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <Building2 className="w-5 h-5 text-cyan-400" />
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </div>
          <h3 className="text-sm font-bold text-white font-heading">Organizations (Tenants)</h3>
          <p className="text-xs text-slate-400 mt-1">Activate, suspend, or create sports clubs and academy tenants.</p>
        </Link>

        <Link
          to="/admin/audit-logs"
          className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-900 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
          </div>
          <h3 className="text-sm font-bold text-white font-heading">Platform Audit Logs</h3>
          <p className="text-xs text-slate-400 mt-1">Inspect all administrative actions, plan changes, and security events.</p>
        </Link>
      </div>
    </div>
  );
};
