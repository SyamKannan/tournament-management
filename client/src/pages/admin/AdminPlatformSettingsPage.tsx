import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { PlatformSettings, PaymentMethod, PaymentFlow, PaymentProvider } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonStats } from '../../components/ui/Feedback';
import { Save, Receipt, Users, FlaskConical, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PhoneInput } from '../../components/PhoneInput';
import { COUNTRIES } from '../../lib/countries';

import { ALL_PAYMENT_METHODS, ONLINE_PAYMENT_METHODS, PAYMENT_METHOD_META } from '../../lib/paymentMethods';

const FLOWS: { id: PaymentFlow; title: string; blurb: string; icon: typeof Receipt }[] = [
  {
    id: 'subscription',
    title: 'Plan Purchases & Renewals',
    blurb: 'What clubs pay the platform when they buy, switch or renew a plan.',
    icon: Receipt,
  },
  {
    id: 'registration',
    title: 'Team Registration Fees',
    blurb: 'Ground fees teams pay clubs when registering. Each club picks which of these methods a tournament shows.',
    icon: Users,
  },
];

const PROVIDERS: { id: PaymentProvider; label: string; sub: string; icon: typeof KeyRound }[] = [
  { id: 'demo', label: 'Demo checkout', sub: 'Test cards, no real money', icon: FlaskConical },
  { id: 'razorpay', label: 'Razorpay', sub: 'UPI, cards, netbanking', icon: KeyRound },
];

