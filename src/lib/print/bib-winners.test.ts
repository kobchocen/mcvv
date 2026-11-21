import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { absoluteWinnerCountsFrom, runnerSexFromId } from "./bib-winners";

const rows = [
  { year: 2001, runnerId: "19700001", time: 900 },
  { year: 2001, runnerId: "19700002", time: 950 },
  { year: 2001, runnerId: "19755001", time: 1000 },
  { year: 2002, runnerId: "19700002", time: 880 },
  { year: 2002, runnerId: "19700001", time: 890 },
  { year: 2003, runnerId: "19700002", time: 999 },
  { year: 2003, runnerId: "19700003", time: 0 },
];

describe("absoluteWinnerCountsFrom", () => {
  it("counts overall wins per year and sex, ignoring zero times", () => {
    const counts = absoluteWinnerCountsFrom(rows);
    assert.equal(counts.get("19700001"), 1);
    assert.equal(counts.get("19700002"), 2);
    assert.equal(counts.get("19755001"), 1);
    assert.equal(counts.has("19700003"), false);
  });

  it("can exclude the current race year and later", () => {
    const counts = absoluteWinnerCountsFrom(rows, { beforeYear: 2003 });
    assert.equal(counts.get("19700001"), 1);
    assert.equal(counts.get("19700002"), 1);
    assert.equal(counts.get("19755001"), 1);
  });

  it("reads sex from the runner id the same way as fees and stats", () => {
    assert.equal(runnerSexFromId("19700001"), "M");
    assert.equal(runnerSexFromId("19755001"), "F");
  });
});
