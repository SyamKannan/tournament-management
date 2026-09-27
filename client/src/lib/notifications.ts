import { useEffect, useState } from 'react';
import { api } from '../services/api';

/** In-app notifications: the signed-in account's own feed (the bell). */
export interface UserNotification {
  id: string;
  event: string;
  title: string;
  body: string;
  /** A client route to open, or empty. */
  link: string;
  related_type: string;
  related_id: string;
  read_at: string | null;
  created_at: string;
}

/** Fired after anything changes read state, so the bell and the page agree. */
export const NOTIFICATIONS_CHANGED = 'notifications:changed';

const POLL_MS = 60_000;

const announce = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/me/notifications/${id}/read`, {});
  announce();
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/me/notifications/read-all', {});
  announce();
}

/**
 * Unread count for the bell. Polled — a minute's delay is fine, and the
 * WebSocket rooms are public so there is no private channel to push on — and
 * refreshed at once when the tab comes back or something is marked read.
 */
export function useNotificationBadge(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api.get<{ unread: number }>('/me/notifications/unread-count')
        .then(res => { if (!cancelled) setCount(res?.unread ?? 0); })
        .catch(() => { /* A badge is not worth an error. */ });
    };

    load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    document.addEventListener('visibilitychange', load);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [enabled]);

  return count;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function timeAgo(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;

  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
