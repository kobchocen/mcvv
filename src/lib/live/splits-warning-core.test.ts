import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifySplitWarning,
  primarySplitWarning,
  splitWarningStateKey,
  webSplitNote,
  type SplitWarningField,
} from "./splits-warning-core";

const field: SplitWarningField = {
  roster: new Set([101, 102, 103, 104]),
  started: new Set([101, 102, 103]),
  finished: new Set([103, 104]),
};

test("classifySplitWarning flags unknown bibs first", () => {
  assert.equal(classifySplitWarning(999, "1", field), "unknown-bib");
  assert.equal(classifySplitWarning(999, "0", field), "unknown-bib");
  assert.equal(classifySplitWarning(999, "9", field), "unknown-bib");
});

test("classifySplitWarning flags a runner already in the finish at a mid-course split", () => {
  assert.equal(classifySplitWarning(103, "1", field), "already-finished");
  // 104 doběhl, ale startér ho neoznačil – v cíli má přednost před „neodstartoval“.
  assert.equal(classifySplitWarning(104, "3", field), "already-finished");
  // Na cíli je existující zápis duplicita, ne varování „už je v cíli“.
  assert.equal(classifySplitWarning(103, "9", field), null);
});

test("classifySplitWarning flags a roster bib without a start mark, including DNS", () => {
  assert.equal(classifySplitWarning(104, "1", { ...field, finished: new Set() }), "not-started");
  assert.equal(classifySplitWarning(104, "3", { ...field, finished: new Set() }), "not-started");
  // Na startu je zápis právě evidencí startu.
  assert.equal(classifySplitWarning(104, "0", { ...field, finished: new Set() }), null);
});

test("classifySplitWarning is silent for a normal punch", () => {
  assert.equal(classifySplitWarning(101, "1", field), null);
  assert.equal(classifySplitWarning(101, "0", field), null);
  assert.equal(classifySplitWarning(102, "9", field), null);
});

test("primarySplitWarning reads journal notes in priority order", () => {
  assert.equal(primarySplitWarning(null), null);
  assert.equal(primarySplitWarning("existing=12"), null);
  assert.equal(primarySplitWarning("unknown-bib;existing=12"), "unknown-bib");
  assert.equal(primarySplitWarning("not-started;existing=40"), "not-started");
  assert.equal(primarySplitWarning("already-finished"), "already-finished");
  assert.equal(primarySplitWarning("unknown-bib;already-finished;not-started"), "unknown-bib");
  assert.equal(primarySplitWarning("already-finished;not-started"), "already-finished");
});

test("webSplitNote composes the journal note after the planned start", () => {
  assert.equal(
    webSplitNote({
      knownBib: true,
      hadStart: true,
      alreadyFinished: false,
      station: "1",
    }),
    null,
  );
  assert.equal(
    webSplitNote({
      knownBib: false,
      hadStart: false,
      alreadyFinished: false,
      station: "1",
    }),
    "unknown-bib",
  );
  assert.equal(
    webSplitNote({
      knownBib: true,
      hadStart: false,
      alreadyFinished: false,
      station: "1",
    }),
    "not-started",
  );
  assert.equal(
    webSplitNote({
      knownBib: true,
      hadStart: true,
      alreadyFinished: true,
      station: "1",
    }),
    "already-finished",
  );
  assert.equal(
    webSplitNote({
      knownBib: true,
      hadStart: true,
      alreadyFinished: true,
      station: "9",
      existingTime: 1840,
    }),
    "existing=1840",
  );
  assert.equal(
    webSplitNote({
      knownBib: false,
      hadStart: false,
      alreadyFinished: false,
      station: "1",
      existingTime: 12,
    }),
    "unknown-bib;existing=12",
  );
  assert.equal(
    webSplitNote({
      knownBib: true,
      hadStart: false,
      alreadyFinished: false,
      station: "0",
    }),
    null,
  );
});

test("splitWarningStateKey maps to i18n state keys", () => {
  assert.equal(splitWarningStateKey("unknown-bib"), "unknownBib");
  assert.equal(splitWarningStateKey("not-started"), "notStarted");
  assert.equal(splitWarningStateKey("already-finished"), "alreadyFinished");
});
