"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FOLLOW_SUMMARY_OVER,
  followEvents,
  followSignature,
  type FollowEvent,
  type FollowSnap,
} from "@/lib/live/follow-core";

/** Jak dlouho hlášení visí (ms). */
export const FOLLOW_TOAST_MS = { split: 7000, fin: 9000, final: 9000, summary: 9000, info: 5000 };
/** Najednou nejvýš tolik hlášení (mobil ukazuje jen nejnovější). */
const MAX_TOASTS = 3;

export type FollowToast =
  | ({ id: number; until: number } & FollowEvent)
  | { id: number; until: number; kind: "summary"; events: FollowEvent[] }
  | { id: number; until: number; kind: "info"; title: string; sub: string };

type State = {
  sig: string | null;
  prev: ReadonlyMap<number, FollowSnap> | null;
  toasts: FollowToast[];
  nextId: number;
};

/**
 * Hlášení sledovaných běžců (#206): porovnání stavu sledovaných mezi dvěma rendery (data chodí
 * každých 5 s, „teď“ tiká po sekundě). Bez hlášení při prvním načtení i u právě přidaného
 * běžce; víc než {@link FOLLOW_SUMMARY_OVER} událostí naráz → jedno souhrnné. Systémová
 * notifikace jen když je stránka viditelná, ale okno nemá fokus, a uživatel ji zapnul (Q168).
 */
export function useFollowAlerts({
  snaps,
  nowMs,
  freeze,
  notify,
  describe,
}: {
  snaps: ReadonlyMap<number, FollowSnap>;
  nowMs: number;
  /** Hlášení nemizí (jen pro snímky obrazovky, `?ffreeze=1`). */
  freeze: boolean;
  notify: boolean;
  /** Titulek + text systémové notifikace pro hlášení. */
  describe: (toast: FollowToast) => { title: string; body: string } | null;
}) {
  const [st, setSt] = useState<State>({ sig: null, prev: null, toasts: [], nextId: 1 });
  const sig = followSignature(snaps);
  if (sig !== st.sig) {
    const events = followEvents(st.prev, snaps);
    let nextId = st.nextId;
    const fresh: FollowToast[] =
      events.length > FOLLOW_SUMMARY_OVER
        ? [{ id: nextId++, until: nowMs + FOLLOW_TOAST_MS.summary, kind: "summary", events }]
        : events.map((e) => ({ ...e, id: nextId++, until: nowMs + FOLLOW_TOAST_MS[e.kind] }));
    setSt({
      sig,
      prev: snaps,
      nextId,
      toasts: [...fresh.reverse(), ...st.toasts.filter((x) => freeze || x.until > nowMs)].slice(
        0,
        MAX_TOASTS,
      ),
    });
  }

  const info = useCallback(
    (title: string, sub: string) =>
      setSt((s) => ({
        ...s,
        nextId: s.nextId + 1,
        toasts: [
          { id: s.nextId, until: nowMs + FOLLOW_TOAST_MS.info, kind: "info" as const, title, sub },
          ...s.toasts,
        ].slice(0, MAX_TOASTS),
      })),
    [nowMs],
  );
  const dismiss = useCallback(
    (id: number) => setSt((s) => ({ ...s, toasts: s.toasts.filter((x) => x.id !== id) })),
    [],
  );

  const notified = useRef(new Set<number>());
  useEffect(() => {
    for (const toast of st.toasts) {
      if (notified.current.has(toast.id)) continue;
      notified.current.add(toast.id);
      if (toast.kind === "info" || !notify) continue;
      if (document.visibilityState !== "visible" || document.hasFocus()) continue;
      if (!("Notification" in window) || Notification.permission !== "granted") continue;
      const text = describe(toast);
      if (text) new Notification(text.title, { body: text.body, tag: `mcvv-${toast.id}` });
    }
  }, [st.toasts, notify, describe]);

  const toasts = freeze ? st.toasts : st.toasts.filter((x) => x.until > nowMs);
  return { toasts, info, dismiss };
}
