import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};

/**
 * False during the server render and the first browser render, true after hydration. Use it to
 * show time-dependent text only once the page runs in the browser (no hydration mismatch).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
}
