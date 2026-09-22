import React, { useState, useEffect } from 'react';
import { SportsLoader } from '../../components/ui/SportsLoader';
import { api } from '../../services/api';
import { 
  Building2, CreditCard, DollarSign, TrendingUp, 
  Trophy, ArrowUpRight, TriangleAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Only the super admin can connect a messaging gateway, so a setup that is
  // not really sending — above all, password reset codes — is put here.
  const [health, setHealth] = useState<{ ok: boolean; issues: { channel: string; severity: string; message: string }[] } | null>(null);

  useEffect(() => {
    api.get('/admin/notification-health').then(setHealth).catch(() => setHealth(null));
  }, []);

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
      <div className="p-8 flex flex-col items-center gap-3 text-slate-400">
        <SportsLoader size="md" />
        <span>Loading Platform Metrics...</span>
      </div>
    );
  }

  const { organizations, subscriptions, revenue, activity } = metrics;
  const deliveryIssues = (health?.issues ?? []).filter(issue => issue.severity !== 'info');
  const simulatedOnly = health && deliveryIssues.length === 0 && (health.issues ?? []).length > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {deliveryIssues.length > 0 && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 flex items-start gap-3">
          <TriangleAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm space-y-1">
            <p className="font-bold text-rose-200">WhatsApp / SMS are not being delivered</p>
            {deliveryIssues.map((issue, i) => <p key={i} className="text-rose-100">{issue.message}</p>)}
            <p className="text-rose-100">
              Configure a gateway (see <code className="font-code">SMS_DRIVER</code> in the deployment guide). Until then, locked-out
              users can be helped from <Link to="/admin/users" className="underline font-semibold">Users → Reset password</Link>.
            </p>
          </div>
        </div>
      )}
      {simulatedOnly && (
        <p className="text-sm text-slate-400">
          Messages are being recorded, not sent — no WhatsApp/SMS gateway is configured in this environment.
        </p>
      )}
      {/* Top Header with live status badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Platform Overview
            </span>
          </div>
          <h1 className="text-3xl font-black font-heading text-white tracking-tight">
            Super Admin Overview
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Revenue, active clubs and subscriptions at a glance
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/admin/users"
            className="px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <span>👥 View Users & Players</span>
          </Link>
          <Link
            to="/admin/plans"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-1.5 active:scale-95"
          >
            <span>Manage Plans & Pricing ↗</span>
          </Link>
        </div>
      </div>

      {/* Primary Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: monthly revenue */}
        <div className="relative p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-emerald-500/40 shadow-xl shadow-black/40 overflow-hidden group transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 opacity-80" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white font-heading font-mono tracking-tight">₹{revenue.mrr.toLocaleString()}</div>
            <div className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1.5 font-bold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>₹{(revenue.arr).toLocaleString()} Projected Annual (ARR)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Revenue */}
        <div className="relative p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-cyan-500/40 shadow-xl shadow-black/40 overflow-hidden group transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-80" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Platform Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/10 group-hover:scale-110 transition-transform">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-cyan-300 font-heading font-mono tracking-tight">₹{revenue.totalPlatformRevenue.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-1.5 font-medium">From Subscriptions & One-Time Packs</div>
          </div>
        </div>

        {/* Card 3: Organizations */}
        <div className="relative p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-indigo-500/40 shadow-xl shadow-black/40 overflow-hidden group transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-80" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Organizations</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/10 group-hover:scale-110 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white font-heading font-mono tracking-tight">
              {organizations.active} <span className="text-sm text-slate-500 font-normal">/ {organizations.total}</span>
            </div>
            <div className="text-xs text-indigo-300/90 mt-1.5 font-medium">{subscriptions.active} Paying Subscriptions</div>
          </div>
        </div>

        {/* Card 4: Tournaments */}
        <div className="relative p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-amber-500/40 shadow-xl shadow-black/40 overflow-hidden group transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-80" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Platform Tournaments</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10 group-hover:scale-110 transition-transform">
              <Trophy className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-amber-300 font-heading font-mono tracking-tight">{activity.totalTournaments}</div>
            <div className="text-xs text-slate-400 mt-1.5 font-medium">{activity.totalTeams} Teams • {activity.totalPlayers} Players</div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Link
          to="/admin/organizations"
          className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/80 border border-slate-800/80 hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/5 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <h3 className="text-base font-bold text-white font-heading">Organizations</h3>
          <p className="text-xs text-slate-400 mt-1.5">Manage clubs, suspend or activate them, or sign in as a club admin.</p>
        </Link>

        <Link
          to="/admin/users"
          className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/80 border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/5 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <Trophy className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </div>
          <h3 className="text-base font-bold text-white font-heading">Users & Players</h3>
          <p className="text-xs text-slate-400 mt-1.5">Search and view all registered athletes, team managers, and 1-click test their profiles.</p>
        </Link>

        <Link
          to="/admin/plans"
          className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/80 border border-slate-800/80 hover:border-violet-500/40 hover:shadow-xl hover:shadow-violet-500/5 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
              <CreditCard className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-violet-400 transition-colors" />
          </div>
          <h3 className="text-base font-bold text-white font-heading">Club Plans & Pricing</h3>
          <p className="text-xs text-slate-400 mt-1.5">Configure recurring tiers, one-time packs, tournament limits, and billing intervals.</p>
        </Link>
      </div>
    </div>
  );
};
