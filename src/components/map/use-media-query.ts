"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Breakpoint als externe Quelle statt als State: `useSyncExternalStore`
 * liefert den Wert schon beim ersten Render richtig, ohne den Umweg ueber
 * einen Effekt, der direkt danach wieder `setState` ruft.
 *
 * @param serverFallback Wert waehrend SSR und Hydration.
 */
export function useMediaQuery(query: string, serverFallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}
