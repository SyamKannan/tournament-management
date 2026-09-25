import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareHeart, Plus, Search, Star, X } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonTable, ErrorState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { FieldError, fieldErrorId, useFieldErrors } from '../../components/ui/FieldError';
import { Stars } from '../../components/LandingReviews';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { formatDate } from '../../lib/format';
import { useSingleFlight } from '../../lib/useSingleFlight';

interface AdminReview {
  id: string;
  organization_id: string | null;
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

type Tab = 'live' | 'not_live' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Showing' },
  { id: 'not_live', label: 'Not showing' },
  { id: 'all', label: 'All' },
];

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'lowest', label: 'Lowest rated' },
  { id: 'highest', label: 'Highest rated' },
] as const;

/** Longer than this folds to three lines with "Show more". */
const LONG_REVIEW = 220;

const control = 'min-h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-sm text-white';

/**
 * Which reviews visitors see on the home page. Good ratings show on their own;
 * one switch per review, or a selection of many, shows or hides by hand.
 * Built for a long list: server-side paging and search, star filter, sort,
 * counts on every tab, and bulk show/hide.
 */
export const AdminReviewsPage: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('live');
  const [rating, setRating] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('newest');
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // A ref, not state: two taps in one frame must not both go through.
  const inFlight = useRef(false);

  const list = usePaginatedList<AdminReview>('/admin/reviews', {
    params: { filter: tab === 'all' ? undefined : tab, rating: rating || undefined, sort },
  });
  const counts: Record<Tab, number> | undefined = list.raw?.counts
    ? { live: list.raw.counts.live, not_live: list.raw.counts.not_live, all: list.raw.counts.all }
    : undefined;

  // A selection belongs to the rows on screen; a new page, filter or reload drops it.
  // Keyed on the response object: `rows` is a fresh [] every render before the first load.
  useEffect(() => { setSelected(new Set()); }, [list.raw]);

  useEffect(() => {
    api.get('/admin/settings')
      .then((res: { reviews: ReviewSettings }) => setSettings(res.reviews))
      .catch(() => toast.error('Could not load the review settings'));
  }, [toast]);

  /** One action at a time across the whole page; `key` marks what is busy. */
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

  const bulk = (visibility: 'shown' | 'hidden') => guarded('bulk', async () => {
    try {
      const res: { updated: number } = await api.post('/admin/reviews/visibility', { ids: [...selected], visibility });
      toast.success(`${res.updated} ${res.updated === 1 ? 'review' : 'reviews'} ${visibility === 'hidden' ? 'hidden' : 'shown'}`);
      await list.reload();
    } catch (err: any) {
      toast.error(err?.message || 'Could not update the reviews');
    }
  });

  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

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
  const allOnPage = list.rows.length > 0 && list.rows.every(r => selected.has(r.id));
  const filtering = list.search.trim() !== '' || rating !== '';

  const whyOff = (review: AdminReview): string => {
    if (!review.club_active) return 'This club is not active, so its review is not shown.';
    if (review.visibility === 'hidden') return 'You hid this review.';
    return `Rated below ${minRating}★. Turn it on to show it anyway.`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2.5">
            <MessageSquareHeart className="w-7 h-7 text-amber-400" />
            <span>Reviews</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Reviews from clubs, shown on the home page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> Add a review
        </button>
      </div>

      {settings && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
          <div className="flex items-center justify-between lg:justify-start gap-4">
            <Switch
              checked={settings.enabled}
              disabled={busyId !== null}
              label="Show reviews on the home page"
              onChange={() => saveSetting({ enabled: !settings.enabled })}
            />
            <div className="order-first lg:order-none">
              <p className="font-semibold text-white">Show reviews on the home page</p>
              {!settings.enabled && <p className="text-sm text-amber-300">Off. Visitors see no reviews.</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-8">
            <label htmlFor="reviews-min" className="text-sm text-slate-300">Show automatically when rated</label>
            <select
              id="reviews-min"
              value={settings.min_rating}
              disabled={busyId !== null}
              onChange={e => saveSetting({ min_rating: Number(e.target.value) })}
              className={control}
            >
              {[5, 4, 3, 2, 1].map(n => (
                <option key={n} value={n}>{n === 5 ? '5★ only' : `${n}★ or more`}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter reviews">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-xl text-sm font-semibold border ${
                tab === t.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
              {counts && <span className="tabular-nums text-xs rounded-full px-2 py-0.5 bg-slate-950/60">{counts[t.id]}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={list.search}
              onChange={e => list.setSearch(e.target.value)}
              placeholder="Search name, club or words"
              aria-label="Search reviews"
              className={`${control} w-full pl-9 placeholder-slate-500`}
            />
          </div>
          <select value={rating} onChange={e => setRating(e.target.value)} aria-label="Filter by rating" className={control}>
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n}★ only</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort reviews" className={control}>
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {list.rows.length === 0 ? (
        <p className="p-8 text-center text-slate-400 rounded-2xl border border-dashed border-slate-800">
          {filtering
            ? 'No reviews match your search.'
            : tab === 'all' ? 'No reviews yet. Clubs can write one from their dashboard.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="inline-flex items-center gap-3 min-h-11 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allOnPage}
              onChange={() => setSelected(allOnPage ? new Set() : new Set(list.rows.map(r => r.id)))}
              className="w-5 h-5 accent-emerald-500"
            />
            Select all on this page
          </label>

          {list.rows.map(review => {
            const long = review.body.length > LONG_REVIEW;
            const open = expanded.has(review.id);
            return (
              <article
                key={review.id}
                className={`p-4 sm:p-5 rounded-2xl border bg-slate-900/80 flex items-start gap-3 sm:gap-4 ${
                  selected.has(review.id) ? 'border-emerald-500/50' : 'border-slate-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(review.id)}
                  onChange={() => setSelected(s => flip(s, review.id))}
                  aria-label={`Select the review by ${review.author_name}`}
                  className="mt-1 w-5 h-5 shrink-0 accent-emerald-500"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Stars rating={review.rating} />
                  <p className={`text-sm text-slate-200 whitespace-pre-line break-words ${long && !open ? 'line-clamp-3' : ''}`}>{review.body}</p>
                  {long && (
                    <button type="button" onClick={() => setExpanded(s => flip(s, review.id))} className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
                      {open ? 'Show less' : 'Show more'}
                    </button>
                  )}
                  <p className="text-sm text-slate-400">
                    <span className="font-semibold text-slate-300">{review.author_name}</span>
                    {(review.author_title || review.organization_name) && <> · {review.author_title || review.organization_name}</>}
                    {' · '}{formatDate(review.created_at)}
                    {!review.organization_id && <> · Added by you</>}
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
            );
          })}
        </div>
      )}

      <Pager page={list.page} totalPages={list.totalPages} total={list.total} perPage={list.perPage} onPage={list.setPage} busy={list.loading} />

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl">
          <span className="px-2 text-sm font-semibold text-white">{selected.size} selected</span>
          <button type="button" disabled={busyId !== null} onClick={() => bulk('shown')} className="min-h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold disabled:opacity-50">
            Show on home page
          </button>
          <button type="button" disabled={busyId !== null} onClick={() => bulk('hidden')} className="min-h-11 px-4 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            Hide
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="min-h-11 px-4 rounded-xl text-slate-300 hover:text-white text-sm font-semibold ml-auto">
            Clear
          </button>
        </div>
      )}

      {adding && (
        <AddReviewDialog
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); list.reload(); }}
        />
      )}
    </div>
  );
};

/** A review collected elsewhere (a call, a message). It goes on the home page straight away. */
const AddReviewDialog: React.FC<{ onClose: () => void; onAdded: () => void }> = ({ onClose, onAdded }) => {
  const toast = useToast();
  const fields = useFieldErrors();
  const { run, busy } = useSingleFlight();
  const [form, setForm] = useState({ author_name: '', author_title: '', rating: 5, body: '' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    fields.clear(key);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      try {
        await api.post('/admin/reviews', form);
        toast.success('Review added to the home page');
        onAdded();
      } catch (err: any) {
        if (!fields.capture(err)) toast.error(err?.message || 'Could not add the review');
      }
    });
  };

  const input = 'w-full min-h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-sm text-white placeholder-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="add-review-title">
      <form onSubmit={submit} className="w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="add-review-title" className="text-lg font-bold text-white">Add a review</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label htmlFor="ar-name" className="block text-sm font-semibold text-slate-300 mb-1.5">Name</label>
          <input id="ar-name" autoFocus value={form.author_name} onChange={e => set('author_name', e.target.value)} maxLength={80} className={input} {...fields.inputProps('author_name')} />
          <FieldError id={fieldErrorId('author_name')} message={fields.get('author_name')} />
        </div>
        <div>
          <label htmlFor="ar-title" className="block text-sm font-semibold text-slate-300 mb-1.5">
            Club or role <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input id="ar-title" value={form.author_title} onChange={e => set('author_title', e.target.value)} maxLength={120} placeholder="Organizer, Kerala Sevens" className={input} />
        </div>
        <div>
          <span className="block text-sm font-semibold text-slate-300 mb-1.5">Rating</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={form.rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => set('rating', n)}
                className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-800"
              >
                <Star className={`w-7 h-7 ${n <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="ar-body" className="block text-sm font-semibold text-slate-300 mb-1.5">What they said</label>
          <textarea id="ar-body" value={form.body} onChange={e => set('body', e.target.value)} maxLength={500} rows={4} className={`${input} py-3`} {...fields.inputProps('body')} />
          <div className="flex justify-between">
            <FieldError id={fieldErrorId('body')} message={fields.get('body')} />
            <span className="mt-1.5 ml-auto text-xs text-slate-500 tabular-nums">{form.body.length}/500</span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add review'}
          </button>
        </div>
      </form>
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
