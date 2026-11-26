import assert from "node:assert/strict";
import { test } from "node:test";

import { computeTeamCompetition } from "./scoring";
import { emptyTeamAlertTracker, trackTeamLeaders } from "./live-alerts";

function finishers(rows: { cat: string; place: number; name: string; team: string }[]) {
  return computeTeamCompetition(
    rows.map((row) => ({
      categoryId: row.cat,
      categoryName: row.cat,
      place: row.place,
      runnerName: row.name,
      clubId: row.team,
      clubName: row.team,
    })),
  );
}

test("a finish that takes the lead raises a new-leader alert", () => {
  const before = finishers([
    { cat: "J", place: 1, name: "A1", team: "Alfa" },
    { cat: "K", place: 2, name: "A2", team: "Alfa" },
    { cat: "L", place: 3, name: "A3", team: "Alfa" },
    { cat: "A", place: 2, name: "B1", team: "Beta" },
    { cat: "C", place: 5, name: "B2", team: "Beta" },
  ]);
  // Beta still unclassified (2 finishers)
  assert.equal(before.official[0]?.team, "Alfa");
  const after = finishers([
    { cat: "J", place: 1, name: "A1", team: "Alfa" },
    { cat: "K", place: 2, name: "A2", team: "Alfa" },
    { cat: "L", place: 3, name: "A3", team: "Alfa" },
    { cat: "A", place: 1, name: "B1", team: "Beta" },
    { cat: "C", place: 5, name: "B2", team: "Beta" },
    { cat: "F", place: 3, name: "B3", team: "Beta" },
  ]);
  let tracker = emptyTeamAlertTracker();
  tracker = trackTeamLeaders(tracker, before, 1_000);
  tracker = trackTeamLeaders(tracker, after, 2_000);
  assert.equal(tracker.alert?.kind, "new");
  assert.equal(tracker.alert?.team, after.official[0]?.team);
});

test("a later finish for the same leader is a held-lead alert", () => {
  const first = finishers([
    { cat: "J", place: 1, name: "A1", team: "Alfa" },
    { cat: "K", place: 1, name: "A2", team: "Alfa" },
    { cat: "L", place: 5, name: "A3", team: "Alfa" },
  ]);
  const second = finishers([
    { cat: "J", place: 1, name: "A1", team: "Alfa" },
    { cat: "K", place: 1, name: "A2", team: "Alfa" },
    { cat: "L", place: 5, name: "A3", team: "Alfa" },
    { cat: "B", place: 3, name: "A4", team: "Alfa" },
  ]);
  let tracker = emptyTeamAlertTracker();
  tracker = trackTeamLeaders(tracker, first, 1_000);
  tracker = trackTeamLeaders(tracker, second, 2_000);
  assert.equal(tracker.alert?.kind, "held");
  assert.equal(tracker.alert?.runnerName, "A4");
});
