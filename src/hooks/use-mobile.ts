import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", onStoreChange);

    return () => mql.removeEventListener("change", onStoreChange);
  }, []);

  const getSnapshot = React.useCallback(() => {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }, []);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Dotykové zařízení: máme vlastní číselník, systémovou klávesnici nechceme. */
export const COARSE_POINTER_QUERY = "(pointer: coarse)";

export function useCoarsePointer() {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(COARSE_POINTER_QUERY);
    mql.addEventListener("change", onStoreChange);

    return () => mql.removeEventListener("change", onStoreChange);
  }, []);

  const getSnapshot = React.useCallback(() => {
    return window.matchMedia(COARSE_POINTER_QUERY).matches;
  }, []);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
