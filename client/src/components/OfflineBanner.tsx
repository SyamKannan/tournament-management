import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useToast } from './ui/Toast';
import { useT } from '../i18n';

/**
 * Says so when the phone has lost its connection.
 *
 * On a ground with patchy 4G, a tap that silently goes nowhere looks exactly
 * like a tap that worked. This banner is the difference: while it is showing,
 * nothing is being saved.
 */
export const OfflineBanner: React.FC = () => {
  const t = useT();
  const toast = useToast();
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      toast.success(t('net.backOnline'));
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [toast, t]);

  if (online) return null;

  return (
    <div role="alert" className="sticky top-0 z-[250] bg-amber-500 text-slate-950 px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 text-center">
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{t('net.offline')}</span>
    </div>
  );
};
