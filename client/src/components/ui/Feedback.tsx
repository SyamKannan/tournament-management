import React from 'react';
import { Link } from 'react-router-dom';
import { SportsLoader } from './SportsLoader';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared states every data-backed screen needs: loading, empty, and error.
 *
 * Skeletons hold the shape of the content that is coming, so the layout does
 * not jump when data lands.
 */

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-slate-800/70 ${className}`} aria-hidden="true" />
);

export const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="rounded-2xl bg-slate-900/60 ring-1 ring-slate-800 p-5">
    <Skeleton className="h-4 w-1/3 mb-4" />
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} className={`h-3 mb-2.5 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`} />
    ))}
  </div>
);

export const SkeletonStats: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="rounded-2xl bg-slate-900/60 ring-1 ring-slate-800 p-5">
        <Skeleton className="h-3 w-24 mb-4" />
        <Skeleton className="h-8 w-28 mb-3" />
        <Skeleton className="h-3 w-32" />
      </div>
    ))}
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="rounded-2xl bg-slate-900/60 ring-1 ring-slate-800 overflow-hidden">
    <div className="p-4 border-b border-slate-800"><Skeleton className="h-4 w-40" /></div>
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="flex items-center gap-4 p-4 border-b border-slate-800/60 last:border-0">
        <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 w-20 hidden sm:block" />
        <Skeleton className="h-7 w-16 rounded-lg shrink-0" />
      </div>
    ))}
  </div>
);

export const LoadingState: React.FC<{ label?: string; className?: string }> = ({
  label = 'Loading…',
  className = 'min-h-[50vh]',
}) => (
  <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite">
    <SportsLoader label={label} />
  </div>
);

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  /** A single next step, so an empty screen still tells the user what to do. */
  action?: { label: string; to?: string; onClick?: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, message, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl
                  bg-slate-900/40 ring-1 ring-slate-800/80">
    <div className="w-14 h-14 rounded-2xl bg-slate-800/80 ring-1 ring-slate-700 grid place-items-center mb-4">
      <Icon className="w-6 h-6 text-slate-400" aria-hidden="true" />
    </div>
    <h3 className="text-base font-bold text-white font-heading">{title}</h3>
    <p className="mt-1.5 text-sm text-slate-400 max-w-sm leading-relaxed">{message}</p>

    {action && (action.to ? (
      <Link
        to={action.to}
        className="mt-5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white
                   shadow-lg shadow-emerald-900/30 transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        {action.label}
      </Link>
    ) : (
      <button
        onClick={action.onClick}
        className="mt-5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white
                   shadow-lg shadow-emerald-900/30 transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        {action.label}
      </button>
    ))}
  </div>
);

export const ErrorState: React.FC<{ title?: string; message: string; onRetry?: () => void }> = ({
  title = 'Something went wrong',
  message,
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl
                  bg-rose-950/20 ring-1 ring-rose-900/40">
    <h3 className="text-base font-bold text-white font-heading">{title}</h3>
    <p className="mt-1.5 text-sm text-slate-400 max-w-sm leading-relaxed">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-white transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
      >
        Try again
      </button>
    )}
  </div>
);
