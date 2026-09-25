import React, { useEffect, useState } from 'react';
import { MessageSquareHeart, Star } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './ui/Toast';
import { FieldError, fieldErrorId, useFieldErrors } from './ui/FieldError';
import { useSingleFlight } from '../lib/useSingleFlight';

interface OwnReview {
  rating: number;
  body: string;
  author_name: string;
  author_title: string;
  is_live: boolean;
}

/**
 * The club's own review of the platform. The super admin decides what the
 * landing page shows; this says plainly whether theirs is on it.
 */
export const ClubReviewCard: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const toast = useToast();
  const fields = useFieldErrors();
  const { run, busy } = useSingleFlight();
  const [saved, setSaved] = useState<OwnReview | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);

  const adopt = (review: OwnReview | null) => {
    setSaved(review);
    setRating(review?.rating ?? 0);
    setBody(review?.body ?? '');
  };

  useEffect(() => {
    api.get(`/organizations/${organizationId}/review`)
      .then((res: { review: OwnReview | null }) => adopt(res.review))
      .catch(() => adopt(null))
      .finally(() => setLoaded(true));
  }, [organizationId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      try {
        const res: { review: OwnReview } = await api.put(`/organizations/${organizationId}/review`, { rating: rating || null, body });
        adopt(res.review);
        setEditing(false);
        fields.capture(null);
        toast.success('Thanks for your review!', res.review.is_live ? 'It is approved to appear on the KickWick home page.' : undefined);
      } catch (err: any) {
        if (!fields.capture(err)) toast.error(err?.message || 'Could not save your review');
      }
    });
  };

  if (!loaded) return null;

  const showForm = editing || !saved;

  return (
    <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MessageSquareHeart className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-white">{saved ? 'Your review' : 'How is KickWick working for your club?'}</h2>
        </div>
        {saved && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200">
            Edit
          </button>
        )}
      </div>

      {!showForm && saved && (
        <div className="mt-3 space-y-2">
          <StarRow value={saved.rating} />
          <p className="text-sm text-slate-300 whitespace-pre-line">{saved.body}</p>
          <p className="text-sm text-slate-400">
            {saved.is_live ? 'Approved to appear on the KickWick home page.' : 'Not on the KickWick home page right now.'}
          </p>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <StarRow value={rating} onChange={value => { setRating(value); fields.clear('rating'); }} />
            <FieldError id={fieldErrorId('rating')} message={fields.get('rating')} />
          </div>
          <div>
            <label htmlFor="club-review-body" className="sr-only">Your review</label>
            <textarea
              id="club-review-body"
              value={body}
              onChange={e => { setBody(e.target.value); fields.clear('body'); }}
              maxLength={500}
              rows={3}
              placeholder="What has it made easier for your tournaments?"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              {...fields.inputProps('body')}
            />
            <div className="flex justify-between">
              <FieldError id={fieldErrorId('body')} message={fields.get('body')} />
              <span className="mt-1.5 ml-auto text-xs text-slate-500 tabular-nums">{body.length}/500</span>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Your name and club name may appear with it on the KickWick home page.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="min-h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold disabled:opacity-50">
              {busy ? 'Saving…' : saved ? 'Save changes' : 'Send review'}
            </button>
            {saved && (
              <button type="button" onClick={() => { adopt(saved); setEditing(false); fields.capture(null); }} className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};

const StarRow: React.FC<{ value: number; onChange?: (value: number) => void }> = ({ value, onChange }) => {
  if (!onChange) {
    return (
      <span className="inline-flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map(n => (
          <Star key={n} className={`w-5 h-5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
        ))}
      </span>
    );
  }

  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-800"
        >
          <Star className={`w-7 h-7 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
        </button>
      ))}
    </div>
  );
};
