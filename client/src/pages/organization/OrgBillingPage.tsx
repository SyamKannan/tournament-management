import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import type { Plan, Subscription, Invoice } from '../../types';
import { CreditCard, ShieldCheck, Receipt, Check, RefreshCw, LayoutGrid } from 'lucide-react';
import { PlanPickerModal } from '../../components/PlanPickerModal';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';

interface UsageMetric {
  current: number;
  max: number;
  percentage: number;
}

interface UsageResponse {
  subscription: Subscription | null;
  plan: Plan | null;
  usage: {
    tournaments: UsageMetric;
    teams: UsageMetric;
    players: UsageMetric;
    ads: UsageMetric;
  };
  invoices: Invoice[];
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  refunded: 'bg-slate-800 text-slate-300 border-slate-700',
};

export const OrgBillingPage: React.FC = () => {
  const { organization } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<UsageResponse | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices'>('overview');

  const fetchData = async () => {
    if (!organization) return;
    try {
      setLoading(true);
      const [usageRes, plansRes] = await Promise.all([
        api.get(`/organizations/${organization.id}/usage`),
        api.get('/plans'),
      ]);
      setData(usageRes);
      setAllPlans(Array.isArray(plansRes) ? plansRes : []);
    } catch (err) {
      console.error('Failed to load billing data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization]);

  if (loading || !data) {
    return <LoadingState label="Loading billing details..." />;
  }

  const { subscription, plan, usage, invoices } = data;

  const handleRenew = async () => {
    if (!organization || !plan) return;
    setRenewing(true);
    try {
      await api.post(`/organizations/${organization.id}/subscribe`, {
        plan_id: plan.id,
        payment_method: 'upi',
      });
      toast.success('Plan renewed!');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to renew plan. Please try again.');
    } finally {
      setRenewing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-xl font-black font-heading text-white tracking-tight">Billing & Plan</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage your subscription, usage limits, and invoice history.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {plan && (
            <button
              onClick={handleRenew}
              disabled={renewing}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${renewing ? 'animate-spin' : ''}`} />
              <span>{renewing ? 'Renewing...' : 'Renew Plan'}</span>
            </button>
          )}
          <button
            onClick={() => setShowPlanPicker(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
          >
            <CreditCard className="w-4 h-4" />
            <span>{plan ? 'Change Plan' : 'Choose a Plan'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800 text-xs font-bold w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'overview' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <LayoutGrid className="w-4 h-4 text-cyan-400" />
          <span>Plan & Usage</span>
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'invoices' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Receipt className="w-4 h-4 text-amber-400" />
          <span>Invoice History ({invoices?.length ?? 0})</span>
        </button>
      </div>

      {activeTab === 'overview' && (
      <>
      {/* Current Plan Card */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            {plan ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-white">{plan.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-bold uppercase border border-emerald-500/20">
                    {subscription?.status || 'Active'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  ₹{(subscription?.amount_paid ?? plan.price).toLocaleString()} / {plan.billing_type === 'one_time' ? 'event' : (plan.billing_interval || 'month')}
                  {subscription?.next_billing_date && (
                    <> • Renews {new Date(subscription.next_billing_date).toLocaleDateString()}</>
                  )}
                </p>
                {plan.description && (
                  <p className="text-xs text-slate-500 mt-1.5">{plan.description}</p>
                )}
                {plan.features?.length > 0 && (
                  <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-slate-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">No Active Plan</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-bold uppercase border border-slate-700">
                    Free Account
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Registration is free — choose a plan when you're ready to host your first tournament.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Quota Progress */}
        <div className="mt-5 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <UsageBar label="Tournaments" metric={usage.tournaments} color="bg-cyan-500" />
          <UsageBar label="Teams" metric={usage.teams} color="bg-emerald-500" />
          <UsageBar label="Players" metric={usage.players} color="bg-indigo-500" />
          <UsageBar label="Sponsor Ads" metric={usage.ads} color="bg-amber-500" />
        </div>
      </div>

      {/* Available Plans — the active plan is shown above, so it's excluded here */}
      {allPlans.filter(p => p.id !== plan?.id).length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Available Plans</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allPlans.filter(p => p.id !== plan?.id).map(p => (
              <div key={p.id} className="flex flex-col p-4 rounded-2xl border bg-slate-900/80 border-slate-800/80">
                <span className="font-bold text-white text-sm">{p.name}</span>
                <div className="text-lg font-black text-cyan-400 font-mono mt-1">
                  ₹{p.price.toLocaleString()}
                  <span className="text-[11px] text-slate-400 font-normal">
                    {p.billing_type === 'one_time' ? '/event' : `/${p.billing_interval || 'mo'}`}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {p.description || `${p.tournament_limit >= 999 ? 'Unlimited' : p.tournament_limit} Tournaments, ${p.team_limit} Teams, ${p.player_limit} Players`}
                </p>
                {p.features?.length > 0 && (
                  <ul className="mt-3 space-y-1 pt-3 border-t border-slate-800/80">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-slate-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setShowPlanPicker(true)}
                  className="mt-3 w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
                >
                  Switch to this plan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {activeTab === 'invoices' && (
      <div>
        {invoices && invoices.length > 0 ? (
          <div className="rounded-2xl border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Invoice #</th>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold">Method</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="bg-slate-900/60 hover:bg-slate-900 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-300">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-mono font-bold text-white">₹{inv.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-400 uppercase">{inv.payment_method}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STATUS_STYLES[inv.status] || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            message="Invoices will appear here once you subscribe to a plan."
          />
        )}
      </div>
      )}

      {showPlanPicker && organization && (
        <PlanPickerModal
          organizationId={organization.id}
          title={plan ? 'Change Your Plan' : 'Choose a Plan'}
          subtitle={plan ? 'Switch to a different plan at any time.' : 'Activate a plan to unlock tournament hosting.'}
          onClose={() => setShowPlanPicker(false)}
          onSubscribed={() => {
            setShowPlanPicker(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

const UsageBar: React.FC<{ label: string; metric: UsageMetric; color: string }> = ({ label, metric, color }) => (
  <div>
    <div className="flex justify-between text-[11px] mb-1">
      <span className="text-slate-400">{label}</span>
      <span className="font-bold text-white font-mono">{metric.current}/{metric.max}</span>
    </div>
    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${metric.percentage}%` }} />
    </div>
  </div>
);
