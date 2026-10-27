import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_STATIONS,
  formatStations,
  isSplitCode,
  isStationCode,
  isStartStation,
  parseStations,
  START_STATION,
  webAuthor,
  withStart,
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

test("start station (#203) is not a split code and never comes from live_stations", () => {
  assert.equal(START_STATION, "0");
  assert.ok(isStartStation("0"));
  assert.ok(!isSplitCode(START_STATION));
  assert.ok(isStationCode("0"));
  assert.ok(isStationCode("3"));
  assert.ok(!isStationCode("a"));
  // řádek 0=… v nastavení stanovišť se ignoruje
  assert.deepEqual(parseStations("0=Start\n1=1,3 km"), [{ code: "1", label: "1,3 km" }]);
  assert.deepEqual(
    withStart(DEFAULT_STATIONS).map((s) => s.code),
    ["0", "1", "3"],
  );
});
