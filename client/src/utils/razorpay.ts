declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayOrder {
  configured: boolean;
  order_id?: string;
  amount?: number;
  currency?: string;
  key_id?: string;
}

export interface RazorpayVerifiedPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface OpenRazorpayCheckoutOptions {
  order: RazorpayOrder;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}

/** Opens Razorpay's Checkout popup and resolves with the verified payment fields on success. */
export function openRazorpayCheckout(opts: OpenRazorpayCheckoutOptions): Promise<RazorpayVerifiedPayment> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Payment gateway failed to load. Please check your connection and try again.'));
      return;
    }

    const rzp = new window.Razorpay({
      key: opts.order.key_id,
      order_id: opts.order.order_id,
      amount: opts.order.amount,
      currency: opts.order.currency,
      name: opts.name,
      description: opts.description,
      prefill: opts.prefill,
      theme: opts.theme || { color: '#10b981' },
      handler: (response: RazorpayVerifiedPayment) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    });

    rzp.on('payment.failed', () => reject(new Error('Payment failed. Please try again.')));
    rzp.open();
  });
}
