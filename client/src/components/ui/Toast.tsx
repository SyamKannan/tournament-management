import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  description?: string;
}

interface ToastApi {
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

/**
 * Non-blocking notifications, replacing native `alert()`.
 *
 * Errors stay on screen longer than confirmations, since they usually carry
 * something the user has to read and act on.
 */
const DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 7000,
};

const TONE_STYLES: Record<ToastTone, { icon: typeof CheckCircle2; ring: string; iconColor: string; bar: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-emerald-500/30', iconColor: 'text-emerald-400', bar: 'bg-emerald-400' },
  error: { icon: XCircle, ring: 'ring-rose-500/30', iconColor: 'text-rose-400', bar: 'bg-rose-400' },
  warning: { icon: AlertTriangle, ring: 'ring-amber-500/30', iconColor: 'text-amber-400', bar: 'bg-amber-400' },
  info: { icon: Info, ring: 'ring-cyan-500/30', iconColor: 'text-cyan-400', bar: 'bg-cyan-400' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: string, description?: string) => {
    const id = nextId.current++;
    // Cap the stack so a burst of failures cannot bury the page.
    setToasts(current => [...current.slice(-3), { id, tone, message, description }]);
    window.setTimeout(() => dismiss(id), DURATION[tone]);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (message, description) => push('success', message, description),
    error: (message, description) => push('error', message, description),
    warning: (message, description) => push('warning', message, description),
    info: (message, description) => push('info', message, description),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 z-[100] flex flex-col gap-2 p-3 sm:p-0 sm:w-[380px] pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map(toast => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastCard: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const { icon: Icon, ring, iconColor, bar } = TONE_STYLES[toast.tone];

  return (
    <div
      // Errors interrupt; everything else is announced politely.
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      className={`pointer-events-auto relative overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-xl
                  ring-1 ${ring} shadow-2xl shadow-black/50 animate-toast-in`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden="true" />
      <div className="flex items-start gap-3 p-4 pl-5">
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-snug break-words">{toast.message}</p>
          {toast.description && (
            <p className="mt-1 text-xs text-slate-400 leading-relaxed break-words">{toast.description}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export function useToast(): ToastApi {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }

  return context;
}

/**
 * Turns an API rejection into readable toast text. ApiError carries the
 * server's message; anything else falls back to the supplied wording.
 */
export function useErrorToast() {
  const toast = useToast();

  return useCallback((error: unknown, fallback: string) => {
    const message = error instanceof Error && error.message ? error.message : fallback;
    toast.error(message);
  }, [toast]);
}

/** Dismiss the newest toast on Escape, for keyboard users. */
export function useToastEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);
}
