import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, ErrorState, SkeletonTable } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { usePaginatedList } from '../../lib/usePaginatedList';
import {
  NOTIFICATIONS_CHANGED, type UserNotification, markAllNotificationsRead, markNotificationRead, timeAgo,
  useNotificationBadge,
} from '../../lib/notifications';
import { formatDateTime } from '../../lib/format';

type Tab = 'all' | 'unread';

/** Every in-app notification this account has, newest first. */
export const NotificationsPage: React.FC = () => {
  const { isImpersonating } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const list = usePaginatedList<UserNotification>('/me/notifications', {
    perPage: 20,
    params: { unread: tab === 'unread' ? 1 : undefined },
  });
  const navigate = useNavigate();
  const { reload } = list;

  // The bell marking something read should show here too.
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, reload);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, reload);
  }, [reload]);

  const openItem = async (item: UserNotification) => {
    if (!item.read_at && !isImpersonating) {
      try { await markNotificationRead(item.id); } catch { /* Opening it matters more. */ }
    }
    if (item.link) navigate(item.link);
  };

  // The server's count, not this page's rows: the unread ones may all be on page 2.
  const unread = useNotificationBadge(true);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white">Notifications</h1>
          <p className="text-sm text-slate-400 mt-1">What happened with your tournaments, teams and account</p>
        </div>
        {unread > 0 && !isImpersonating && (
          <button
            onClick={() => markAllNotificationsRead().catch(() => { /* reload shows the truth */ })}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:bg-slate-800
                       text-sm font-bold text-slate-200 flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Mark all read
          </button>
        )}
      </div>

      {isImpersonating && (
        <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          You are viewing as this account, so nothing here is marked read for them.
        </p>
      )}

      <div className="flex gap-2" role="tablist" aria-label="Filter notifications">
        {(['all', 'unread'] as const).map(value => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              tab === value
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {value === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>

      {list.initialLoading ? (
        <SkeletonTable rows={6} />
      ) : list.error && list.rows.length === 0 ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={tab === 'unread' ? 'All caught up' : 'No notifications yet'}
          message={tab === 'unread'
            ? 'You have read everything.'
            : 'Team approvals, payments, fixtures and reminders will show up here.'}
        />
      ) : (
        <>
          <ul className="border border-slate-800 rounded-2xl overflow-hidden glass-card divide-y divide-slate-800/80">
            {list.rows.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => openItem(item)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-800/50 transition-colors flex gap-3"
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.read_at ? 'bg-transparent' : 'bg-cyan-400'}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm ${item.read_at ? 'text-slate-300' : 'text-white font-semibold'}`}>
                        {!item.read_at && <span className="sr-only">Unread: </span>}
                        {item.title}
                      </span>
                      <time dateTime={item.created_at} title={formatDateTime(item.created_at)}
                            className="text-xs text-slate-500 shrink-0">
                        {timeAgo(item.created_at)}
                      </time>
                    </span>
                    <span className="block text-sm text-slate-400 whitespace-pre-line mt-1">{item.body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <Pager
            page={list.page}
            totalPages={list.totalPages}
            total={list.total}
            perPage={list.perPage}
            onPage={list.setPage}
            busy={list.loading}
          />
        </>
      )}
    </div>
  );
};
