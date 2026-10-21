import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startModelFromEdition } from "@/lib/race/start-time";
import type { PublicStartRow } from "@/lib/race/startlist-load";

import { bibRowsFromStartList, championBibList } from "./bib-start";
import { buildBibCard, sortBibRows, type BuildBibOptions } from "./bibs-core";

function startRow(bib: number, runnerId: string, name = runnerId): PublicStartRow {
  return {
    bib,
    time: "",
    runnerId,
    name,
    birthYear: runnerId.slice(0, 4),
    club: "Klub",
    categoryId: "C",
    categoryName: "Muži",
  };
}

describe("print adapter: start list → bib cards", () => {
  it("takes bibs, names and categories from the start list and joins the entry id", () => {
    const rows = bibRowsFromStartList(
      [startRow(41, "19800101", "Novák Jan"), startRow(0, "19900101"), startRow(602, "19700101")],
      new Map([["19800101", 12]]),
    );
    assert.deepEqual(rows, [
      { bib: 41, runnerId: "19800101", name: "Novák Jan", categoryId: "C", registrationId: 12 },
      // Běžec jen v mcvv_start (přihláška na místě) nemá číslo přihlášky.
      { bib: 602, runnerId: "19700101", name: "19700101", categoryId: "C", registrationId: null },
    ]);
  });

  it("entry order keeps on-site runners (no entry) after registered ones", () => {
    const rows = bibRowsFromStartList(
      [startRow(5, "a"), startRow(3, "b"), startRow(9, "c")],
      new Map([
        ["a", 2],
        ["c", 1],
      ]),
    );
    assert.deepEqual(
      sortBibRows(rows, "registration").map((row) => row.bib),
      [9, 5, 3],
    );
    assert.deepEqual(
      sortBibRows(rows, "bib").map((row) => row.bib),
      [3, 5, 9],
    );
  });

  it("champion bibs default to the edition (st_obhajce_m / st_obhajce_z)", () => {
    assert.deepEqual(championBibList({ men: 400, women: 950 }), [400, 950]);
    assert.deepEqual(championBibList({ men: 1, women: null }), [1]);
    assert.deepEqual(championBibList({ men: 7, women: 7 }), [7]);
    assert.deepEqual(championBibList({ men: null, women: null }), []);
  });

  it("start time on the card comes from the edition model (startTimeForBib)", () => {
    const model = startModelFromEdition({
      startZeroSeconds: 10 * 3600,
      startInterval: 20,
      secondStartFrom: 501,
    });
    const options: BuildBibOptions = {
      mode: "all",
      year: 2026,
      model,
      championBibs: championBibList({ men: 501, women: null }),
      veterans: new Map(),
      logoCount: 0,
    };
    const [first, second] = bibRowsFromStartList(
      [startRow(4, "a"), startRow(501, "b")],
      new Map(),
    ).map((row) => buildBibCard(row, options));
    assert.equal(first.startTime, "10:01:00");
    assert.equal(first.registrationId, null);
    assert.equal(second.startTime, "10:00:00");
    assert.equal(second.color, "red");
  });
});
