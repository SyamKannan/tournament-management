import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareHeart, Search, Eye, EyeOff, Wand2, Star, Trash2, Plus, X, Save } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Skeleton, SkeletonTable, ErrorState } from '../../components/ui/Feedback';
import { Pager } from '../../components/ui/Pager';
import { FieldError, fieldErrorId, useFieldErrors } from '../../components/ui/FieldError';
import { Stars } from '../../components/LandingReviews';
import { usePaginatedList } from '../../lib/usePaginatedList';
import { useSingleFlight } from '../../lib/useSingleFlight';
import { formatDate } from '../../lib/format';

type Visibility = 'auto' | 'shown' | 'hidden';

interface AdminReview {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  author_name: string;
  author_title: string;
  rating: number;
  body: string;
  visibility: Visibility;
  is_featured: boolean;
  source: 'organizer' | 'admin';
  is_live: boolean;
  club_active: boolean;
  created_at: string;
}

interface ReviewSettings {
  enabled: boolean;
  min_rating: number;
  max_shown: number;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Approved' },
  { id: 'held', label: 'Below the minimum' },
  { id: 'hidden', label: 'Hidden by you' },
] as const;

const VISIBILITY_OPTIONS: { id: Visibility; label: string; icon: typeof Eye }[] = [
  { id: 'auto', label: 'Follow the rule', icon: Wand2 },
  { id: 'shown', label: 'Always show', icon: Eye },
  { id: 'hidden', label: 'Hide', icon: EyeOff },
];

/**
 * What the landing page's "What Clubs Say" shows. Reviews at or above the
 * minimum rating go up on their own; anything can be shown or hidden by hand.
 */
