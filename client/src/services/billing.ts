import { api } from './api';
import { openRazorpayCheckout, type RazorpayOrder } from '../utils/razorpay';
import type { Plan } from '../types';

/**
 * Activates a plan for an organization. Paid plans go through a real
 * Razorpay Checkout (order create -> popup -> verified subscribe); free
 * plans and the keys-not-configured fallback subscribe directly, same as
 * before. Shared by PlanPickerModal and OrgBillingPage's renew action.
 */
export async function subscribeToPlan(organizationId: string, plan: Plan): Promise<void> {
  if (plan.price > 0) {
    const order: RazorpayOrder = await api.post(`/organizations/${organizationId}/subscribe/order`, {
      plan_id: plan.id
    });

    if (order.configured) {
      const verified = await openRazorpayCheckout({
        order,
        name: 'Sportivo Subscription',
        description: `${plan.name} plan`
      });

      await api.post(`/organizations/${organizationId}/subscribe`, {
        plan_id: plan.id,
        payment_method: 'upi',
        razorpay_payment_id: verified.razorpay_payment_id,
        razorpay_order_id: verified.razorpay_order_id,
        razorpay_signature: verified.razorpay_signature
      });
      return;
    }
  }

  await api.post(`/organizations/${organizationId}/subscribe`, {
    plan_id: plan.id,
    payment_method: 'upi'
  });
}
