import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClubResolver, type ClubNameRow } from "./core";
import {
  computeClubInsights,
  isClubListQuery,
  longestStreak,
  veteranThreshold,
  type ClubInsightInput,
} from "./insights";

describe("veteranThreshold / longestStreak / isClubListQuery", () => {
  it("treats veterans as more starts than half of the editions with results", () => {
    assert.equal(veteranThreshold(33), 17);
    assert.equal(veteranThreshold(32), 17);
    assert.equal(veteranThreshold(2), 2);
  });

  it("finds the longest consecutive run of years", () => {
    assert.deepEqual(longestStreak([1993, 1994, 1995]), { length: 3, from: 1993, to: 1995 });
    assert.deepEqual(longestStreak([1998, 2000, 2001, 2002, 2005]), {
      length: 3,
      from: 2000,
      to: 2002,
    });
    assert.deepEqual(longestStreak([2015]), { length: 1, from: 2015, to: 2015 });
    assert.deepEqual(longestStreak([]), { length: 0, from: 0, to: 0 });
  });

  it("detects legacy list query parameters on /kluby", () => {
    assert.equal(isClubListQuery({}), false);
    assert.equal(isClubListQuery({ q: "  " }), false);
    assert.equal(isClubListQuery({ q: "chocen" }), true);
    assert.equal(isClubListQuery({ razeni: "nazev" }), true);
    assert.equal(isClubListQuery({ strana: "2" }), true);
  });
});

const NAMES: ClubNameRow[] = [
  { id: "CHC", year: 2020, name: "K.O.B. Choceň" },
  { id: "CHC", year: 2021, name: "K.O.B. Choceň" },
  { id: "CHC", year: 2022, name: "K.O.B. Choceň" },
  { id: "TNM", year: 2020, name: "TJ Nové Město" },
  { id: "TNM", year: 2022, name: "TJ Nové Město" },
  { id: "000", year: 2022, name: "-" },
];

function row(
  year: number,
  runnerId: string,
  clubId: string,
  clubName: string,
  time: number,
  categoryId: string,
  runnerName?: string,
): ClubInsightInput {
  return { year, runnerId, runnerName, clubId, clubName, time, categoryId };
}

describe("computeClubInsights", () => {
  const resolver = createClubResolver({ names: NAMES });

  it("counts streaks, gaps, category medals by sex and primary veterans", () => {
    const rows: ClubInsightInput[] = [
      // 2020: CHC man wins A, TNM woman wins F, TNM man second in A
      row(2020, "19800001", "CHC", "K.O.B. Choceň", 900, "A", "Adam"),
      row(2020, "19810002", "TNM", "TJ Nové Město", 950, "A", "Bedřich"),
      row(2020, "19855001", "TNM", "TJ Nové Město", 1000, "F", "Cecílie"),
      // 2021: only CHC (TNM has a gap)
      row(2021, "19800001", "CHC", "K.O.B. Choceň", 910, "A", "Adam"),
      // 2022: both back; unlinked placeholder; CHC woman wins F
      row(2022, "19800001", "CHC", "K.O.B. Choceň", 890, "A", "Adam"),
      row(2022, "19855002", "CHC", "K.O.B. Choceň", 1100, "F", "Dana"),
      row(2022, "19810002", "TNM", "TJ Nové Město", 960, "A", "Bedřich"),
      row(2022, "19900003", "000", "-", 1200, "A", "Eva"),
    ];

    const data = computeClubInsights(rows, resolver, { efficiencyMinStarts: 2 });
    assert.equal(data.finishers, 8);
    assert.equal(data.unlinkedStarts, 1);
    assert.equal(data.clubs, 2);
    assert.equal(data.editions, 3);
    assert.equal(data.firstYear, 2020);
    assert.equal(data.lastYear, 2022);
    assert.equal(data.nextYear, 2023);
    assert.equal(data.veteranThreshold, 2);

    const chc = data.streaks.find((row) => row.id === "CHC");
    const tnm = data.loyal.find((row) => row.id === "TNM");
    assert.equal(chc?.length, 3);
    assert.equal(chc?.from, 2020);
    assert.equal(chc?.to, 2022);
    assert.equal(tnm?.editions, 2);
    assert.equal(tnm?.missed, 1);
    assert.equal(tnm?.streak, 1);

    assert.equal(data.expeditions[0]?.id, "CHC");
    assert.equal(data.expeditions[0]?.size, 2);
    assert.equal(data.expeditions[0]?.year, 2022);

    assert.equal(data.returns.length, 1);
    assert.equal(data.returns[0]?.id, "TNM");
    assert.equal(data.returns[0]?.gap, 1);
    assert.equal(data.returns[0]?.lastBefore, 2020);

    const chcMedals = data.medals.find((row) => row.id === "CHC")!;
    const tnmMedals = data.medals.find((row) => row.id === "TNM")!;
    // CHC: Adam 1st in A in 2020 and 2021 (2022 Adam also 1st in A), Dana 1st in F 2022
    assert.equal(chcMedals.winsM, 3);
    assert.equal(chcMedals.winsF, 1);
    assert.equal(chcMedals.wins, 4);
    // TNM: Cecílie 1st F 2020; Bedřich 2nd A 2020 and 2022 (podia only)
    assert.equal(tnmMedals.winsF, 1);
    assert.equal(tnmMedals.winsM, 0);
    assert.equal(tnmMedals.podiumsM, 2);
    assert.equal(tnmMedals.podiumsF, 1);

    // Adam has 3 starts and Bedřich 2 (threshold 2); primary clubs CHC and TNM
    assert.equal(data.veteranCount, 2);
    assert.deepEqual(
      data.veterans.map((row) => [row.id, row.count, row.examples[0]?.name]),
      [
        ["CHC", 1, "Adam"],
        ["TNM", 1, "Bedřich"],
      ],
    );

    const small = data.efficiency.find((row) => row.id === "TNM");
    assert.ok(small);
    assert.equal(small?.wins, 1);
    assert.equal(small?.starts, 3);
  });

  it("does not treat a first-year club as a return", () => {
    const rows = [
      row(2021, "19800001", "CHC", "K.O.B. Choceň", 900, "A"),
      row(2022, "19800001", "CHC", "K.O.B. Choceň", 900, "A"),
      row(2022, "19700001", "TNM", "TJ Nové Město", 910, "A"),
    ];
    const data = computeClubInsights(rows, resolver);
    assert.equal(data.newcomersLatestCount, 1);
    assert.equal(data.newcomers[0]?.id, "TNM");
    assert.equal(data.returns.length, 0);
  });
});
