import assert from "node:assert/strict";
import { test } from "node:test";

import {
  byPosition,
  DEFAULT_STATIONS,
  parsePublicMax,
  positionFromLabel,
  publicStations,
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
  assert.deepEqual(parseStations("1=1,3 km\n\n3 = 2,7 km \n9=cíl\n1=dup\nx bad"), [
    { code: "1", label: "1,3 km", position: 13, public: true },
    { code: "3", label: "2,7 km", position: 27, public: true },
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
  assert.ok(isStationCode("a"));
  assert.ok(!isStationCode("A"));
  assert.ok(!isStationCode("10"));
  // řádek 0=… v nastavení stanovišť se ignoruje
  assert.deepEqual(parseStations("0=Start\n1=1,3 km"), [
    { code: "1", label: "1,3 km", position: 13, public: true },
  ]);
  assert.deepEqual(
    withStart(DEFAULT_STATIONS).map((s) => s.code),
    ["0", "1", "3"],
  );
});

test("extended lines (#316): position, public flag, letter codes", () => {
  const parsed = parseStations(
    "1=1,3 km | 13 | veřejný\nA=Les | 20 | interní\n3=2,7 km | 27 | v\nb=Kopec | | public\nc=Zlé | 5 | možná",
  );
  assert.deepEqual(parsed, [
    { code: "1", label: "1,3 km", position: 13, public: true },
    { code: "a", label: "Les", position: 20, public: false },
    { code: "3", label: "2,7 km", position: 27, public: true },
    { code: "b", label: "Kopec", position: null, public: true },
  ]);
  assert.deepEqual(parseStations(formatStations(parsed)), parsed);
  assert.deepEqual(
    byPosition(parsed).map((s) => s.code),
    ["1", "a", "3", "b"],
  );
  assert.deepEqual(
    publicStations(parsed, 2).map((s) => s.code),
    ["1", "3"],
  );
  assert.deepEqual(
    publicStations(parsed, 3).map((s) => s.code),
    ["1", "3", "b"],
  );
});

test("today's M1/M2 convert without changes and stay public", () => {
  const legacy = parseStations("1=1,3 km\n3=2,7 km");
  assert.deepEqual(legacy, DEFAULT_STATIONS);
  assert.equal(formatStations(legacy), "1=1,3 km | 13 | veřejný\n3=2,7 km | 27 | veřejný");
  assert.equal(positionFromLabel("1.5 km"), 15);
  assert.equal(positionFromLabel("Les"), null);
  assert.equal(parsePublicMax(""), 3);
  assert.equal(parsePublicMax("2"), 2);
  assert.equal(parsePublicMax("x"), 3);
});
