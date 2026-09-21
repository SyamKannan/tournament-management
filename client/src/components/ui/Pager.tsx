import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../../i18n';

interface PagerProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPage: (page: number) => void;
  /** Disables the buttons while the next page loads, so a double tap can't skip one. */
  busy?: boolean;
  className?: string;
}

/**
 * "Showing 26–50 of 812" with previous/next.
 *
 * Stating the total is the point: a list that silently stopped at fifty let
 * people conclude that something did not exist. Buttons are full-height tap
 * targets because this is used on phones as much as desks.
 */
export const Pager: React.FC<PagerProps> = ({ page, totalPages, total, perPage, onPage, busy = false, className = '' }) => {
  const t = useT();

  if (total === 0) return null;

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <nav
      aria-label={t('pager.label')}
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 ${className}`}
    >
      <p className="text-sm text-slate-400 tabular-nums" aria-live="polite">
        {t('pager.showing', { first, last, total })}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={busy || page <= 1}
            className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            {t('pager.previous')}
          </button>
          <span className="text-sm text-slate-400 tabular-nums px-1">
            {t('pager.pageOf', { page, totalPages })}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={busy || page >= totalPages}
            className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('pager.next')}
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
};
