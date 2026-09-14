import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Plan, BillingInterval } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Skeleton, SkeletonStats } from '../../components/ui/Feedback';
import {
  Plus, Edit2, Trash2, CheckCircle2,
  X, Check, Power, PowerOff
} from 'lucide-react';

export const AdminPlansPage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(1999);
  const [billingType, setBillingType] = useState<'recurring' | 'one_time'>('recurring');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [tournamentLimit, setTournamentLimit] = useState<number>(3);
  const [teamLimit, setTeamLimit] = useState<number>(50);
  const [playerLimit, setPlayerLimit] = useState<number>(800);
  const [adLimit, setAdLimit] = useState<number>(15);
  const [features, setFeatures] = useState<string[]>([
    'live_scoring', 'scoreboard_tv', 'team_registration_links', 'break_ads', 'pdf_exports'
  ]);

  const allAvailableFeatures = [
    { id: 'live_scoring', label: 'Football & Cricket Live Scoring with Undo' },
    { id: 'scoreboard_tv', label: '16:9 Big Screen TV Scoreboard' },
    { id: 'team_registration_links', label: 'Public Mobile Team Registration Links' },
    { id: 'standings', label: 'Automated Football GD & Cricket NRR Points Tables' },
    { id: 'break_ads', label: 'Break-Time Sponsor Ads Rotator' },
    { id: 'sponsor_management', label: 'Sponsor Tiers Management' },
    { id: 'emergency_announcements', label: 'Emergency Delay Scoreboard Broadcasts' },
    { id: 'player_auctions', label: 'IPL/ISL Style Live Player Auctions & Registration Arena' },
    { id: 'player_career_stats', label: 'Player Career Statistics, Leaderboards & Digital Pass' },
    { id: 'offline_payments_tracking', label: 'Offline Cash / UPI Payment Recording' },
    { id: 'pdf_exports', label: 'Official Registration Receipts & PDF Exports' },
    { id: 'advanced_analytics', label: 'Advanced Tournament Analytics' },
    { id: 'custom_branding', label: 'Custom Organization Branding' },
    { id: 'coin_toss', label: 'Pre-Match Coin Toss' },
    { id: 'ai_tournament_poster', label: 'AI-Generated Tournament Posters' }
  ];

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/plans');
      setPlans(res);
    } catch (err) {
      console.error('Failed to fetch plans', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setDescription('');
    setPrice(1999);
    setBillingType('recurring');
    setBillingInterval('monthly');
    setTournamentLimit(3);
    setTeamLimit(50);
    setPlayerLimit(800);
    setAdLimit(15);
    setFeatures(['live_scoring', 'scoreboard_tv', 'team_registration_links', 'break_ads', 'pdf_exports']);
    setShowModal(true);
  };

  const openEditModal = (plan: Plan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setDescription(plan.description);
    setPrice(plan.price);
    setBillingType(plan.billing_type);
    setBillingInterval(plan.billing_interval || 'monthly');
    setTournamentLimit(plan.tournament_limit);
    setTeamLimit(plan.team_limit);
    setPlayerLimit(plan.player_limit);
    setAdLimit(plan.ad_limit);
    setFeatures(plan.features || []);
    setShowModal(true);
  };

  const handleFeatureToggle = (featureId: string) => {
    if (features.includes(featureId)) {
      setFeatures(features.filter(f => f !== featureId));
    } else {
      setFeatures([...features, featureId]);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        description,
        price: Number(price),
        currency: '₹',
        billing_type: billingType,
        billing_interval: billingType === 'recurring' ? billingInterval : undefined,
        tournament_limit: Number(tournamentLimit),
        team_limit: Number(teamLimit),
        player_limit: Number(playerLimit),
        ad_limit: Number(adLimit),
        features
      };

      if (editingPlan) {
        await api.put(`/admin/plans/${editingPlan.id}`, payload);
      } else {
        await api.post('/admin/plans', payload);
      }

      setShowModal(false);
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save plan');
    }
  };

  const handleToggleStatus = async (plan: Plan) => {
    const activating = plan.status !== 'active';
    const proceed = await confirm({
      title: activating ? 'Activate this plan?' : 'Deactivate this plan?',
      message: activating
        ? 'Organizers will be able to newly subscribe to this plan again.'
        : 'Organizers already on this plan keep their current limits, but it can no longer be newly chosen.',
      confirmLabel: activating ? 'Activate plan' : 'Deactivate plan',
      tone: activating ? 'default' : 'danger',
    });
    if (!proceed) return;
    try {
      await api.put(`/admin/plans/${plan.id}`, { status: activating ? 'active' : 'inactive' });
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update plan status');
    }
  };

  const handleDeletePlan = async (planId: string) => {
    const proceed = await confirm({
      title: 'Delete this plan?',
      message: 'Organizations already subscribed keep their current limits, but the plan can no longer be chosen.',
      confirmLabel: 'Delete plan',
      tone: 'danger',
    });
    if (!proceed) return;
    try {
      await api.delete(`/admin/plans/${planId}`);
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete plan');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonStats count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Club Membership & Pricing Plans</h1>
          <p className="text-xs text-slate-400 mt-1">Configure subscription packages, tournament limits, and monetization tiers</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Plan</span>
        </button>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map(plan => {
          const isRecurring = plan.billing_type === 'recurring';
          const isActive = plan.status === 'active';

          return (
            <div key={plan.id} className={`p-6 rounded-3xl glass-card border flex flex-col justify-between transition-all ${
              isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/60 opacity-60 hover:opacity-100'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                    isRecurring ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {isRecurring ? `${plan.billing_interval} Recurring` : 'One-Time Payment'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleStatus(plan)}
                      title={isActive ? 'Deactivate plan' : 'Activate plan'}
                      className={`p-1.5 rounded-lg transition-colors hover:bg-slate-800 ${
                        isActive ? 'text-slate-400 hover:text-rose-400' : 'text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      {isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => openEditModal(plan)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-white font-heading">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white font-heading font-mono">{plan.currency}{plan.price.toLocaleString()}</span>
                  <span className="text-xs text-slate-400">/{isRecurring ? (plan.billing_interval || 'mo') : 'package'}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">{plan.description}</p>

                {/* Limits Summary */}
                <div className="mt-4 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px] uppercase font-bold">Tournaments</span>
                    <span className="font-bold text-white font-mono">{plan.tournament_limit} Max</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px] uppercase font-bold">Teams Limit</span>
                    <span className="font-bold text-white font-mono">{plan.team_limit} Max</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px] uppercase font-bold">Players Limit</span>
                    <span className="font-bold text-white font-mono">{plan.player_limit} Max</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px] uppercase font-bold">Ads Limit</span>
                    <span className="font-bold text-white font-mono">{plan.ad_limit} Ads</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="mt-4 space-y-1.5 text-xs text-slate-300">
                  {plan.features?.slice(0, 5).map(f => (
                    <div key={f} className="flex items-center gap-2 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="truncate capitalize">{f.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                  {plan.features?.length > 5 && (
                    <div className="text-[11px] text-slate-500 pl-5">+{plan.features.length - 5} more features enabled</div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex justify-between">
                <span>{plan.price === 0 ? 'Free Tournament' : 'Instant Activation'}</span>
                <span className={`font-semibold uppercase ${isActive ? 'text-emerald-400' : 'text-rose-400'}`}>{plan.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Plan Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-white font-heading">
                {editingPlan ? `Edit Plan: ${editingPlan.name}` : 'Create New Membership Plan'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Plan Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Standard Pro"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl glass-input"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="2499"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    required
                    className="w-full px-3.5 py-2 rounded-xl glass-input font-mono font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Target audience and highlight"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl glass-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Billing Type</label>
                  <select
                    value={billingType}
                    onChange={(e) => setBillingType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                  >
                    <option value="recurring">Recurring Subscription</option>
                    <option value="one_time">One-Time Payment</option>
                  </select>
                </div>

                {billingType === 'recurring' && (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Interval</label>
                    <select
                      value={billingInterval}
                      onChange={(e) => setBillingInterval(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl glass-input bg-slate-900"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Resource Limits */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] mb-2">
                  Plan Resource Limits
                </label>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Tournaments</label>
                    <input
                      type="number"
                      min="1"
                      value={tournamentLimit}
                      onChange={(e) => setTournamentLimit(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl glass-input font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Teams Limit</label>
                    <input
                      type="number"
                      min="1"
                      value={teamLimit}
                      onChange={(e) => setTeamLimit(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl glass-input font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Players Limit</label>
                    <input
                      type="number"
                      min="1"
                      value={playerLimit}
                      onChange={(e) => setPlayerLimit(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl glass-input font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Ads Limit</label>
                    <input
                      type="number"
                      min="0"
                      value={adLimit}
                      onChange={(e) => setAdLimit(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl glass-input font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Feature Flags */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] mb-2">
                  Enabled Features
                </label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {allAvailableFeatures.map(feat => {
                    const isChecked = features.includes(feat.id);
                    return (
                      <button
                        key={feat.id}
                        type="button"
                        onClick={() => handleFeatureToggle(feat.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all ${
                          isChecked
                            ? 'bg-emerald-500/15 border-emerald-500 text-white font-medium'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span className="truncate pr-2">{feat.label}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold"
                >
                  {editingPlan ? 'Save Changes' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
