import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClubResolver, type ClubNameRow } from "./core";
import { computeClubYearResults, type EditionResultRow } from "./year-results";

const NAMES: ClubNameRow[] = [
  { id: "CHC", year: 2024, name: "KOB Choceň" },
  { id: "ACH", year: 2024, name: "AC Choceň" },
];

const row = (
  runnerId: string,
  time: number,
  categoryId: string,
  clubId: string,
  runnerName = runnerId,
): EditionResultRow => ({
  runnerId,
  runnerName,
  time,
  categoryId,
  categoryName: categoryId === "A" ? "Muži" : "Ženy",
  clubId,
  clubName: null,
});

describe("computeClubYearResults", () => {
  const edition = [
    row("19800001", 900, "A", "ACH"),
    row("19800002", 950, "A", "CHC", "Rychlý Petr"),
    row("19855001", 950, "B", "CHC", "Svižná Eva"),
    row("19800003", 1000, "A", "CHC"),
    row("19855002", 940, "B", "ACH"),
  ];
  const clubs = createClubResolver({ names: NAMES });

  it("keeps only the club, ranks from the whole edition, ties share a rank", () => {
    const rows = computeClubYearResults(edition, clubs, "CHC", 2024);
    assert.deepEqual(
      rows.map((r) => [r.name, r.rank, r.categoryName, r.categoryRank]),
      [
        ["Rychlý Petr", 3, "Muži", 2],
        ["Svižná Eva", 3, "Ženy", 2],
        ["19800003", 5, "Muži", 3],
      ],
    );
  });

  it("empty for a club without starts in the edition", () => {
    assert.deepEqual(computeClubYearResults(edition, clubs, "XYZ", 2024), []);
  });
});
