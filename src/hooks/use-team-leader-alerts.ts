"use client";

import { useState } from "react";

import { liveTeamCompetition, type LiveTeamSource } from "@/lib/teams/live";
import {
  emptyTeamAlertTracker,
  expireTeamAlert,
  trackTeamLeaders,
  type TeamAlertTracker,
  type TeamLeaderAlert,
} from "@/lib/teams/live-alerts";

type State = {
  source: LiveTeamSource;
  contact: number;
  key: string;
  tracker: TeamAlertTracker;
};

export function useTeamLeaderAlerts(input: {
  source: LiveTeamSource;
  updatedMs: number;
  nowMs: number;
  resetKey: string;
  enabled: boolean;
}): TeamLeaderAlert | null {
  const { source, updatedMs, nowMs, resetKey, enabled } = input;
  const [state, setState] = useState<State>(() => ({
    source,
    contact: updatedMs,
    key: resetKey,
    tracker: trackTeamLeaders(emptyTeamAlertTracker(), liveTeamCompetition(source), updatedMs),
  }));

  let current = state;
  if (state.source !== source || state.contact !== updatedMs || state.key !== resetKey) {
    const reset = state.key !== resetKey;
    let tracker = reset ? emptyTeamAlertTracker() : state.tracker;
    if (reset || state.source !== source) {
      tracker = trackTeamLeaders(
        { ...tracker, seenMs: state.contact },
        liveTeamCompetition(source),
        updatedMs,
      );
    }
    current = { source, contact: updatedMs, key: resetKey, tracker };
    setState(current);
  }

  if (!enabled) return null;
  return expireTeamAlert(current.tracker.alert, nowMs);
}
