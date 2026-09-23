import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Sport, SportCode, PaymentMethod } from '../types';
import { api } from '../services/api';

interface PlatformConfigContextType {
  enabledSports: Sport[];
  isSportEnabled: (code: SportCode | string) => boolean;
  enabledPaymentMethods: PaymentMethod[];
  isPaymentMethodEnabled: (method: PaymentMethod | string) => boolean;
  /**
   * Whether this deployment can actually send WhatsApp/SMS. False hides every
   * messaging surface and the "forgot password" route, which sends a code by
   * SMS — offering either when nothing can be delivered only wastes the
   * reader's time. Assumed false until the server answers.
   */
  messagingEnabled: boolean;
  isLoading: boolean;
}

const PlatformConfigContext = createContext<PlatformConfigContextType | undefined>(undefined);

/**
 * Which sports and payment methods the super admin has enabled
 * platform-wide. Public and unauthenticated so it can gate pickers before
 * login too — disabled options are simply absent from the list, not
 * flagged, so callers don't need to special-case them.
 */
export const PlatformConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [enabledSports, setEnabledSports] = useState<Sport[]>([]);
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<PaymentMethod[]>([]);
  const [messagingEnabled, setMessagingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const [sports, paymentMethods, features] = await Promise.all([
        api.get<Sport[]>('/sports'),
        api.get<PaymentMethod[]>('/payment-methods'),
        api.get<{ messaging: boolean }>('/features').catch(() => ({ messaging: false })),
      ]);
      setEnabledSports(sports);
      setEnabledPaymentMethods(paymentMethods);
      setMessagingEnabled(Boolean(features?.messaging));
    } catch (err) {
      console.warn('Failed to fetch platform config, falling back to none', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const isSportEnabled = (code: SportCode | string) => enabledSports.some(sport => sport.code === code);
  const isPaymentMethodEnabled = (method: PaymentMethod | string) => enabledPaymentMethods.includes(method as PaymentMethod);

  return (
    <PlatformConfigContext.Provider value={{ enabledSports, isSportEnabled, enabledPaymentMethods, isPaymentMethodEnabled, messagingEnabled, isLoading }}>
      {children}
    </PlatformConfigContext.Provider>
  );
};

export const usePlatformConfig = () => {
  const context = useContext(PlatformConfigContext);
  if (!context) throw new Error('usePlatformConfig must be used within a PlatformConfigProvider');
  return context;
};
