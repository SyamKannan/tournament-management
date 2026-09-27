import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Paginated } from '../types';
import {
  type UserNotification, markAllNotificationsRead, markNotificationRead, timeAgo, useNotificationBadge,
} from '../lib/notifications';

/**
 * The bell in the header: unread count, and the latest few in a panel. A tap
 * marks the item read and opens the screen it is about.
 *
 * While a super admin is viewing as a club, items stay unread for the club —
 * the server refuses to clear them, so the controls are hidden too.
 */
export const NotificationBell: React.FC = () => {
  const { isAuthenticated, isImpersonating } = useAuth();
  const unread = useNotificationBadge(isAuthenticated);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[] | null>(null);
  const [error, setError] = useState(false);
  // On a phone the panel spans the screen just under the header, which is
  // taller while the impersonation banner is showing.
  const [panelTop, setPanelTop] = useState(72);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const load = useCallback(() => {
    setError(false);
    api.get<Paginated<UserNotification>>('/me/notifications?per_page=8')
      .then(res => setItems(res?.data ?? []))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (!isAuthenticated) return null;

  const openItem = (item: UserNotification) => {
    setOpen(false);
    if (!item.read_at && !isImpersonating) {
      markNotificationRead(item.id).catch(() => { /* Opening it matters more. */ });
    }
    if (item.link) navigate(item.link);
  };

  const readAll = async () => {
    try {
      await markAllNotificationsRead();
      load();
    } catch { /* The badge will catch up on its next poll. */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          const header = ref.current?.closest('header');
          if (header) setPanelTop(Math.round(header.getBoundingClientRect().bottom) + 8);
          setOpen(value => !value);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500
                           text-white text-[11px] font-bold leading-[18px] text-center" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{ '--panel-top': `${panelTop}px` } as React.CSSProperties}
          className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-[var(--panel-top)] sm:top-full sm:mt-2 sm:w-96
                     rounded-2xl bg-slate-900/98 border border-slate-800 shadow-2xl shadow-black/50 z-50
                     backdrop-blur-xl animate-toast-in overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <p className="text-sm font-bold text-white">Notifications</p>
            {unread > 0 && !isImpersonating && (
              <button
                onClick={readAll}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {error ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">
                Couldn't load notifications.{' '}
                <button onClick={load} className="text-emerald-400 font-semibold hover:underline">Try again</button>
              </p>
            ) : items === null ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-400 text-center">
                Nothing yet. Team approvals, payments and fixtures will show up here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800/80">
                {items.map(item => (
                  <li key={item.id}>
                    <button
                      onClick={() => openItem(item)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-800/60 transition-colors flex gap-3"
                    >
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.read_at ? 'bg-transparent' : 'bg-cyan-400'}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm truncate ${item.read_at ? 'text-slate-300' : 'text-white font-semibold'}`}>
                          {!item.read_at && <span className="sr-only">Unread: </span>}
                          {item.title}
                        </span>
                        <span className="block text-xs text-slate-400 line-clamp-2 whitespace-pre-line mt-0.5">{item.body}</span>
                        <span className="block text-xs text-slate-500 mt-1">{timeAgo(item.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            to="/notifications"
            className="block px-4 py-3 text-center text-sm font-semibold text-emerald-400 hover:bg-slate-800/60 border-t border-slate-800"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
};
