import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Sport, SportCode } from '../types';
import { api } from '../services/api';

interface PlatformConfigContextType {
  enabledSports: Sport[];
  isSportEnabled: (code: SportCode | string) => boolean;
  isLoading: boolean;
}

const PlatformConfigContext = createContext<PlatformConfigContextType | undefined>(undefined);

/**
 * Which sports (football, cricket, ...) the super admin has enabled
 * platform-wide. Public and unauthenticated so it can gate sport pickers
 * before login too — disabled sports are simply absent from the list, not
 * flagged, so callers don't need to special-case them.
 */
export const PlatformConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [enabledSports, setEnabledSports] = useState<Sport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSports = useCallback(async () => {
    try {
      const res = await api.get<Sport[]>('/sports');
      setEnabledSports(res);
    } catch (err) {
      console.warn('Failed to fetch enabled sports, falling back to none', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSports();
  }, [fetchSports]);

  const isSportEnabled = (code: SportCode | string) => enabledSports.some(sport => sport.code === code);

  return (
    <PlatformConfigContext.Provider value={{ enabledSports, isSportEnabled, isLoading }}>
      {children}
    </PlatformConfigContext.Provider>
  );
};

export const usePlatformConfig = () => {
  const context = useContext(PlatformConfigContext);
  if (!context) throw new Error('usePlatformConfig must be used within a PlatformConfigProvider');
  return context;
};
