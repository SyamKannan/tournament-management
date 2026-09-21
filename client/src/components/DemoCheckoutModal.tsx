import React, { useState } from 'react';
import { X, Lock, ChevronLeft, Loader2, AlertCircle, FlaskConical, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { PAYMENT_METHOD_META } from '../lib/paymentMethods';
import type { OnlinePaymentMethod } from '../types';
import type { CheckoutOptions, RazorpayVerifiedPayment } from '../utils/razorpay';

interface DemoCheckoutModalProps extends CheckoutOptions {
  onSuccess: (payment: RazorpayVerifiedPayment) => void;
  onDismiss: () => void;
}

const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Federal Bank', 'Canara Bank'];

const formatCardNumber = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/**
 * The built-in test checkout used when the super admin sets a payment flow to
 * "Demo". Looks and behaves like a real gateway — pick a method, enter card /
 * UPI / bank details — but charges nothing; the backend validates the input
 * and signs the result exactly as it verifies a Razorpay payment.
 */
export const DemoCheckoutModal: React.FC<DemoCheckoutModalProps> = ({ order, name, description, prefill, method: startMethod, onSuccess, onDismiss }) => {
  const methods = order.methods?.length ? order.methods : (['upi', 'card', 'netbanking'] as OnlinePaymentMethod[]);
  const [method, setMethod] = useState<OnlinePaymentMethod | null>(
    startMethod && methods.includes(startMethod) ? startMethod : methods.length === 1 ? methods[0] : null
  );
  const [card, setCard] = useState({ number: '', name: prefill?.name || '', expiry: '', cvv: '' });
  const [upiId, setUpiId] = useState('');
  const [bank, setBank] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const amount = (order.amount ?? 0) / 100;
  const currency = order.currency === 'INR' || !order.currency ? '₹' : `${order.currency} `;
  const amountLabel = `${currency}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const pay = async (outcome: 'success' | 'failure' = 'success') => {
    if (!method || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const payload =
        method === 'card'
          ? { method, card_number: card.number, card_name: card.name, card_expiry: card.expiry, card_cvv: card.cvv }
          : method === 'upi'
            ? { method, upi_id: upiId }
            : { method, bank, outcome };
      const result: RazorpayVerifiedPayment = await api.post(`/payments/demo/${order.order_id}/pay`, payload);
      setPaid(true);
      setTimeout(() => onSuccess({ ...result, method }), 900);
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  const inputClass = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder:text-slate-600';

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600/25 to-teal-600/10 border-b border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {method && methods.length > 1 && !processing && !paid && (
                <button onClick={() => { setMethod(null); setError(null); }} className="p-1 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{name}</div>
                <div className="text-xs text-slate-400 truncate">{description}</div>
              </div>
            </div>
            <button onClick={onDismiss} disabled={processing} className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-40">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">Amount to pay</div>
              <div className="text-2xl font-black text-white font-mono">{amountLabel}</div>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase">
              <FlaskConical className="w-3 h-3" /> Test mode
            </span>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {paid ? (
            <div className="py-8 text-center space-y-3 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="text-sm font-bold text-white">Payment successful</div>
              <div className="text-xs text-slate-400">{amountLabel} paid via {method && PAYMENT_METHOD_META[method].label}</div>
            </div>
          ) : !method ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Choose a payment method</div>
              <div className="space-y-2">
                {methods.map(m => {
                  const meta = PAYMENT_METHOD_META[m];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`w-full p-3.5 rounded-2xl border flex items-center gap-3 text-left transition-all hover:border-emerald-500/60 hover:bg-slate-800/60 ${
                        order.preferred_method === m ? 'border-emerald-500/40 bg-slate-800/40' : 'border-slate-800 bg-slate-950'
                      }`}
                    >
                      <span className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-emerald-400" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-white">{meta.label}</span>
                        <span className="block text-xs text-slate-500">{meta.blurb}</span>
                      </span>
                      <ChevronLeft className="w-4 h-4 text-slate-500 rotate-180" />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {method === 'card' && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="democheckoutmodal-card-number" className="block text-xs font-semibold text-slate-400 mb-1">Card number</label>
                    <input id="democheckoutmodal-card-number"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="1234 5678 9012 3456"
                      value={card.number}
                      onChange={e => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                      className={`${inputClass} font-mono tracking-wider`}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label htmlFor="democheckoutmodal-name-on-card" className="block text-xs font-semibold text-slate-400 mb-1">Name on card</label>
                    <input id="democheckoutmodal-name-on-card" autoComplete="cc-name" value={card.name} onChange={e => setCard({ ...card, name: e.target.value })} className={inputClass} placeholder="Full name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="democheckoutmodal-expiry" className="block text-xs font-semibold text-slate-400 mb-1">Expiry</label>
                      <input id="democheckoutmodal-expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry} onChange={e => setCard({ ...card, expiry: formatExpiry(e.target.value) })} className={`${inputClass} font-mono`} />
                    </div>
                    <div>
                      <label htmlFor="democheckoutmodal-cvv" className="block text-xs font-semibold text-slate-400 mb-1">CVV</label>
                      <input id="democheckoutmodal-cvv" inputMode="numeric" type="password" autoComplete="cc-csc" placeholder="•••" maxLength={4} value={card.cvv} onChange={e => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '') })} className={`${inputClass} font-mono`} />
                    </div>
                  </div>
                </div>
              )}

              {method === 'upi' && (
                <div>
                  <label htmlFor="democheckoutmodal-upi-id" className="block text-xs font-semibold text-slate-400 mb-1">UPI ID</label>
                  <input id="democheckoutmodal-upi-id" placeholder="yourname@okbank" value={upiId} onChange={e => setUpiId(e.target.value.trim())} className={inputClass} autoFocus />
                  <p className="text-xs text-slate-500 mt-1.5">A collect request is sent to your UPI app — in test mode it's approved instantly.</p>
                </div>
              )}

              {method === 'netbanking' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Select your bank</label>
                  <div className="grid grid-cols-2 gap-2">
                    {BANKS.map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBank(b)}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-all ${
                          bank === b ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={() => pay('success')}
                disabled={processing}
                className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>{processing ? 'Processing...' : `Pay ${amountLabel}`}</span>
              </button>
              {method === 'netbanking' && (
                <button onClick={() => pay('failure')} disabled={processing} className="w-full text-xs text-slate-500 hover:text-rose-300">
                  Simulate a failed bank authorisation
                </button>
              )}

              {/* Test credentials */}
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-slate-400 space-y-1">
                <div className="font-bold text-amber-300 uppercase tracking-wider text-xs">Test details — no real money</div>
                {method === 'card' && (
                  <>
                    <div>Success: <button className="font-mono text-slate-200 hover:text-emerald-300" onClick={() => setCard({ number: '4111 1111 1111 1111', name: card.name || 'Test User', expiry: '12/30', cvv: '123' })}>4111 1111 1111 1111</button> · any future expiry · any CVV</div>
                    <div>Declined: <button className="font-mono text-slate-200 hover:text-rose-300" onClick={() => setCard({ number: '4000 0000 0000 0002', name: card.name || 'Test User', expiry: '12/30', cvv: '123' })}>4000 0000 0000 0002</button></div>
                  </>
                )}
                {method === 'upi' && (
                  <div>Success: <button className="font-mono text-slate-200 hover:text-emerald-300" onClick={() => setUpiId('success@demo')}>success@demo</button> · Failure: <button className="font-mono text-slate-200 hover:text-rose-300" onClick={() => setUpiId('failure@demo')}>failure@demo</button></div>
                )}
                {method === 'netbanking' && <div>Pick any bank and pay, or simulate a failure below the button.</div>}
                <div className="text-slate-500">Tap a value to fill it in.</div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Lock className="w-3 h-3" /> Secured demo checkout · switch to Razorpay in Platform Settings for real payments
        </div>
      </div>
    </div>
  );
};
