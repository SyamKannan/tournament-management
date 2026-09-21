import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keep a form's progress on this device until it is submitted.
 *
 * A captain filling in fifteen players on a phone gets a call, the browser
 * drops the tab, and every name was lost — the wizard started again at step
 * one. The draft is written as they type and read back when the page opens.
 *
 * - `key` should identify the form *and* its target (a registration token), so
 *   two tournaments never share a draft.
 * - Drafts expire (`maxAgeMs`) so a half-finished form from last season does
 *   not greet anyone.
 * - `clear()` on success. `restored` says a draft was loaded, so the page can
 *   say so and offer to start over.
 *
 * Storage can be unavailable (private mode, blocked site data); everything
 * degrades to plain in-memory state.
 */
export function useDraft<T extends object>(key: string | null, maxAgeMs = 7 * 24 * 3600 * 1000) {
  const storageKey = key ? `kickwick_draft:${key}` : null;

  const readDraft = useCallback((): T | null => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { savedAt: number; value: T };
      if (!parsed || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > maxAgeMs) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return parsed.value;
    } catch {
      return null;
    }
  }, [storageKey, maxAgeMs]);

  const [initial] = useState<T | null>(() => readDraft());
  const [restored, setRestored] = useState<boolean>(() => initial !== null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Debounced so typing a name is not a storage write per keystroke. */
  const save = useCallback((value: T) => {
    if (!storageKey) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), value }));
      } catch {
        // Full or blocked storage: the form still works, just without a draft.
      }
    }, 400);
  }, [storageKey]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRestored(false);
    if (!storageKey) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nothing to clean up.
    }
  }, [storageKey]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { initial, restored, save, clear, dismissRestored: () => setRestored(false) };
}

/**
 * Ask before leaving while `when` is true — a closed tab, a refresh or a typed
 * URL. (In-app navigation is left alone; the draft already covers it.)
 */
export function useLeaveWarning(when: boolean) {
  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by some browsers to show the prompt; the text is not shown.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);
}
