import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Trophy, type LucideIcon } from 'lucide-react';

/** Shared building blocks for the login and registration screens. */

export type AuthAccent = 'emerald' | 'cyan' | 'amber';

const ACCENT_VARS: Record<AuthAccent, React.CSSProperties> = {
  emerald: {
    '--auth-accent': '#c8f535',
    '--auth-ring': 'rgba(200, 245, 53, 0.18)',
    '--auth-glow-a': 'rgba(200, 245, 53, 0.16)',
    '--auth-glow-b': 'rgba(56, 189, 248, 0.12)',
  } as React.CSSProperties,
  cyan: {
    '--auth-accent': '#38bdf8',
    '--auth-ring': 'rgba(56, 189, 248, 0.18)',
    '--auth-glow-a': 'rgba(56, 189, 248, 0.16)',
    '--auth-glow-b': 'rgba(59, 130, 246, 0.12)',
  } as React.CSSProperties,
  amber: {
    '--auth-accent': '#f59e0b',
    '--auth-ring': 'rgba(245, 158, 11, 0.18)',
    '--auth-glow-a': 'rgba(245, 158, 11, 0.14)',
    '--auth-glow-b': 'rgba(236, 72, 153, 0.10)',
  } as React.CSSProperties,
};

const BUTTON_GRADIENT: Record<AuthAccent, string> = {
  emerald: 'from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-emerald-500/25',
  cyan: 'from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-cyan-500/25',
  amber: 'from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 shadow-amber-500/25',
};

const TEXT_ACCENT: Record<AuthAccent, string> = {
  emerald: 'text-emerald-400',
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
};

/** Split layout: photo showcase on large screens, the form centred beside it. */
export const AuthLayout: React.FC<{
  showcase: React.ReactNode;
  accent: AuthAccent;
  /** Max width of the form column. */
  width?: 'sm' | 'lg';
  children: React.ReactNode;
}> = ({ showcase, accent, width = 'sm', children }) => (
  <div className="lg:flex">
    {showcase}
    <div
      className="auth-stage flex-1 min-w-0 min-h-[calc(100dvh-4rem)] flex items-start sm:items-center justify-center px-4 py-8 sm:px-6 sm:py-12 lg:px-10"
      style={ACCENT_VARS[accent]}
    >
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.21, 1.02, 0.73, 1] }}
        className={`w-full ${width === 'lg' ? 'max-w-2xl' : 'max-w-[26rem]'}`}
      >
        {children}
      </motion.div>
    </div>
  </div>
);

export const AuthHeader: React.FC<{
  accent: AuthAccent;
  icon?: LucideIcon;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}> = ({ accent, icon: Icon = Trophy, eyebrow, title, subtitle }) => (
  <div className="mb-6 sm:mb-8">
    <Link to="/" className="inline-flex items-center gap-2.5 mb-6 group" aria-label="KickWick home">
      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/[0.02] ring-1 ring-white/10 grid place-items-center group-hover:ring-white/20 transition">
        <Icon className={`w-5 h-5 ${TEXT_ACCENT[accent]}`} />
      </span>
      <span className="font-heading font-black text-lg text-white tracking-tight">KickWick</span>
    </Link>
    {eyebrow && (
      <p className={`text-[11px] font-bold uppercase tracking-[0.14em] mb-2 ${TEXT_ACCENT[accent]}`}>{eyebrow}</p>
    )}
    <h1 className="text-[1.75rem] sm:text-3xl leading-tight font-black font-heading text-white tracking-tight">
      {title}
    </h1>
    {subtitle && <p className="text-sm text-slate-400 mt-2 leading-relaxed">{subtitle}</p>}
  </div>
);

export const AuthCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`auth-card rounded-3xl p-5 sm:p-8 ${className}`}>{children}</div>
);

export const AuthAlert: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div role="alert" className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm flex items-start gap-2.5">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  ) : null;

/** Label + optional leading icon + optional trailing slot around any control. */
export const AuthField: React.FC<{
  label: string;
  htmlFor?: string;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, htmlFor, icon: Icon, hint, trailing, children }) => (
  <div className="min-w-0">
    <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-slate-300 mb-1.5">
      {label}
    </label>
    <div className="relative">
      {Icon && (
        <Icon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
      )}
      {children}
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
    {hint && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
  </div>
);

export const AuthSubmit: React.FC<{
  accent: AuthAccent;
  loading: boolean;
  loadingLabel?: string;
  children: React.ReactNode;
}> = ({ accent, loading, loadingLabel, children }) => (
  <button
    type="submit"
    disabled={loading}
    className={`w-full h-12 rounded-2xl bg-gradient-to-r ${BUTTON_GRADIENT[accent]} text-slate-950 font-extrabold text-[15px] shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed`}
  >
    {loading ? (
      <>
        <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        {loadingLabel && <span>{loadingLabel}</span>}
      </>
    ) : (
      <>
        {children}
        <ArrowRight className="w-4 h-4" />
      </>
    )}
  </button>
);

/** Numbered section heading inside a long registration form. */
export const AuthSection: React.FC<{ step: number; title: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  step,
  title,
  action,
  children,
}) => (
  <section className="pt-6 first:pt-0 border-t border-white/5 first:border-t-0">
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="flex items-center gap-2.5 text-sm font-bold text-white">
        <span className="w-6 h-6 rounded-lg bg-white/5 ring-1 ring-white/10 grid place-items-center text-xs font-black text-slate-300">
          {step}
        </span>
        {title}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

/** "Already have an account? Sign in" style footer links. */
export const AuthFooter: React.FC<{ links: { prompt: string; to: string; label: string }[] }> = ({ links }) => (
  <div className="mt-6 flex flex-col items-center gap-2 text-sm text-slate-400 text-center">
    {links.map(l => (
      <p key={l.to}>
        {l.prompt}{' '}
        <Link to={l.to} className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
          {l.label}
        </Link>
      </p>
    ))}
  </div>
);
