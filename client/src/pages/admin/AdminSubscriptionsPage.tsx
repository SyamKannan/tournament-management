import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Subscription, Invoice } from '../../types';
import { FileText, CreditCard, ShieldCheck, CheckCircle2, Download } from 'lucide-react';

export const AdminSubscriptionsPage: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'invoices'>('subscriptions');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [subsRes, invRes] = await Promise.all([
          api.get('/admin/subscriptions'),
          api.get('/admin/invoices')
        ]);
        setSubscriptions(subsRes);
        setInvoices(invRes);
      } catch (err) {
        console.error('Failed to load subscriptions & invoices', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">SaaS Subscriptions & Invoices</h1>
          <p className="text-xs text-slate-400 mt-1">Platform Payment System 1 (Organizations paying SaaS fees to you)</p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'subscriptions' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Active Subscriptions ({subscriptions.length})
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'invoices' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Platform Invoices ({invoices.length})
          </button>
        </div>
      </div>

      {activeTab === 'subscriptions' ? (
        <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Organization</th>
                  <th className="px-4 py-3.5">Subscribed Plan</th>
                  <th className="px-4 py-3.5">Billing Amount</th>
                  <th className="px-4 py-3.5">Start Date</th>
                  <th className="px-4 py-3.5">Next Renewal</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {subscriptions.map(sub => (
                  <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 font-bold text-white text-xs">
                      {sub.organization_name || sub.organization_id}
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold font-mono text-[11px]">
                        {sub.plan_name || 'Standard Pro'}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono font-bold text-white">
                      ₹{sub.amount_paid.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-slate-400 font-mono">
                      {new Date(sub.start_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-slate-400 font-mono">
                      {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString() : 'One-Time'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                        {sub.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-2xl overflow-hidden glass-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Invoice #</th>
                  <th className="px-4 py-3.5">Billed To</th>
                  <th className="px-4 py-3.5">Amount</th>
                  <th className="px-4 py-3.5">Payment Method</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-white text-xs">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{inv.billing_name}</div>
                      <div className="text-[10px] text-slate-500">{inv.billing_email}</div>
                    </td>
                    <td className="px-4 py-4 font-mono font-bold text-emerald-400">
                      ₹{inv.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 uppercase text-slate-300 font-mono">
                      {inv.payment_method}
                    </td>
                    <td className="px-4 py-4 text-slate-400 font-mono">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