const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'AUD', symbol: '$', label: 'Australian Dollar' },
  { code: 'CAD', symbol: '$', label: 'Canadian Dollar' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
  { code: 'SGD', symbol: '$', label: 'Singapore Dollar' },
  { code: 'PKR', symbol: '₨', label: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳', label: 'Bangladeshi Taka' },
  { code: 'LKR', symbol: '₨', label: 'Sri Lankan Rupee' },
  { code: 'NPR', symbol: '₨', label: 'Nepalese Rupee' },
  { code: 'ZAR', symbol: 'R', label: 'South African Rand' },
  { code: 'NZD', symbol: '$', label: 'New Zealand Dollar' },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan Shilling' },
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira' },
];

export const AdminPlatformSettingsPage: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/settings');
      setSettings(res);
    } catch (err) {
      console.error('Failed to load platform settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const toggleMethod = (key: 'enabled_payment_methods' | 'subscription_payment_methods', id: PaymentMethod) => {
    if (!settings) return;
    const current = settings[key] as PaymentMethod[];
    const enabled = current.includes(id);
    if (enabled && current.length === 1) {
      toast.error('At least one payment method must stay enabled');
      return;
    }
    setSettings({ ...settings, [key]: enabled ? current.filter(m => m !== id) : [...current, id] });
  };

  const updateGateway = (flow: PaymentFlow, patch: Partial<PlatformSettings['payment_gateways'][PaymentFlow]>) => {
    if (!settings) return;
    setSettings({
      ...settings,
      payment_gateways: { ...settings.payment_gateways, [flow]: { ...settings.payment_gateways[flow], ...patch } },
    });
  };

  const handleCurrencyChange = (code: string) => {
    if (!settings) return;
    const currency = CURRENCIES.find(c => c.code === code);
    if (!currency) return;
    setSettings({ ...settings, currency_code: currency.code, currency_symbol: currency.symbol });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await api.put('/admin/settings', {
        ...settings,
        // The secret is write-only: send it only when the admin typed a new one.
        payment_gateways: Object.fromEntries(
          FLOWS.map(({ id }) => {
            const g = settings.payment_gateways[id];
            return [id, { provider: g.provider, key_id: g.key_id, ...(g.key_secret ? { key_secret: g.key_secret } : {}) }];
          })
        ),
      });
      setSettings(res);
      toast.success('Platform settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonStats count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black font-heading text-white">Platform Settings</h1>
        <p className="text-xs text-slate-400 mt-1">Branding, signup policy, and payment configuration for the whole platform</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white font-heading">General</h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Platform Name</label>
              <input
                type="text"
                value={settings.platform_name}
                onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Country</label>
              <select
                value={settings.country}
                onChange={(e) => setSettings({ ...settings, country: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input bg-slate-900"
              >
                {!COUNTRIES.includes(settings.country) && (
                  <option value={settings.country}>{settings.country}</option>
                )}
                {COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Currency</label>
              <select
                value={settings.currency_code}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl glass-input bg-slate-900"
              >
                {!CURRENCIES.some(c => c.code === settings.currency_code) && (
                  <option value={settings.currency_code}>{settings.currency_symbol} {settings.currency_code}</option>
                )}
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Support Email</label>
              <input
                type="email"
                value={settings.support_email}
                onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Support Phone</label>
              <PhoneInput
                value={settings.support_phone}
                onChange={(support_phone) => setSettings({ ...settings, support_phone })}
                className="w-full px-3.5 py-2 rounded-xl glass-input"
              />
            </div>
          </div>
        </div>

        <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white font-heading">Organization Signup</h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer p-2.5 rounded-xl border border-slate-800 bg-slate-950/60">
              <input
                type="checkbox"
                checked={settings.enable_public_signup}
                onChange={(e) => setSettings({ ...settings, enable_public_signup: e.target.checked })}
                className="rounded text-emerald-500"
              />
              <span>Allow public club registration</span>
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer p-2.5 rounded-xl border border-slate-800 bg-slate-950/60">
              <input
                type="checkbox"
                checked={settings.require_admin_approval_for_orgs}
                onChange={(e) => setSettings({ ...settings, require_admin_approval_for_orgs: e.target.checked })}
                className="rounded text-emerald-500"
              />
              <span>Require admin approval for new organizations</span>
            </label>
            <div>
              <label className="block text-slate-400 mb-1">Grace Period Days</label>
              <input
                type="number"
                min="0"
                value={settings.grace_period_days}
                onChange={(e) => setSettings({ ...settings, grace_period_days: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white font-heading">Payments</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Each payment flow has its own gateway. Use <b className="text-slate-300">Demo checkout</b> to try the full flow with test cards,
              or <b className="text-slate-300">Razorpay</b> with your API keys (rzp_test_… for testing, rzp_live_… for real charges).
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {FLOWS.map(flow => {
              const gateway = settings.payment_gateways[flow.id];
              const FlowIcon = flow.icon;
              const methodKey = flow.id === 'subscription' ? 'subscription_payment_methods' : 'enabled_payment_methods';
              const methodOptions: PaymentMethod[] = flow.id === 'subscription' ? ONLINE_PAYMENT_METHODS : ALL_PAYMENT_METHODS;
              const selectedMethods = settings[methodKey] as PaymentMethod[];
              const keyMode = gateway.key_id.startsWith('rzp_live_') ? 'live' : gateway.key_id.startsWith('rzp_test_') ? 'test' : null;

              return (
                <div key={flow.id} className="p-5 rounded-3xl glass-card border border-slate-800 space-y-4 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <FlowIcon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{flow.title}</h4>
                        {gateway.ready ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase">
                            <AlertTriangle className="w-3 h-3" /> Not ready — save keys
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{flow.blurb}</p>
                    </div>
                  </div>

                  <div>
                    <span className="block text-slate-300 font-semibold mb-1.5">Gateway</span>
                    <div className="grid grid-cols-2 gap-2">
                      {PROVIDERS.map(p => {
                        const active = gateway.provider === p.id;
                        const Icon = p.icon;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => updateGateway(flow.id, { provider: p.id })}
                            className={`p-3 rounded-xl border text-left flex items-start gap-2 transition-all ${
                              active ? 'bg-emerald-500/15 border-emerald-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                            <span>
                              <span className="block font-semibold">{p.label}</span>
                              <span className="block text-[10px] text-slate-500">{p.sub}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {gateway.provider === 'razorpay' && (
                    <div className="grid gap-3">
                      <div>
                        <label className="flex items-center justify-between text-slate-300 font-semibold mb-1">
                          <span>Key ID</span>
                          {keyMode && (
                            <span className={`text-[10px] font-bold uppercase ${keyMode === 'live' ? 'text-rose-300' : 'text-cyan-300'}`}>
                              {keyMode === 'live' ? 'Live — real charges' : 'Test mode'}
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={gateway.key_id}
                          placeholder="rzp_test_xxxxxxxxxxxx"
                          onChange={(e) => updateGateway(flow.id, { key_id: e.target.value.trim() })}
                          className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Key Secret</label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={gateway.key_secret ?? ''}
                          placeholder={gateway.has_key_secret ? '•••••••• saved — type to replace' : 'Paste your key secret'}
                          onChange={(e) => updateGateway(flow.id, { key_secret: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Stored encrypted and never shown again. Find keys in Razorpay Dashboard → Account &amp; Settings → API Keys.</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="block text-slate-300 font-semibold mb-1">
                      {flow.id === 'subscription' ? 'Methods offered at checkout' : 'Methods clubs can offer teams'}
                    </span>
                    {flow.id === 'registration' && (
                      <p className="text-[10px] text-slate-500 mb-1.5">Turning one off hides it from clubs' pickers; tournaments already using it keep it.</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {methodOptions.map(id => {
                        const meta = PAYMENT_METHOD_META[id];
                        const Icon = meta.icon;
                        const isEnabled = selectedMethods.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleMethod(methodKey, id)}
                            className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                              isEnabled ? 'bg-emerald-500/15 border-emerald-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isEnabled ? 'text-emerald-400' : 'text-slate-600'}`} />
                            <span className="font-semibold">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
