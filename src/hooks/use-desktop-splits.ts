import * as React from "react";

import { DESKTOP_SPLITS_QUERY } from "@/lib/live/splits-layout";

/**
 * Notebookové rozložení Mezičasů (#380): `min-width: 1200px` a jemný pointer.
 * Na serveru a při hydrataci je vždy false, aby mobilní klávesnice zůstala výchozí.
 */
export function useDesktopSplitsLayout() {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(DESKTOP_SPLITS_QUERY);
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  }, []);

  const getSnapshot = React.useCallback(() => {
    return window.matchMedia(DESKTOP_SPLITS_QUERY).matches;
  }, []);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
