import React, { useEffect, useState } from 'react';
import { X, CreditCard, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { subscribeToPlan } from '../services/billing';
import type { Plan } from '../types';
import { useToast } from './ui/Toast';

interface PlanPickerModalProps {
  organizationId: string;
  /** The org's active plan — badged, and not preselected so "Change Plan" defaults to a different one. */
  currentPlanId?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSubscribed: (planId: string) => void;
}

/**
 * Lets an organization choose (and immediately activate) a paid plan.
 * Reused both as the billing-upgrade CTA on the dashboard and as the
 * paywall shown when a free org first tries to create a tournament.
 */
export const PlanPickerModal: React.FC<PlanPickerModalProps> = ({
  organizationId,
  currentPlanId,
  title ='Choose a Plan',
  subtitle = 'Pick the plan that fits your tournament, then continue.',
  onClose,
  onSubscribed
}) => {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoadingPlans(true);
        const res = await api.get('/plans');
        if (Array.isArray(res)) {
          setPlans(res);
          setSelectedPlanId((res.find((p: Plan) => p.id !== currentPlanId) ?? res[0])?.id ?? null);
        }
      } catch (err) {
        console.error('Failed to load plans', err);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, [currentPlanId]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  const handleSubscribe = async () => {
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) return;
    setSubscribing(true);
    try {
      await subscribeToPlan(organizationId, plan);
      toast.success('Plan activated!');
      onSubscribed(plan.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to activate plan. Please try again.');
      setSubscribing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h3 className="text-base font-bold text-white font-heading">{title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3">
          {loadingPlans ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading available plans...</div>
          ) : (
            plans.map(p => {
              const isSelected = selectedPlanId === p.id;
              const isOneTime = p.billing_type === 'one_time';

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-500/60 ring-1 ring-cyan-500/40 shadow-lg'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{p.name}</span>
                        {p.id === currentPlanId && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold uppercase">
                            Current
                          </span>
                        )}
                        {p.price === 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase">
                            Free
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {p.description || `${p.tournament_limit >= 999 ? 'Unlimited' : p.tournament_limit} Tournaments, ${p.team_limit} Teams, ${p.player_limit} Players`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-black text-cyan-400 font-mono">
                        ₹{p.price.toLocaleString()}
                        <span className="text-xs text-slate-400 font-normal">
                          {isOneTime ? '/event' : `/${p.billing_interval || 'mo'}`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 pb-6 pt-2 border-t border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={!selectedPlanId || subscribing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {subscribing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            <span>
              {subscribing
                ? 'Processing...'
                : selectedPlan && selectedPlan.price > 0 ? `Pay ₹${selectedPlan.price.toLocaleString()} & Activate` : 'Activate Plan'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
