import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for destructive actions — anything that deletes or cannot be undone. */
  tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Styled replacement for `window.confirm`, so destructive actions read as part
 * of the product rather than as a browser interruption.
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(options => (
    new Promise<boolean>(resolve => setPending({ ...options, resolve }))
  ), []);

  const settle = useCallback((confirmed: boolean) => {
    setPending(current => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmModal options={pending} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
};

const ConfirmModal: React.FC<{ options: PendingConfirm; onSettle: (confirmed: boolean) => void }> = ({ options, onSettle }) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = options.tone === 'danger';

  useEffect(() => {
    confirmRef.current?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSettle(false);
      if (event.key === 'Enter') onSettle(true);
    };

    window.addEventListener('keydown', handler);
    // Stop the page behind the dialog from scrolling while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [onSettle]);

  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
        onClick={() => onSettle(false)}
        aria-hidden="true"
      />

      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-slate-900 ring-1 ring-slate-700/70
                      shadow-2xl shadow-black/60 p-5 sm:p-6 max-h-[92dvh] overflow-y-auto animate-dialog-in">
        <div className="flex items-start gap-4">
          <div className={`shrink-0 w-11 h-11 rounded-xl grid place-items-center ring-1 ${
            danger ? 'bg-rose-500/10 ring-rose-500/30' : 'bg-cyan-500/10 ring-cyan-500/30'
          }`}>
            <Icon className={`w-5 h-5 ${danger ? 'text-rose-400' : 'text-cyan-400'}`} aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-bold text-white leading-snug font-heading">
              {options.title}
            </h2>
            {options.message && (
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{options.message}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            onClick={() => onSettle(false)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 transition-colors"
          >
            {options.cancelLabel || 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onSettle(true)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-colors
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
              danger
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/40 focus-visible:ring-rose-400'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40 focus-visible:ring-emerald-400'
            }`}
          >
            {options.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error('useConfirm must be used inside a ConfirmProvider');
  }

  return context;
}
