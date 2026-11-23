import assert from "node:assert/strict";
import { test } from "node:test";

import { isHistoricalTeamYear, leadMargin, formatCountedList } from "./format";
import type { TeamStanding } from "./scoring";

function standing(
  partial: Pick<TeamStanding, "rank" | "team" | "points" | "finishers">,
): TeamStanding {
  return { ...partial, counted: [], classified: partial.rank != null };
}

test("years before 2026 are historical back-calculations", () => {
  assert.equal(isHistoricalTeamYear(2025), true);
  assert.equal(isHistoricalTeamYear(2026), false);
});

test("leadMargin reports a points lead", () => {
  const margin = leadMargin([
    standing({ rank: 1, team: "Alfa", points: 50, finishers: 7 }),
    standing({ rank: 2, team: "Beta", points: 40, finishers: 10 }),
  ]);
  assert.deepEqual(margin, {
    kind: "points",
    leader: "Alfa",
    points: 50,
    finishers: 7,
    second: "Beta",
    lead: 10,
  });
});

test("leadMargin uses places when points are tied (2025-style)", () => {
  const margin = leadMargin([
    standing({ rank: 1, team: "TJ Nové Město na Moravě", points: 42, finishers: 6 }),
    standing({ rank: 2, team: "K.O.B. Choceň", points: 42, finishers: 30 }),
  ]);
  assert.ok(margin && margin.kind === "places");
  if (margin.kind === "places") {
    assert.equal(margin.second, "K.O.B. Choceň");
    assert.equal(margin.lead, 0);
  }
});

test("leadMargin marks a shared first place", () => {
  const margin = leadMargin([
    standing({ rank: 1, team: "Alfa", points: 8, finishers: 10 }),
    standing({ rank: 1, team: "Beta", points: 8, finishers: 9 }),
    standing({ rank: 3, team: "Gama", points: 4, finishers: 3 }),
  ]);
  assert.ok(margin && margin.kind === "places");
  if (margin.kind === "places") assert.equal(margin.second, "Beta");
});

test("formatCountedList matches the mockup style", () => {
  assert.equal(
    formatCountedList([
      {
        place: 1,
        categoryId: "F",
        categoryName: "ženy",
        runnerName: "Šaclová Lucie",
        points: 20,
      },
      {
        place: 2,
        categoryId: "J",
        categoryName: "žáci",
        runnerName: "Houdek Jiří",
        points: 8,
      },
    ]),
    "1. ženy Šaclová Lucie (20); 2. žáci Houdek Jiří (8)",
  );
});
