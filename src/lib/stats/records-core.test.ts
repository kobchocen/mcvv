import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { categoryRecord, recordChanges, recordEvolution } from "./records-core";

// ID: RRRR + 5. znak pohlaví (0–4 muž, 5–9 žena) + pořadí.
const results = [
  { year: 2020, runnerId: "19700001", time: 1100 }, // muž 50 let
  { year: 2021, runnerId: "19700001", time: 1050 },
  { year: 2021, runnerId: "19950002", time: 900 }, // muž 26 let
  { year: 2022, runnerId: "19720003", time: 1060 }, // muž 50 let (hranice)
  { year: 2022, runnerId: "19725004", time: 1190 }, // žena 50 let
  { year: 2023, runnerId: "19745005", time: 1180 }, // žena 49 let – do H nepatří
  { year: 2023, runnerId: "20090006", time: 1000 }, // žák 14 let
  { year: 2023, runnerId: "20080007", time: 950 }, // 15 let – do žáků nepatří
  { year: 2024, runnerId: "19700008", time: 0 }, // nulový čas se ignoruje
];
const C = { id: "C", sex: "M", age: 50 };
const H = { id: "H", sex: "F", age: 50 };
const J = { id: "J", sex: "M", age: 14 };
const A = { id: "A", sex: "M", age: 0 };

describe("category records (#129, legacy setkatrek.php)", () => {
  it("applies the sex and birth-year rule of the category", () => {
    assert.equal(categoryRecord(C, results)?.time, 1050);
    assert.equal(categoryRecord(H, results)?.time, 1190);
    assert.equal(categoryRecord(J, results)?.time, 1000);
    assert.equal(categoryRecord(A, results)?.time, 900, "open category, any age");
    assert.equal(categoryRecord({ id: "I", sex: "F", age: 60 }, results), null);
  });

  it("lists record improvements by year (statistics 'Vývoj rekordů')", () => {
    assert.deepEqual(
      recordEvolution(C, results).map((r) => [r.year, r.time]),
      [
        [2020, 1100],
        [2021, 1050],
      ],
    );
  });

  it("reports only changed records and keeps categories without results", () => {
    assert.deepEqual(
      recordChanges(
        [
          { ...C, record: 1050 },
          { ...H, record: 1220 },
          { id: "I", sex: "F", age: 60, record: 1569 },
        ],
        results,
      ),
      [{ id: "H", from: 1220, to: 1190 }],
    );
  });
});
