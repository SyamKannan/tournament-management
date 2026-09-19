import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ImageCarouselBackdrop } from './ImageCarouselBackdrop';
import { useImageCarousel } from '../lib/useImageCarousel';
import { api } from '../services/api';

/** Live counts from `GET /platform-stats`. */
export type PlatformStatKey = 'clubs' | 'tournaments' | 'teams' | 'players' | 'matches_played' | 'live_matches';
type PlatformStats = Record<PlatformStatKey, number>;

const STAT_LABELS: Record<PlatformStatKey, string> = {
  clubs: 'Clubs',
  tournaments: 'Tournaments',
  teams: 'Teams',
  players: 'Players',
  matches_played: 'Matches played',
  live_matches: 'Live now',
};

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

/** Fetched once per page load and shared by whichever auth page is open. */
let statsRequest: Promise<PlatformStats | null> | null = null;
const loadStats = () =>
  (statsRequest ??= api.get('/platform-stats').catch(() => {
    statsRequest = null;
    return null;
  }));

type Accent = 'emerald' | 'cyan' | 'amber' | 'violet';

interface AuthShowcaseProps {
  images: readonly string[];
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  /** Which live counts to show, in order of preference; the first three above zero are shown. */
  stats: PlatformStatKey[];
  accent?: Accent;
}

const ACCENT_BADGE: Record<Accent, string> = {
  emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  cyan: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
  amber: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  violet: 'bg-violet-500/15 border-violet-500/30 text-violet-300',
};

// Two-stop duotone wash layered over the base scrim — gives each page's
// showcase a distinct, richer color identity instead of a flat single tint.
const ACCENT_WASH: Record<Accent, string> = {
  emerald: 'linear-gradient(115deg, rgba(200, 245, 53,0.38) 0%, transparent 45%), linear-gradient(305deg, rgba(56, 189, 248,0.22) 0%, transparent 40%)',
  cyan: 'linear-gradient(115deg, rgba(56, 189, 248,0.38) 0%, transparent 45%), linear-gradient(305deg, rgba(59,130,246,0.22) 0%, transparent 40%)',
  amber: 'linear-gradient(115deg, rgba(245,158,11,0.38) 0%, transparent 45%), linear-gradient(305deg, rgba(236,72,153,0.18) 0%, transparent 40%)',
  violet: 'linear-gradient(115deg, rgba(139,92,246,0.38) 0%, transparent 45%), linear-gradient(305deg, rgba(236,72,153,0.2) 0%, transparent 40%)',
};

const ACCENT_DOT: Record<Accent, string> = {
  emerald: 'bg-emerald-400',
  cyan: 'bg-cyan-400',
  amber: 'bg-amber-400',
  violet: 'bg-violet-400',
};

// Full-height photo panel used alongside auth forms — hidden below the `lg`
// breakpoint so narrow/mobile screens keep the form as the only focus.
export const AuthShowcase: React.FC<AuthShowcaseProps> = ({
  images,
  eyebrow,
  title,
  description,
  stats,
  accent = 'emerald',
}) => {
  const activeSlide = useImageCarousel(images.length, 6000);
  const [counts, setCounts] = useState<PlatformStats | null>(null);

  useEffect(() => {
    let alive = true;
    loadStats().then(result => { if (alive) setCounts(result); });
    return () => { alive = false; };
  }, []);

  // A brand-new platform shouldn't advertise "0 clubs": zero counts are skipped,
  // and the row disappears entirely if nothing is worth showing.
  const shown = counts ? stats.filter(key => (counts[key] ?? 0) > 0).slice(0, 3) : [];

  return (
    <div className="relative hidden lg:block lg:w-[45%] xl:w-1/2 overflow-hidden shrink-0 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:self-start">
      <ImageCarouselBackdrop images={images} activeIndex={activeSlide} />
      <div className="absolute inset-0 photo-overlay-base" aria-hidden="true" />
      <div className="absolute inset-0" style={{ backgroundImage: ACCENT_WASH[accent] }} aria-hidden="true" />

      {images.length > 1 && (
        <div className="absolute top-10 left-10 z-10 flex items-center gap-1.5">
          {images.map((img, i) => (
            <span
              key={img}
              className={`h-1 rounded-full transition-all duration-500 ${i === activeSlide ? `w-6 ${ACCENT_DOT[accent]}` : 'w-1.5 bg-white/30'}`}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col justify-end p-10 xl:p-14">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.21, 1.02, 0.73, 1] }}
        >
          <span className={`inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider mb-5 ${ACCENT_BADGE[accent]}`}>
            {eyebrow}
          </span>
          <h2 className="text-3xl xl:text-4xl font-black font-heading text-white leading-tight mb-3 max-w-md">
            {title}
          </h2>
          <p className="text-sm text-slate-300 max-w-sm leading-relaxed mb-8">
            {description}
          </p>
        </motion.div>

        {shown.length > 0 && (
        <div className="grid grid-cols-3 gap-4 max-w-md">
          {shown.map((key, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: [0.21, 1.02, 0.73, 1] }}
              className="p-3 rounded-2xl bg-slate-950/50 border border-white/10 backdrop-blur-sm"
            >
              <div className="text-lg font-black text-white font-heading flex items-center gap-1.5">
                {key === 'live_matches' && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" aria-hidden="true" />}
                {compact.format(counts![key])}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide leading-tight mt-0.5">{STAT_LABELS[key]}</div>
            </motion.div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};
