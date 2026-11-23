import { LEADER_HOLD_MS } from "@/lib/live/leader-core";

import { leadMargin, type LeadMargin } from "./format";
import type { TeamCompetition } from "./scoring";

export type TeamLeaderAlert = {
  kind: "new" | "held" | "moved";
  runnerName: string;
  team: string;
  rank: number;
  margin: LeadMargin | null;
  until: number;
};

export type TeamAlertTracker = {
  previous: TeamCompetition | null;
  seenMs: number;
  alert: TeamLeaderAlert | null;
};

export const emptyTeamAlertTracker = (): TeamAlertTracker => ({
  previous: null,
  seenMs: 0,
  alert: null,
});

export type LiveFinish = {
  runnerName: string;
  team: string;
  clubId: string;
};

function finisherKey(clubId: string, runnerName: string): string {
  return `${clubId}|${runnerName}`;
}

/** Finishers present in `next` but not in `prev` (by runner name + club id). */
export function newFinishers(prev: TeamCompetition | null, next: TeamCompetition): LiveFinish[] {
  const seen = new Set<string>();
  if (prev) {
    for (const row of [...prev.official, ...prev.unclassified]) {
      for (const item of row.counted) seen.add(finisherKey(row.clubId, item.runnerName));
    }
  }
  const added: LiveFinish[] = [];
  for (const row of [...next.official, ...next.unclassified]) {
    for (const item of row.counted) {
      const key = finisherKey(row.clubId, item.runnerName);
      if (!seen.has(key)) {
        added.push({ runnerName: item.runnerName, team: row.team, clubId: row.clubId });
      }
    }
  }
  return added;
}

export function trackTeamLeaders(
  tracker: TeamAlertTracker,
  next: TeamCompetition,
  nowMs: number,
): TeamAlertTracker {
  const alert =
    nowMs - tracker.seenMs > 60_000 || tracker.previous == null
      ? tracker.alert && tracker.alert.until > nowMs
        ? tracker.alert
        : null
      : (detectTeamAlert(tracker.previous, next, nowMs) ??
        (tracker.alert && tracker.alert.until > nowMs ? tracker.alert : null));

  return { previous: next, seenMs: nowMs, alert };
}

function detectTeamAlert(
  prev: TeamCompetition,
  next: TeamCompetition,
  nowMs: number,
): TeamLeaderAlert | null {
  const added = newFinishers(prev, next);
  if (added.length === 0) return null;
  const prevLeader = prev.official[0];
  const nextLeader = next.official[0];
  if (!nextLeader || nextLeader.rank == null) return null;
  const margin = leadMargin(next.official);
  const until = nowMs + LEADER_HOLD_MS;

  if (!prevLeader || prevLeader.clubId !== nextLeader.clubId) {
    const runner =
      added.find((item) => item.clubId === nextLeader.clubId) ?? added[added.length - 1]!;
    return {
      kind: "new",
      runnerName: runner.runnerName,
      team: nextLeader.team,
      rank: nextLeader.rank,
      margin,
      until,
    };
  }

  const onLeader = added.find((item) => item.clubId === nextLeader.clubId);
  if (onLeader) {
    return {
      kind: "held",
      runnerName: onLeader.runnerName,
      team: nextLeader.team,
      rank: nextLeader.rank,
      margin,
      until,
    };
  }

  const mover = added[added.length - 1]!;
  const standing = next.official.find((row) => row.clubId === mover.clubId);
  if (!standing || standing.rank == null) return null;
  return {
    kind: "moved",
    runnerName: mover.runnerName,
    team: standing.team,
    rank: standing.rank,
    margin,
    until,
  };
}

export function expireTeamAlert(
  alert: TeamLeaderAlert | null,
  nowMs: number,
): TeamLeaderAlert | null {
  return alert && alert.until > nowMs ? alert : null;
}
