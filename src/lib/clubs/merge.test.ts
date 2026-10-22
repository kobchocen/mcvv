import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clubPair, planClubMerge, type ClubYearRow } from "./merge";

const row = (year: number, name: string): ClubYearRow => ({
  year,
  name,
  created: null,
  author: null,
});

// ICT exists 1999–2020, 167 only in 2017 and 425 only in 2020 (both collide with ICT).
const ICT = [1999, 2017, 2018, 2020].map((year) => row(year, "Iscarex Česká Třebová"));

describe("planClubMerge", () => {
  it("collision years keep the main id's row, the merged row is dropped", () => {
    assert.deepEqual(
      planClubMerge({
        mainId: "ict",
        otherId: "167",
        mainRows: ICT,
        otherRows: [row(2017, "Iscarex Č.Třebová")],
        rowYears: [2017],
      }),
      {
        ok: true,
        mainId: "ICT",
        otherId: "167",
        moveYears: [],
        dropYears: [2017],
        createYears: [],
      },
    );
  });

  it("years only the merged id has move to the main id with their own name", () => {
    const plan = planClubMerge({
      mainId: "CHC",
      otherId: "216",
      mainRows: [row(2017, "K.O.B. Choceň"), row(2018, "K.O.B. Choceň")],
      otherRows: [row(2018, "KOB Choceń"), row(2019, "KOB Choceń"), row(2020, "KOB Choceń")],
      rowYears: [2018, 2019, 2020],
    });
    assert.ok(plan.ok);
    assert.deepEqual(plan.moveYears, [2019, 2020]);
    assert.deepEqual(plan.dropYears, [2018]);
    assert.deepEqual(plan.createYears, []);
  });

  it("legacy rows without any codebook row get a main id row with its newest name", () => {
    const plan = planClubMerge({
      mainId: "CHC",
      otherId: "CBM",
      mainRows: [row(2010, "KOB Choceň"), row(2017, "K.O.B. Choceň ")],
      otherRows: [row(2011, "Chocománie")],
      rowYears: [2011, 2012, 2012, 2014],
    });
    assert.ok(plan.ok);
    assert.deepEqual(plan.moveYears, [2011]);
    assert.deepEqual(plan.createYears, [
      { year: 2012, name: "K.O.B. Choceň" },
      { year: 2014, name: "K.O.B. Choceň" },
    ]);
  });

  it("refuses same, empty, no-club and unknown ids", () => {
    const base = { mainRows: ICT, otherRows: [row(2017, "x")], rowYears: [] };
    const err = (mainId: string, otherId: string, extra = {}) =>
      planClubMerge({ ...base, mainId, otherId, ...extra });
    assert.deepEqual(err("ICT", "ict"), { ok: false, error: "same" });
    assert.deepEqual(err("", "216"), { ok: false, error: "empty" });
    assert.deepEqual(err("000", "216"), { ok: false, error: "no_club" });
    assert.deepEqual(err("ICT", "000"), { ok: false, error: "no_club" });
    assert.deepEqual(err("ICT", "167", { mainRows: [] }), { ok: false, error: "unknown_main" });
    assert.deepEqual(err("ICT", "167", { otherRows: [] }), { ok: false, error: "unknown_other" });
  });
});

describe("clubPair", () => {
  it("is order independent", () => {
    assert.deepEqual(clubPair("chc", "216"), ["216", "CHC"]);
    assert.deepEqual(clubPair("216", "CHC"), ["216", "CHC"]);
  });
});
