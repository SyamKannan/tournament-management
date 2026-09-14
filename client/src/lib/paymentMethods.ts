import { Smartphone, CreditCard, Landmark, Banknote } from 'lucide-react';
import type { PaymentMethod, OnlinePaymentMethod } from '../types';

export const ONLINE_PAYMENT_METHODS: OnlinePaymentMethod[] = ['upi', 'card', 'netbanking'];
export const ALL_PAYMENT_METHODS: PaymentMethod[] = [...ONLINE_PAYMENT_METHODS, 'pay_at_ground'];

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; blurb: string; icon: typeof CreditCard }> = {
  upi: { label: 'UPI', blurb: 'GPay, PhonePe, Paytm or any UPI app', icon: Smartphone },
  card: { label: 'Card', blurb: 'Debit or credit card', icon: CreditCard },
  netbanking: { label: 'Netbanking', blurb: 'Pay from your bank account', icon: Landmark },
  pay_at_ground: { label: 'Pay at Ground', blurb: 'Settle the fee in person on match day', icon: Banknote },
};

export const isOnlineMethod = (m: PaymentMethod): m is OnlinePaymentMethod => m !== 'pay_at_ground';
