"use client";

import { useState } from "react";

import {
  emptyTracker,
  expireAlerts,
  trackLeaders,
  type LeaderAlert,
  type LeaderTracker,
} from "@/lib/live/leader-core";
import type { PointKey, SpeakerRunner } from "@/lib/live/speaker-core";

type State = {
  runners: readonly SpeakerRunner[];
  contact: number;
  key: string;
  tracker: LeaderTracker;
};

/**
 * Upozornění „nový lídr“ (speaker i resultboard): porovnává po sobě jdoucí snímky přímo
 * v prohlížeči (Q133). `updatedMs` = poslední úspěšný kontakt se serverem (i 304) – mezera
 * delší než minuta (výpadek, uspaná záložka) jen nastaví nový výchozí stav. `resetKey`
 * (ročník, test, sledované body) při změně taky jen nastaví výchozí stav.
 *
 * Stav se odvozuje během renderu (žádné efekty) – na stejný snímek vždy stejný výsledek.
 */
export function useLeaderAlerts(input: {
  runners: readonly SpeakerRunner[];
  updatedMs: number;
  nowMs: number;
  resetKey: string;
  points: readonly PointKey[];
  enabled: boolean;
}): ReadonlyMap<string, LeaderAlert> {
  const { runners, updatedMs, nowMs, resetKey, points, enabled } = input;
  const [state, setState] = useState<State>(() => ({
    runners,
    contact: updatedMs,
    key: resetKey,
    tracker: trackLeaders(emptyTracker(), runners, updatedMs, points).tracker,
  }));

  let current = state;
  if (state.runners !== runners || state.contact !== updatedMs || state.key !== resetKey) {
    const reset = state.key !== resetKey;
    let tracker = reset ? emptyTracker() : state.tracker;
    if (reset || state.runners !== runners) {
      tracker = trackLeaders(
        { ...tracker, seenMs: state.contact },
        runners,
        updatedMs,
        points,
      ).tracker;
    }
    current = { runners, contact: updatedMs, key: resetKey, tracker };
    setState(current);
  }

  if (!enabled) return EMPTY;
  return expireAlerts(current.tracker.alerts, nowMs);
}

const EMPTY: ReadonlyMap<string, LeaderAlert> = new Map();
