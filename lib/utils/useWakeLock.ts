'use client';

import { useEffect } from 'react';

/**
 * Keeps the phone's screen on while `active` (a request is counting down, or a bed is held for
 * the ambulance), so it doesn't lock in the middle of the 2 minutes. Browsers drop the lock
 * when the tab is hidden, so it is taken again when the page is back. Does nothing where the
 * Screen Wake Lock API is missing.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    const take = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) void next.release();
        else lock = next;
      } catch {
        // Battery saver or not allowed: the screen may still lock on its own
      }
    };

    void take();
    document.addEventListener('visibilitychange', take);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', take);
      if (lock && !lock.released) void lock.release().catch(() => {});
    };
  }, [active]);
}
