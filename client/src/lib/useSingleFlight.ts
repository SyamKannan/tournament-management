import { useCallback, useRef, useState } from 'react';

/**
 * Run an action at most once at a time.
 *
 * A disabled button is not enough on its own: React applies `disabled` on the
 * next render, and a double tap on a slow phone lands both taps before that
 * render happens — two deliveries recorded for one "4", two bids for one
 * press. The ref here is set synchronously on the first tap, so the second is
 * dropped no matter how quickly it follows. `busy` is for drawing the state.
 */
export function useSingleFlight() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { run, busy };
}
