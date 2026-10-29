"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  FOLLOW_LIMIT,
  FOLLOW_NOTIFY_KEY,
  followStorageKey,
  mergeFollow,
  parseFollowed,
  toggleFollow,
} from "@/lib/live/follow-core";

/** Změna v této záložce (`storage` chodí jen z jiných záložek). */
const CHANGE_EVENT = "mcvv-sledovani";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // soukromý režim
  }
}

/** Zápis + upozornění odběratelů v téže záložce. */
export function writeFollowStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // soukromý režim – nic se neuloží
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Sledovaní běžci (#206) – seznam čísel v `localStorage` per ročník, sdílený mezi záložkami.
 * Na serveru (a při hydrataci) prázdný seznam.
 */
export function useFollowed(year: number) {
  const key = followStorageKey(year);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const list = useMemo(() => parseFollowed(raw), [raw]);
  const notifyRaw = useSyncExternalStore(
    subscribe,
    () => read(FOLLOW_NOTIFY_KEY),
    () => null,
  );

  const save = useCallback(
    (next: readonly number[]) => writeFollowStorage(key, JSON.stringify(next)),
    [key],
  );
  /** Přepne sledování; `false` = seznam je plný a nic se nepřidalo. */
  const toggle = useCallback(
    (bib: number) => {
      const res = toggleFollow(parseFollowed(read(key)), bib);
      if (!res.full) save(res.list);
      return !res.full;
    },
    [key, save],
  );
  /** Sdílený výběr (`?f=`) – přidá se ke stávajícímu, do limitu. */
  const add = useCallback(
    (bibs: readonly number[]) => save(mergeFollow(parseFollowed(read(key)), bibs)),
    [key, save],
  );
  const setNotify = useCallback(
    (on: boolean) => writeFollowStorage(FOLLOW_NOTIFY_KEY, on ? "1" : "0"),
    [],
  );

  return { list, limit: FOLLOW_LIMIT, toggle, save, add, notify: notifyRaw === "1", setNotify };
}
