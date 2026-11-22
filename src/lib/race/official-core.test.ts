import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOfficialPreview,
  liveWindowState,
  parseLiveWindow,
  parseStamp,
  publishBlock,
  type OfficialStamp,
} from "./official-core";

const runner = (bib: number, categoryId = "A") => ({
  bib,
  runnerId: `R${bib}`,
  runnerName: `Běžec ${bib}`,
  clubId: "KOB",
  clubName: "KOB",
  categoryId,
});

const start = new Date("2026-12-06T09:15:00Z");

describe("live window", () => {
  it("auto opens at race zero", () => {
    const base = { raceStart: start, mode: "auto" as const, published: false };
    assert.equal(liveWindowState({ ...base, now: new Date("2026-12-06T09:14:59Z") }), "before");
    assert.equal(liveWindowState({ ...base, now: start }), "open");
  });
  it("manual override and publication", () => {
    const now = new Date("2026-12-06T08:00:00Z");
    assert.equal(
      liveWindowState({ now, raceStart: start, mode: "open", published: false }),
      "open",
    );
    const later = new Date("2026-12-06T11:00:00Z");
    assert.equal(
      liveWindowState({ now: later, raceStart: start, mode: "closed", published: false }),
      "closed",
    );
    assert.equal(
      liveWindowState({ now: later, raceStart: start, mode: "open", published: true }),
      "published",
    );
  });
  it("parses override only for the current year", () => {
    assert.equal(parseLiveWindow('{"year":2026,"mode":"open"}', 2026), "open");
    assert.equal(parseLiveWindow('{"year":2025,"mode":"open"}', 2026), "auto");
    assert.equal(parseLiveWindow("nonsense", 2026), "auto");
    assert.equal(parseLiveWindow(null, 2026), "auto");
  });
});

describe("official preview", () => {
  it("takes finish times of roster runners and flags problems", () => {
    const finish = new Map([
      [1, 1500],
      [2, 1400],
      [3, 100],
      [7, 1600],
    ]);
    const preview = buildOfficialPreview(
      [runner(1), runner(2), runner(3), runner(4), runner(5)],
      finish,
      new Set([4]),
    );
    assert.deepEqual(
      preview.rows.map((r) => r.bib),
      [3, 2, 1],
    );
    assert.equal(preview.noFinish, 2);
    assert.deepEqual(preview.issues, [
      { kind: "too-fast", bib: 3, time: 100 },
      { kind: "started-no-finish", bib: 4 },
      { kind: "not-on-roster", bib: 7, time: 1600 },
    ]);
  });
  it("hash changes with any time", () => {
    const a = buildOfficialPreview([runner(1)], new Map([[1, 1500]]));
    const b = buildOfficialPreview([runner(1)], new Map([[1, 1501]]));
    const c = buildOfficialPreview([runner(1)], new Map([[1, 1500]]));
    assert.notEqual(a.hash, b.hash);
    assert.equal(a.hash, c.hash);
  });
});

describe("publish guard", () => {
  const preview = buildOfficialPreview([runner(1)], new Map([[1, 1500]]));
  const stamp: OfficialStamp = { at: "x", by: "rozhodci", hash: preview.hash, count: 1 };
  const base = { preview, check: stamp, published: null, existingResults: 0, testRunning: false };
  it("needs a matching referee check", () => {
    assert.equal(publishBlock(base), null);
    assert.equal(publishBlock({ ...base, check: null }), "no_check");
    assert.equal(publishBlock({ ...base, check: { ...stamp, hash: "0-0" } }), "stale_check");
  });
  it("refuses twice, over existing results, during a test or with no times", () => {
    assert.equal(publishBlock({ ...base, published: stamp }), "published");
    assert.equal(publishBlock({ ...base, existingResults: 3 }), "has_results");
    assert.equal(publishBlock({ ...base, testRunning: true }), "test_running");
    const empty = buildOfficialPreview([runner(1)], new Map());
    assert.equal(publishBlock({ ...base, preview: empty }), "empty");
  });
  it("parses stamps defensively", () => {
    assert.deepEqual(parseStamp(JSON.stringify(stamp)), stamp);
    assert.equal(parseStamp("{}"), null);
    assert.equal(parseStamp("x"), null);
  });
});
