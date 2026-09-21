import { useEffect, useState } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (type: 'release', listener: () => void) => void };

/**
 * Keep the screen on while `active`.
 *
 * The stadium scoreboard, the auction TV and the scorer's phone all sit on a
 * screen nobody touches for minutes at a time, and they went black mid-match.
 * A wake lock is released by the browser whenever the tab is hidden, so it is
 * taken again each time the page comes back into view.
 *
 * Returns whether the lock is held, and whether this browser can hold one at
 * all — so a screen can tell the operator to turn auto-lock off instead.
 */
export function useWakeLock(active = true): { held: boolean; supported: boolean } {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !supported) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const next = await (navigator as any).wakeLock.request('screen') as WakeLockSentinelLike;
        if (cancelled) {
          await next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setHeld(true);
        next.addEventListener?.('release', () => {
          if (sentinel === next) {
            sentinel = null;
            setHeld(false);
          }
        });
      } catch {
        // Refused: battery saver, or no user gesture yet. Tried again on the
        // next visibility change or tap.
        setHeld(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) acquire();
    };

    // Some browsers only grant a wake lock after the user has interacted
    // with the page, so the first tap anywhere retries.
    const onInteract = () => {
      if (!sentinel) acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onInteract);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onInteract);
      sentinel?.release().catch(() => undefined);
      sentinel = null;
      setHeld(false);
    };
  }, [active, supported]);

  return { held, supported };
}
