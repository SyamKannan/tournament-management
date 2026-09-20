import React, { useState } from 'react';
import type { Team } from '../types';
import { api } from '../services/api';
import { formatMoney } from '../lib/format';
import { X, CheckCircle, IndianRupee } from 'lucide-react';

interface OfflinePaymentModalProps {
  team: Team | null;
  /** Tournament ground fee, used when the team has no payment record yet. */
  totalFee?: number;
  onClose: () => void;
  onSuccess: (payment: any, receipt: any) => void;
}

export const OfflinePaymentModal: React.FC<OfflinePaymentModalProps> = ({ team, totalFee = 0, onClose, onSuccess }) => {
  if (!team) return null;

  const currentRemaining = team.payment ? team.payment.remaining_amount : totalFee;
  const [amount, setAmount] = useState<number>(currentRemaining);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'other'>('upi');
  const [transactionId, setTransactionId] = useState<string>('');
  const [notes, setNotes] = useState<string>('Ground fee payment collected by organizer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.post(`/teams/${team.id}/record-payment`, {
        payment_method: paymentMethod,
        amount: Number(amount),
        transaction_id: transactionId || `OFFLINE-${paymentMethod.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        notes,
        payment_option: amount >= currentRemaining ? 'full' : 'partial'
      });

      onSuccess(res.payment, res.receipt);
    } catch (err: any) {
      setError(err.message || 'Failed to record offline payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-y-auto max-h-[calc(100dvh-2rem)]">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <IndianRupee className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-heading">Record Ground Fee Payment</h3>
              <p className="text-[11px] text-slate-400">For Team: <span className="text-emerald-400 font-semibold">{team.name}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
              {error}
            </div>
          )}

          {/* Current balance display */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block text-[11px]">Current Outstanding Balance</span>
              <span className="text-sm font-bold text-amber-400 font-mono">₹{currentRemaining.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Total Registration Fee</span>
              <span className="text-sm font-semibold text-slate-300 font-mono">₹{(team.payment?.total_fee || currentRemaining).toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Amount Collected (₹)</label>
            <input
              type="number"
              min="1"
              max={currentRemaining}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className="w-full px-3.5 py-2.5 rounded-xl glass-input font-mono font-bold text-sm text-emerald-400"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setAmount(currentRemaining)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 font-medium"
              >
                Clear Full Balance ({formatMoney(currentRemaining)})
              </button>
              {currentRemaining > 1000 && (
                <button
                  type="button"
                  onClick={() => setAmount(Math.round(currentRemaining / 2))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 font-medium"
                >
                  Pay 50% ({formatMoney(Math.round(currentRemaining / 2))})
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['upi', 'cash', 'bank_transfer'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`py-2 px-3 rounded-xl border text-center font-medium capitalize transition-all ${
                    paymentMethod === m
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {m === 'bank_transfer' ? 'Bank Transfer' : m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Reference / Transaction Note</label>
            <input
              type="text"
              placeholder="e.g. UPI Ref #9847110022 or Cash received at ground"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Admin Note</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl glass-input"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Recording...' : 'Confirm & Update Receipt'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
