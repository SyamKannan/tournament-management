import React, { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

// Display names for plan feature ids, shared by every screen that lists plan features.
export const PLAN_FEATURE_LABELS: Record<string, string> = {
  live_scoring: 'Live Scoring with Instant Undo',
  scoreboard_tv: '16:9 Big Screen TV Scoreboard',
  team_registration_links: 'Public Mobile Team Registration Links',
  standings: 'Automated Points Tables & GD/NRR',
  break_ads: 'Break-Time Sponsor Ads Rotator',
  sponsor_management: 'Sponsor Tiers Management',
  emergency_announcements: 'Emergency Delay Scoreboard Broadcasts',
  player_auctions: 'IPL/ISL Live Player Auction Arena',
  player_career_stats: 'Player Career Stats & Digital ID Pass',
  offline_payments_tracking: 'Offline Cash & UPI Payment Tracker',
  pdf_exports: 'Official Registration Receipts & PDF Exports',
  advanced_analytics: 'Advanced Analytics & Insights',
  custom_branding: 'Custom Organization Branding',
  coin_toss: 'Pre-Match Coin Toss',
  ai_tournament_poster: 'Match & Tournament Posters',
};

export const planFeatureLabel = (id: string) => PLAN_FEATURE_LABELS[id] || id.replace(/_/g, ' ');

const ACCENTS = {
  emerald: { icon: 'text-emerald-400', link: 'text-emerald-400 hover:text-emerald-300' },
  amber: { icon: 'text-amber-400', link: 'text-amber-400 hover:text-amber-300' },
  cyan: { icon: 'text-cyan-400', link: 'text-cyan-400 hover:text-cyan-300' },
};

interface Props {
  planName: string;
  features: string[];
  /** How many features show before the "+N more" button. */
  preview?: number;
  accent?: keyof typeof ACCENTS;
}

/**
 * A plan's feature list, cut to `preview` items with a "+N more" button that opens the full
 * list as an overlay over the card, so cards in a grid keep equal heights.
 * The card containing this must be `relative`.
 */
export const PlanFeatureList: React.FC<Props> = ({ planName, features, preview = 6, accent = 'cyan' }) => {
  const [open, setOpen] = useState(false);
  const colors = ACCENTS[accent];
  const hidden = features.length - preview;

  const renderItem = (f: string) => (
    <li key={f} className="flex items-center gap-2">
      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${colors.icon}`} />
      <span className="leading-tight">{planFeatureLabel(f)}</span>
    </li>
  );

  if (features.length === 0) return null;

  return (
    <>
      <ul className="space-y-2 text-xs text-slate-300">
        {features.slice(0, preview).map(renderItem)}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`mt-2.5 pl-[22px] text-[11px] font-semibold transition-colors ${colors.link}`}
        >
          + {hidden} more {hidden === 1 ? 'feature' : 'features'}
        </button>
      )}

      {open && (
        <div className="absolute inset-0 z-20 rounded-[inherit] bg-slate-950/95 backdrop-blur-sm p-6 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {planName} · All {features.length} Features
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close feature list"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs text-slate-300">
            {features.map(renderItem)}
          </ul>
        </div>
      )}
    </>
  );
};
