import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_STATIONS,
  formatStations,
  isSplitCode,
  parseStations,
  webAuthor,
} from "./stations";

test("parses code=label lines and ignores junk, duplicates and finish", () => {
  assert.deepEqual(parseStations("1=1,3 km\n\n3 = 2,7 km \n9=cíl\n1=dup\nx=bad"), [
    { code: "1", label: "1,3 km" },
    { code: "3", label: "2,7 km" },
  ]);
});

test("empty or invalid input falls back to defaults", () => {
  assert.deepEqual(parseStations(""), DEFAULT_STATIONS);
  assert.deepEqual(parseStations(null), DEFAULT_STATIONS);
  assert.deepEqual(parseStations("nonsense"), DEFAULT_STATIONS);
});

test("round trip, codes and authors", () => {
  assert.deepEqual(parseStations(formatStations(DEFAULT_STATIONS)), DEFAULT_STATIONS);
  assert.ok(isSplitCode("1"));
  assert.ok(!isSplitCode("0"));
  assert.ok(!isSplitCode("10"));
  assert.ok(!isSplitCode(1));
  assert.equal(webAuthor("3"), "spl3");
});
