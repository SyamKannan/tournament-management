import type { OnlinePaymentMethod, PaymentProvider } from '../types';

declare global {
  interface Window {
    Razorpay: any;
  }
}

/** A started payment, as returned by the `.../order` endpoints. */
export interface RazorpayOrder {
  /** false only when nothing needs paying (free plan / zero fee). */
  configured: boolean;
  provider?: PaymentProvider;
  order_id?: string;
  /** In the smallest currency unit (paise). */
  amount?: number;
  currency?: string;
  key_id?: string;
  methods?: OnlinePaymentMethod[];
  preferred_method?: OnlinePaymentMethod;
}

export interface RazorpayVerifiedPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  /** Set by the demo checkout; Razorpay doesn't report which method was used. */
  method?: OnlinePaymentMethod;
}

export interface CheckoutOptions {
  order: RazorpayOrder;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  /** Open straight on this method (the payer already picked it on our page). */
  method?: OnlinePaymentMethod;
}

const RAZORPAY_BLOCKS = ['card', 'upi', 'netbanking', 'wallet', 'emi', 'paylater', 'cardless_emi'];

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

/**
 * Fetch Razorpay's script the first time a checkout is opened.
 *
 * It used to be a blocking <script> in index.html, so every page — a
 * scoreboard, a fixture list — waited on a third-party payment script before
 * it could render, and on a weak ground-side connection that wait was long.
 * Only the pages that take money need it, and only at the moment they do.
 */
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Payment gateway failed to load. Please check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens Razorpay's Checkout popup and resolves with the verified payment fields on success. */
export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<RazorpayVerifiedPayment> {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Payment gateway failed to load. Please check your connection and try again.'));
      return;
    }

    // Checkout stays open after a failed attempt so the user can retry, so
    // a failure only settles the promise once the popup is actually closed.
    let lastFailure: string | null = null;
    const offered: string[] = opts.order.methods?.length ? opts.order.methods : ['card', 'upi', 'netbanking'];

    const rzp = new window.Razorpay({
      key: opts.order.key_id,
      order_id: opts.order.order_id,
      amount: opts.order.amount,
      currency: opts.order.currency,
      name: opts.name,
      description: opts.description,
      prefill: { ...opts.prefill, method: opts.method },
      theme: opts.theme || { color: '#c8f535' },
      // Only show the methods the admin/organizer allow for this payment.
      config: {
        display: {
          hide: RAZORPAY_BLOCKS.filter(m => !offered.includes(m)).map(method => ({ method })),
          preferences: { show_default_blocks: true },
        },
      },
      handler: (response: RazorpayVerifiedPayment) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error(lastFailure || 'Payment cancelled')),
      },
    });

    rzp.on('payment.failed', (res: any) => {
      lastFailure = res?.error?.description || 'Payment failed. Please try again.';
    });
    rzp.open();
  });
}
