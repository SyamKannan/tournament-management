import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Subscription, Invoice } from '../../types';
import { Skeleton, SkeletonTable } from '../../components/ui/Feedback';
import { label } from '../../lib/labels';

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

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Club Subscriptions & Invoices</h1>
          <p className="text-xs text-slate-400 mt-1">Club Memberships & Platform Billing</p>
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
            <table className="responsive-table w-full min-w-[860px] text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[11px] font-bold tracking-wider">
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
                    <td data-label="Organization" className="rt-full px-5 py-4 font-bold text-white text-xs">
                      {sub.organization_name || sub.organization_id}
                    </td>
                    <td data-label="Subscribed Plan" className="px-4 py-4">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold font-mono text-[11px]">
                        {sub.plan_name || 'Standard Pro'}
                      </span>
                    </td>
                    <td data-label="Billing Amount" className="px-4 py-4 font-mono font-bold text-white">
                      ₹{sub.amount_paid.toLocaleString()}
                    </td>
                    <td data-label="Start Date" className="px-4 py-4 text-slate-400 font-mono">
                      {new Date(sub.start_date).toLocaleDateString()}
                    </td>
                    <td data-label="Next Renewal" className="px-4 py-4 text-slate-400 font-mono">
                      {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString() : 'One-Time'}
                    </td>
                    <td data-label="Status" className="px-4 py-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase">
                        {label(sub.status)}
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
            <table className="responsive-table w-full min-w-[860px] text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[11px] font-bold tracking-wider">
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
                    <td data-label="Invoice #" className="px-5 py-4 font-mono font-bold text-white text-xs">
                      {inv.invoice_number}
                    </td>
                    <td data-label="Billed To" className="rt-full px-4 py-4">
                      <div className="font-semibold text-white">{inv.billing_name}</div>
                      <div className="text-[11px] text-slate-500">{inv.billing_email}</div>
                    </td>
                    <td data-label="Amount" className="px-4 py-4 font-mono font-bold text-emerald-400">
                      ₹{inv.amount.toLocaleString()}
                    </td>
                    <td data-label="Payment Method" className="px-4 py-4 uppercase text-slate-300 font-mono">
                      {label(inv.payment_method)}
                    </td>
                    <td data-label="Date" className="px-4 py-4 text-slate-400 font-mono">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td data-label="Status" className="px-4 py-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase">
                        {label(inv.status)}
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
