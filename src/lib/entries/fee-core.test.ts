import assert from "node:assert/strict";
import { test } from "node:test";

import { absoluteWinnerIdsFrom, feeReasonFor, veteranIdsFrom } from "./fee-core";

const rows = [
  // 2001: muži 19700001 (900 s) před 19700002, ženy 19755001
  { year: 2001, runnerId: "19700001", time: 900 },
  { year: 2001, runnerId: "19700002", time: 950 },
  { year: 2001, runnerId: "19755001", time: 1000 },
  { year: 2002, runnerId: "19700002", time: 880 },
  { year: 2002, runnerId: "19700001", time: 890 },
  { year: 2003, runnerId: "19700002", time: 999 },
];

test("absolute winners per year and sex", () => {
  assert.deepEqual([...absoluteWinnerIdsFrom(rows)].sort(), ["19700001", "19700002", "19755001"]);
});

test("veterans started in more than half of the editions", () => {
  // 3 ročníky → pocr = round(2) - 1 = 1 → víc než 1 start
  assert.deepEqual([...veteranIdsFrom(rows)].sort(), ["19700001", "19700002"]);
});

test("fee reason order: organizer, winner, veteran", () => {
  const data = {
    freeEmails: new Set(["org@example.cz"]),
    winners: new Set(["W"]),
    veterans: new Set(["W", "V"]),
  };
  assert.equal(feeReasonFor(" Org@Example.cz ", "X", data), "organizer");
  assert.equal(feeReasonFor("a@b.cz", "W", data), "winner");
  assert.equal(feeReasonFor("a@b.cz", "V", data), "veteran");
  assert.equal(feeReasonFor("a@b.cz", "X", data), null);
});
