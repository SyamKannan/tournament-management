import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Quote, Star } from 'lucide-react';
import { api } from '../services/api';

/** One card from `GET /reviews` — the admin decides which reach this list. */
export interface PublicReview {
  id: string;
  author_name: string;
  author_title: string;
  rating: number;
  body: string;
  created_at: string;
}

export const Stars: React.FC<{ rating: number; className?: string }> = ({ rating, className = 'w-4 h-4' }) => (
  <span className="inline-flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} className={`${className} ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
    ))}
  </span>
);

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');

/** Landing-page "What clubs say". Renders nothing when switched off or empty. */
export const LandingReviews: React.FC = () => {
  const [reviews, setReviews] = useState<PublicReview[]>([]);

  useEffect(() => {
    api.get('/reviews')
      .then((res: { enabled: boolean; data: PublicReview[] }) => setReviews(res?.enabled ? res.data ?? [] : []))
      .catch(() => setReviews([]));
  }, []);

  if (reviews.length === 0) return null;

  return (
    <section id="reviews" className="relative z-10 scroll-mt-20 py-20 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-2xl mx-auto mb-12"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-amber-400 block mb-2">Reviews</span>
        <h2 className="text-3xl sm:text-4xl font-black font-heading text-white">What Clubs Say</h2>
        <p className="mt-4 text-[15px] sm:text-lg text-slate-400 leading-relaxed">
          From the organizers running their tournaments here.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {reviews.map((review, i) => (
          <motion.figure
            key={review.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: Math.min(i, 5) * 0.06 }}
            className="flex flex-col rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <Stars rating={review.rating} />
              <Quote className="w-6 h-6 text-slate-700" />
            </div>
            <blockquote className="mt-4 flex-1 text-[15px] text-slate-200 leading-relaxed whitespace-pre-line">
              {review.body}
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <span className="w-10 h-10 shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-300">
                {initials(review.author_name)}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-white truncate">{review.author_name}</span>
                {review.author_title && <span className="block text-sm text-slate-400 truncate">{review.author_title}</span>}
              </span>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
};
