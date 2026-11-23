import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClubResolver, type ClubNameRow } from "./core";
import edition2025 from "./fixtures/edition-2025.json";
import { computeClubYearResults, type EditionResultRow } from "./year-results";

const NAMES: ClubNameRow[] = [
  { id: "CHC", year: 2024, name: "KOB Choceň" },
  { id: "ACH", year: 2024, name: "AC Choceň" },
  { id: "TNM", year: 2025, name: "TJ Nové Město na Moravě" },
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
  // 900 ACH man, 940 ACH woman, 950 CHC man, 950 CHC woman (same time, different sex), 1000 CHC man.
  const edition = [
    row("19800001", 900, "A", "ACH"),
    row("19800002", 950, "A", "CHC", "Rychlý Petr"),
    row("19855001", 950, "B", "CHC", "Svižná Eva"),
    row("19800003", 1000, "A", "CHC"),
    row("19855002", 940, "B", "ACH"),
  ];
  const clubs = createClubResolver({ names: NAMES });

  it("keeps only the club, ranks within each sex from the whole edition, ties share a rank", () => {
    const rows = computeClubYearResults(edition, clubs, "CHC", 2024);
    assert.deepEqual(
      rows.map((r) => [r.name, r.sex, r.rank, r.categoryName, r.categoryRank]),
      [
        ["Rychlý Petr", "M", 2, "Muži", 2],
        ["Svižná Eva", "F", 2, "Ženy", 2],
        ["19800003", "M", 3, "Muži", 3],
      ],
    );
  });

  it("does not share an overall rank between a man and a woman with the same time", () => {
    const rows = computeClubYearResults(edition, clubs, "CHC", 2024);
    const petr = rows.find((r) => r.name === "Rychlý Petr");
    const eva = rows.find((r) => r.name === "Svižná Eva");
    assert.equal(petr?.time, eva?.time);
    assert.equal(petr?.rank, 2);
    assert.equal(eva?.rank, 2);
    assert.notEqual(petr?.sex, eva?.sex);
  });

  it("empty for a club without starts in the edition", () => {
    assert.deepEqual(computeClubYearResults(edition, clubs, "XYZ", 2024), []);
  });

  it("2025 Nové Město: overall rank is within the sex, not mixed across men and women", () => {
    const rows = computeClubYearResults(edition2025, clubs, "TNM", 2025);
    assert.deepEqual(
      rows.map((r) => [r.name, r.sex, r.rank, r.categoryName, r.categoryRank]),
      [
        ["Kabuďa Vladimír", "M", 12, "dorostenci", 2],
        ["Šacl Jiří", "M", 15, "muži", 12],
        ["Šaclová Lucie", "F", 1, "ženy", 1],
        ["Houdek Jiří", "M", 36, "žáci", 2],
        ["Kakačová Michaela", "F", 9, "dorostenky", 3],
        ["Straková Ema", "F", 12, "dorostenky", 5],
      ],
    );
  });
});
