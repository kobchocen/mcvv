"use client";

import { useState } from "react";

import {
  badgesOf,
  cardsOf,
  emptyTrTracker,
  trackRecords,
  type TrCard,
  type TrMark,
  type TrTracker,
} from "@/lib/live/records-live-core";

/** Dávka nových karet; změna `seq` = přidat do fronty překryvu. */
export type TrBatch = { seq: number; cards: TrCard[] };

type State = {
  marks: readonly TrMark[];
  contact: number;
  key: string;
  tracker: TrTracker;
  batch: TrBatch | null;
};

/**
 * Nový traťový rekord (speaker, resultboard, online): porovná po sobě jdoucí snímky přímo
 * v prohlížeči, stejně jako „nový lídr“. První snímek, mezera ve spojení (uspaná záložka)
 * a zpětně dovezené doběhy překryv nespustí (Q164) – odznaky v tabulce ukážou vždy.
 * `demo` (parametr `?trdemo=1`) přehraje rekordy z prvního snímku – náhled pro pořadatele.
 */
export function useRecordAlerts(input: {
  marks: readonly TrMark[] | undefined;
  updatedMs: number;
  resetKey: string;
  demo?: boolean;
}): { badges: Map<number, "tr" | "eq">; batch: TrBatch | null } {
  const marks = input.marks ?? NONE;
  const { updatedMs, resetKey, demo } = input;
  const key = `${resetKey}|${demo ? "demo" : ""}`;
  const [state, setState] = useState<State>(() => ({
    marks,
    contact: updatedMs,
    key,
    tracker: trackRecords(emptyTrTracker(), marks, updatedMs).tracker,
    batch: null,
  }));

  let current = state;
  if (state.marks !== marks || state.contact !== updatedMs || state.key !== key) {
    const reset = state.key !== key;
    let tracker = reset ? emptyTrTracker() : state.tracker;
    let batch = state.batch;
    if (reset && demo && marks.length) {
      // náhled: rekordy z aktuálního snímku jako nové
      tracker = trackRecords(emptyTrTracker(), marks, updatedMs).tracker;
      batch = { seq: (batch?.seq ?? 0) + 1, cards: cardsOf(marks) };
    } else if (reset || state.marks !== marks) {
      const step = trackRecords({ ...tracker, seenMs: state.contact }, marks, updatedMs);
      tracker = step.tracker;
      if (step.cards.length) batch = { seq: (batch?.seq ?? 0) + 1, cards: step.cards };
    }
    current = { marks, contact: updatedMs, key, tracker, batch };
    setState(current);
  }
  return { badges: badgesOf(marks), batch: current.batch };
}

const NONE: readonly TrMark[] = [];
