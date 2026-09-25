import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareHeart } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonTable, ErrorState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { Stars } from '../../components/LandingReviews';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { formatDate } from '../../lib/format';

interface AdminReview {
  id: string;
  organization_name: string | null;
  author_name: string;
  author_title: string;
  rating: number;
  body: string;
  visibility: 'auto' | 'shown' | 'hidden';
  is_live: boolean;
  club_active: boolean;
  created_at: string;
}

interface ReviewSettings {
  enabled: boolean;
  min_rating: number;
  max_shown: number;
}

const TABS = [
  { id: 'live', label: 'Showing' },
  { id: 'not_live', label: 'Not showing' },
  { id: 'all', label: 'All' },
] as const;

/**
 * Which club reviews visitors see on the home page. Good ratings show on their
 * own; one switch per review shows or hides it by hand.
 */
export const AdminReviewsPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('live');
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // A ref, not state: two taps in one frame must not both go through.
  const inFlight = useRef(false);

  const list = usePaginatedList<AdminReview>('/admin/reviews', {
    params: { filter: tab === 'all' ? undefined : tab },
  });

  useEffect(() => {
    api.get('/admin/settings')
      .then((res: { reviews: ReviewSettings }) => setSettings(res.reviews))
      .catch(() => toast.error('Could not load the review settings'));
  }, [toast]);

  /** One flight at a time across the whole page; `key` marks what is busy. */
  const guarded = async (key: string, action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyId(key);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  };

  const saveSetting = (patch: Partial<ReviewSettings>) => guarded('settings', async () => {
    try {
      const res: { reviews: ReviewSettings } = await api.put('/admin/settings', { reviews: patch });
      setSettings(res.reviews);
      await list.reload();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the setting');
    }
  });

  const toggle = (review: AdminReview) => guarded(review.id, async () => {
    try {
      await api.put(`/admin/reviews/${review.id}`, { visibility: review.is_live ? 'hidden' : 'shown' });
      await list.reload();
    } catch (err: any) {
      toast.error(err?.message || 'Could not update the review');
    }
  });

  if (list.initialLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <SkeletonTable rows={6} />
      </div>
    );
  }

  if (list.error && list.rows.length === 0) {
    return <ErrorState message={list.error} onRetry={list.reload} />;
  }

  const minRating = settings?.min_rating ?? 4;

  const whyOff = (review: AdminReview): string => {
    if (!review.club_active) return 'This club is not active, so its review is not shown.';
    if (review.visibility === 'hidden') return 'You hid this review.';
    return `Rated below ${minRating}★. Turn it on to show it anyway.`;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2.5">
          <MessageSquareHeart className="w-7 h-7 text-amber-400" />
          <span>Reviews</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Reviews from clubs, shown on the home page.
        </p>
      </div>

      {settings && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-white">Show reviews on the home page</p>
              {!settings.enabled && <p className="text-sm text-amber-300">Off. Visitors see no reviews.</p>}
            </div>
            <Switch
              checked={settings.enabled}
              disabled={busyId !== null}
              label="Show reviews on the home page"
              onChange={() => saveSetting({ enabled: !settings.enabled })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-800 pt-4">
            <label htmlFor="reviews-min" className="text-sm text-slate-300">Show automatically when rated</label>
            <select
              id="reviews-min"
              value={settings.min_rating}
              disabled={busyId !== null}
              onChange={e => saveSetting({ min_rating: Number(e.target.value) })}
              className="min-h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-sm text-white"
            >
              {[5, 4, 3, 2, 1].map(n => (
                <option key={n} value={n}>{n === 5 ? '5★ only' : `${n}★ or more`}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex gap-2" role="tablist" aria-label="Filter reviews">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-11 px-4 rounded-xl text-sm font-semibold border ${
              tab === t.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.rows.length === 0 ? (
        <p className="p-8 text-center text-slate-400 rounded-2xl border border-dashed border-slate-800">
          {tab === 'all' ? 'No reviews yet. Clubs can write one from their dashboard.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="space-y-3">
          {list.rows.map(review => (
            <article key={review.id} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 flex items-start gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Stars rating={review.rating} />
                <p className="text-sm text-slate-200 whitespace-pre-line">{review.body}</p>
                <p className="text-sm text-slate-400">
                  <span className="font-semibold text-slate-300">{review.author_name}</span>
                  {(review.author_title || review.organization_name) && <> · {review.author_title || review.organization_name}</>}
                  {' · '}{formatDate(review.created_at)}
                </p>
                {!review.is_live && <p className="text-sm text-slate-500">{whyOff(review)}</p>}
              </div>
              <div className="shrink-0 flex flex-col items-center gap-1">
                <Switch
                  checked={review.is_live}
                  disabled={busyId !== null || !review.club_active}
                  label={`Show the review by ${review.author_name} on the home page`}
                  onChange={() => toggle(review)}
                />
                <span className="text-xs text-slate-400">{review.is_live ? 'Showing' : 'Hidden'}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <Pager page={list.page} totalPages={list.totalPages} total={list.total} perPage={list.perPage} onPage={list.setPage} busy={list.loading} />
    </div>
  );
};

const Switch: React.FC<{ checked: boolean; disabled?: boolean; label: string; onChange: () => void }> = ({ checked, disabled, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className="inline-flex h-11 w-16 shrink-0 items-center justify-center disabled:opacity-50"
  >
    <span className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </span>
  </button>
);
