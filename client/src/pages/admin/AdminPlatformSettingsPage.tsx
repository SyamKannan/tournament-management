import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { PlatformSettings, PaymentMethod } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonStats } from '../../components/ui/Feedback';
import { Save, CreditCard, Banknote } from 'lucide-react';

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof CreditCard; blurb: string }[] = [
  { id: 'upi', label: 'Pay Online (UPI/Card)', icon: CreditCard, blurb: 'Razorpay Checkout for ground fees and plan subscriptions' },
  { id: 'pay_at_ground', label: 'Pay at Ground', icon: Banknote, blurb: 'Teams settle the fee in person, organizer records it manually' },
];

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Australia', 'Canada',
  'United Arab Emirates', 'Singapore', 'Pakistan', 'Bangladesh', 'Sri Lanka',
  'Nepal', 'South Africa', 'New Zealand', 'Malaysia', 'Kenya', 'Nigeria',
  'Ireland', 'Germany', 'France',
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

  const handleTogglePaymentMethod = (id: PaymentMethod) => {
    if (!settings) return;
    const enabled = settings.enabled_payment_methods.includes(id);
    if (enabled && settings.enabled_payment_methods.length === 1) {
      toast.error('At least one payment method must stay enabled');
      return;
    }
    setSettings({
      ...settings,
      enabled_payment_methods: enabled
        ? settings.enabled_payment_methods.filter(m => m !== id)
        : [...settings.enabled_payment_methods, id],
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
      const res = await api.put('/admin/settings', settings);
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
              <input
                type="text"
                value={settings.support_phone}
                onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
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
              <label className="block text-slate-400 mb-1">Default Trial Days</label>
              <input
                type="number"
                min="0"
                value={settings.default_trial_days}
                onChange={(e) => setSettings({ ...settings, default_trial_days: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl glass-input font-mono"
              />
            </div>
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

        <div className="p-6 rounded-3xl glass-card border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white font-heading">Payments</h3>

          <div>
            <label className="block text-slate-300 font-semibold mb-1 text-xs">Razorpay Gateway Mode</label>
            <select
              value={settings.payment_gateway_mode}
              onChange={(e) => setSettings({ ...settings, payment_gateway_mode: e.target.value as 'sandbox' | 'live' })}
              className="w-full sm:w-64 px-3 py-2 rounded-xl glass-input bg-slate-900 text-xs"
            >
              <option value="sandbox">Sandbox (test keys)</option>
              <option value="live">Live (real charges)</option>
            </select>
          </div>

          <div>
            <span className="block text-slate-400 text-[11px] mb-2">
              Payment Methods Enabled Platform-Wide (at least one required)
            </span>
            <p className="text-[11px] text-slate-500 mb-2">
              Controls which methods organizers can offer teams when configuring a tournament's ground fee.
              Disabling one here removes it from every organizer's picker without affecting tournaments already using it.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => {
                const isEnabled = settings.enabled_payment_methods.includes(m.id);
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleTogglePaymentMethod(m.id)}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      isEnabled
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>
                      <span className="block text-xs font-semibold">{m.label}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{m.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
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
