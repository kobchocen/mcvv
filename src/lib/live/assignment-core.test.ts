import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowedStationsFor,
  assignmentFromForm,
  formatAssignment,
  parseAssignment,
} from "./assignment-core";

const stations = [
  { code: "1", label: "1,3 km" },
  { code: "3", label: "2,7 km" },
];

test("parseAssignment keeps valid station codes only (never the finish)", () => {
  assert.deepEqual(parseAssignment("31"), ["1", "3"]);
  assert.deepEqual(parseAssignment("19x"), ["1"]);
  // "0" = start (#203)
  assert.deepEqual(parseAssignment("10"), ["0", "1"]);
  assert.deepEqual(parseAssignment(null), []);
  assert.deepEqual(parseAssignment(""), []);
});

test("formatAssignment / assignmentFromForm", () => {
  assert.equal(formatAssignment(["3", "1", "1"]), "13");
  assert.equal(formatAssignment([]), null);
  assert.equal(assignmentFromForm(["3", "5", "9"], stations), "3");
  assert.equal(assignmentFromForm([], stations), null);
});

test("allowedStationsFor: staff all, splitmaker only assigned, others none", () => {
  assert.deepEqual(allowedStationsFor("admin", null, stations), stations);
  assert.deepEqual(allowedStationsFor("organizer", "3", stations), stations);
  assert.deepEqual(allowedStationsFor("splitmaker", "3", stations), [stations[1]]);
  assert.deepEqual(allowedStationsFor("splitmaker", "13", stations), stations);
  // přiřazení na stanoviště, které už v live_stations není → nic
  assert.deepEqual(allowedStationsFor("splitmaker", "5", stations), []);
  assert.deepEqual(allowedStationsFor("splitmaker", null, stations), []);
  assert.deepEqual(allowedStationsFor("timing", "1", stations), []);
  assert.deepEqual(allowedStationsFor("registrar", "1", stations), []);
});

test("start station is assignable like other stations (#203)", () => {
  const withStartStations = [{ code: "0", label: "Start" }, ...stations];
  assert.equal(assignmentFromForm(["0", "3"], withStartStations), "03");
  // bez startu v nabídce se start nepřiřadí
  assert.equal(assignmentFromForm(["0"], stations), null);
  assert.deepEqual(allowedStationsFor("splitmaker", "0", withStartStations), [
    withStartStations[0],
  ]);
  assert.deepEqual(allowedStationsFor("admin", null, withStartStations), withStartStations);
});