export const AdminReviewsPage: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<ReviewSettings | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // A ref, not the state above: two taps in one frame would both see `busyId` empty
  // and a "Feature" toggle would flip twice.
  const rowInFlight = useRef(false);
  const settingsFlight = useSingleFlight();

  const list = usePaginatedList<AdminReview>('/admin/reviews', {
    params: { filter: filter === 'all' ? undefined : filter },
  });

  useEffect(() => {
    api.get('/admin/settings')
      .then((res: { reviews: ReviewSettings }) => { setSettings(res.reviews); setSavedSettings(res.reviews); })
      .catch(() => toast.error('Could not load the review settings'));
  }, [toast]);

  const saveSettings = () => settingsFlight.run(async () => {
    if (!settings) return;
    const payload = { ...settings, max_shown: Math.max(1, Math.min(24, Math.round(settings.max_shown) || 1)) };
    try {
      const res: { reviews: ReviewSettings } = await api.put('/admin/settings', { reviews: payload });
      setSettings(res.reviews);
      setSavedSettings(res.reviews);
      toast.success('Review settings saved');
      await list.reload();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the review settings');
    }
  });

  const guarded = async (review: AdminReview, action: () => Promise<void>) => {
    if (rowInFlight.current) return;
    rowInFlight.current = true;
    setBusyId(review.id);
    try {
      await action();
    } finally {
      rowInFlight.current = false;
      setBusyId(null);
    }
  };

  const update = (review: AdminReview, patch: Partial<Pick<AdminReview, 'visibility' | 'is_featured'>>) =>
    guarded(review, async () => {
      try {
        await api.put(`/admin/reviews/${review.id}`, patch);
        await list.reload();
      } catch (err: any) {
        toast.error(err?.message || 'Could not update the review');
      }
    });

  const remove = async (review: AdminReview) => {
    if (rowInFlight.current) return;
    const proceed = await confirm({
      title: `Delete the review by ${review.author_name}?`,
      message: review.source === 'organizer'
        ? 'The club can write a new one. To keep it off the home page without deleting it, choose Hide instead.'
        : 'This cannot be undone.',
      confirmLabel: 'Delete review',
      tone: 'danger',
    });
    if (!proceed) return;
    await guarded(review, async () => {
      try {
        await api.delete(`/admin/reviews/${review.id}`);
        toast.success('Review deleted');
        await list.reload();
      } catch (err: any) {
        toast.error(err?.message || 'Could not delete the review');
      }
    });
  };

  const minRating = savedSettings?.min_rating ?? 4;
  const statusOf = (review: AdminReview): string => {
    if (review.is_live) return 'Approved';
    if (!review.club_active) return 'Club not active';
    if (review.visibility === 'hidden') return 'Hidden';
    return `Below ${minRating}★`;
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

  const settingsChanged = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-white flex items-center gap-2.5">
            <MessageSquareHeart className="w-7 h-7 text-amber-400" />
            <span>Reviews</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Choose which reviews visitors see in "What Clubs Say" on the home page.
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold">
          <Plus className="w-4 h-4" /> Add a review
        </button>
      </div>

      {settings && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-white">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={e => setSettings({ ...settings, enabled: e.target.checked })}
              className="w-5 h-5 accent-emerald-500"
            />
            Show the reviews section on the home page
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-sm font-semibold text-slate-300 mb-1.5">Show on their own when rated</span>
              <div className="flex gap-1" role="radiogroup" aria-label="Minimum rating">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={settings.min_rating === n}
                    onClick={() => setSettings({ ...settings, min_rating: n })}
                    className={`min-h-11 px-3 rounded-xl text-sm font-bold border ${
                      settings.min_rating === n ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {n === 5 ? '5★ only' : `${n}★ and up`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="reviews-max" className="block text-sm font-semibold text-slate-300 mb-1.5">Most reviews shown at once</label>
              <input
                id="reviews-max"
                type="number"
                min={1}
                max={24}
                value={settings.max_shown}
                onChange={e => setSettings({ ...settings, max_shown: Number(e.target.value) })}
                className="w-28 min-h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Featured reviews come first, then the highest rated. "Always show" and "Hide" override the rating rule.
          </p>
          {savedSettings && !savedSettings.enabled && (
            <p className="text-sm font-semibold text-amber-300">The section is switched off, so visitors see no reviews at all.</p>
          )}
          <button
            type="button"
            onClick={saveSettings}
            disabled={!settingsChanged || settingsFlight.busy}
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Save className="w-4 h-4" /> {settingsFlight.busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`min-h-11 px-4 rounded-xl text-sm font-semibold border ${
                filter === f.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={list.search}
            onChange={e => list.setSearch(e.target.value)}
            placeholder="Search name, club or words"
            aria-label="Search reviews"
            className="w-full min-h-11 rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-3 text-sm text-white placeholder-slate-500"
          />
        </div>
      </div>

      {list.rows.length === 0 ? (
        <p className="p-8 text-center text-slate-400 rounded-2xl border border-dashed border-slate-800">
          {list.search || filter !== 'all' ? 'No reviews match.' : 'No reviews yet. Clubs can write one from their dashboard.'}
        </p>
      ) : (
        <div className="space-y-3">
          {list.rows.map(review => (
            <article key={review.id} className={`p-5 rounded-2xl border bg-slate-900/80 ${review.is_live ? 'border-emerald-500/30' : 'border-slate-800'}`}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${review.is_live ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {statusOf(review)}
                    </span>
                    {review.is_featured && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300">Featured</span>}
                    {review.source === 'admin' && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300">Added by you</span>}
                  </div>
                  <p className="text-sm text-slate-200 whitespace-pre-line">{review.body}</p>
                  <p className="text-sm text-slate-400">
                    <span className="font-semibold text-slate-300">{review.author_name}</span>
                    {review.author_title && <> · {review.author_title}</>}
                    {review.organization_name && review.organization_name !== review.author_title && <> · {review.organization_name}</>}
                    {' · '}{formatDate(review.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
                  <div className="flex rounded-xl border border-slate-800 overflow-hidden" role="radiogroup" aria-label={`Visibility of the review by ${review.author_name}`}>
                    {VISIBILITY_OPTIONS.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={review.visibility === option.id}
                        disabled={busyId === review.id}
                        onClick={() => review.visibility !== option.id && update(review, { visibility: option.id })}
                        title={option.label}
                        className={`inline-flex items-center gap-1.5 min-h-11 px-3 text-xs font-semibold ${
                          review.visibility === option.id ? 'bg-slate-700 text-white' : 'bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        <option.icon className="w-4 h-4" /> {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === review.id}
                      onClick={() => update(review, { is_featured: !review.is_featured })}
                      className={`inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-semibold border ${
                        review.is_featured ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${review.is_featured ? 'fill-amber-400' : ''}`} /> {review.is_featured ? 'Featured' : 'Feature'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === review.id}
                      onClick={() => remove(review)}
                      aria-label={`Delete the review by ${review.author_name}`}
                      className="inline-flex items-center justify-center min-h-11 w-11 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Pager page={list.page} totalPages={list.totalPages} total={list.total} perPage={list.perPage} onPage={list.setPage} busy={list.loading} />

      {adding && <AddReviewDialog onClose={() => setAdding(false)} onAdded={() => { setAdding(false); list.reload(); }} />}
    </div>
  );
};

/** A review the admin collected elsewhere (a call, a message). Shown straight away. */
const AddReviewDialog: React.FC<{ onClose: () => void; onAdded: () => void }> = ({ onClose, onAdded }) => {
  const toast = useToast();
  const fields = useFieldErrors();
  const { run, busy } = useSingleFlight();
  const [form, setForm] = useState({ author_name: '', author_title: '', rating: 5, body: '', is_featured: false });

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
          <input id="ar-name" value={form.author_name} onChange={e => set('author_name', e.target.value)} maxLength={80} className={input} {...fields.inputProps('author_name')} />
          <FieldError id={fieldErrorId('author_name')} message={fields.get('author_name')} />
        </div>
        <div>
          <label htmlFor="ar-title" className="block text-sm font-semibold text-slate-300 mb-1.5">Club or role <span className="font-normal text-slate-500">(optional)</span></label>
          <input id="ar-title" value={form.author_title} onChange={e => set('author_title', e.target.value)} maxLength={120} placeholder="Organizer, Kerala Sevens" className={input} />
        </div>
        <div>
          <span className="block text-sm font-semibold text-slate-300 mb-1.5">Rating</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => set('rating', n)} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-800">
                <Star className={`w-7 h-7 ${n <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="ar-body" className="block text-sm font-semibold text-slate-300 mb-1.5">What they said</label>
          <textarea id="ar-body" value={form.body} onChange={e => set('body', e.target.value)} maxLength={500} rows={4} className={`${input} py-3`} {...fields.inputProps('body')} />
          <FieldError id={fieldErrorId('body')} message={fields.get('body')} />
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input type="checkbox" checked={form.is_featured} onChange={e => set('is_featured', e.target.checked)} className="w-5 h-5 accent-amber-500" />
          Feature it (shown first)
        </label>
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
