import { createRoot } from 'react-dom/client';
import { DemoCheckoutModal } from '../components/DemoCheckoutModal';
import { openRazorpayCheckout, type CheckoutOptions, type RazorpayVerifiedPayment } from './razorpay';

/**
 * Collects an online payment for a started order on whichever gateway the
 * backend picked for that flow: Razorpay's popup, or the built-in demo
 * checkout. Both resolve with the same signed fields the API verifies, and
 * reject with 'Payment cancelled' when closed.
 */
export function openCheckout(opts: CheckoutOptions): Promise<RazorpayVerifiedPayment> {
  if (opts.order.provider !== 'demo') {
    return openRazorpayCheckout(opts);
  }

  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const close = () => {
      root.unmount();
      host.remove();
    };

    root.render(
      <DemoCheckoutModal
        {...opts}
        onSuccess={(payment) => {
          close();
          resolve(payment);
        }}
        onDismiss={() => {
          close();
          reject(new Error('Payment cancelled'));
        }}
      />
    );
  });
}
