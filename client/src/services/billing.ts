import { api } from './api';
import { openCheckout } from '../utils/checkout';
import type { RazorpayOrder } from '../utils/razorpay';
import type { Plan } from '../types';

/**
 * Activates a plan for an organization. Paid plans always go through the
 * subscription flow's checkout (Razorpay or the demo checkout, whichever the
 * super admin configured) and are only activated with a verified result;
 * free plans activate directly. Shared by PlanPickerModal and OrgBillingPage.
 */
export async function subscribeToPlan(organizationId: string, plan: Plan): Promise<void> {
  if (plan.price > 0) {
    const order: RazorpayOrder = await api.post(`/organizations/${organizationId}/subscribe/order`, {
      plan_id: plan.id
    });

    if (order.configured) {
      const verified = await openCheckout({
        order,
        name: 'Plan Subscription',
        description: `${plan.name} plan`
      });

      await api.post(`/organizations/${organizationId}/subscribe`, {
        plan_id: plan.id,
        razorpay_payment_id: verified.razorpay_payment_id,
        razorpay_order_id: verified.razorpay_order_id,
        razorpay_signature: verified.razorpay_signature,
        payment_method: verified.method ?? 'upi'
      });
      return;
    }
  }

  await api.post(`/organizations/${organizationId}/subscribe`, {
    plan_id: plan.id,
    payment_method: 'upi'
  });
}
