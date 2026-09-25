import { useEffect, useState } from 'react';
import { api } from '../services/api';

const POLL_MS = 60_000;

/**
 * Unread support tickets for the sidebar: replies waiting for a club, or new
 * messages waiting for the platform. Polled — a minute's delay is fine for a
 * ticket — and refreshed at once when a support screen says something changed.
 */
export function useSupportBadge(endpoint: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!endpoint) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api.get<{ unread: number }>(endpoint)
        .then(res => { if (!cancelled) setCount(res?.unread ?? 0); })
        .catch(() => { /* A badge is not worth an error. */ });
    };

    load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener('support:changed', load);
    document.addEventListener('visibilitychange', load);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('support:changed', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [endpoint]);

  return count;
}
