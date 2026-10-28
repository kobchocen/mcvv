import assert from "node:assert/strict";
import { test } from "node:test";

import { webEntrySchema, type WebEntry } from "./ingest-core";
import {
  buildStartOverview,
  checkStartPunch,
  decideStartWrite,
  expectedMatches,
  filterStartRows,
  formatOffset,
  ownsStart,
  parseExpectedStart,
  parseStartFilter,
  partitionStartEntries,
  snapshotStarts,
  startOffsetSeconds,
} from "./start-check-core";
import { parseStartClock, pragueClock } from "./start-clock";

const ZERO = new Date("2026-12-06T09:15:00.000Z"); // 10:15 Europe/Prague
const ctx = { zero: ZERO, intervalS: 15 };

function entry(split: string, bib: number): WebEntry {
  return { action: "create", id: `id-${split}-${bib}`, split, bib, punchedAt: 1 } as WebEntry;
}

test("web schema accepts the start station but not finish-only codes outside 0–9", () => {
  const base = { action: "create", id: "a1b2c3d4e5f6", bib: 5, punchedAt: 1 };
  assert.equal(webEntrySchema.safeParse({ ...base, split: "0" }).success, true);
  assert.equal(webEntrySchema.safeParse({ ...base, split: "3" }).success, true);
  assert.equal(webEntrySchema.safeParse({ ...base, split: "x" }).success, false);
});

test("partitionStartEntries keeps start entries away from splits", () => {
  const { start, splits } = partitionStartEntries([
    entry("0", 1),
    entry("1", 1),
    entry("0", 2),
    entry("9", 3),
  ]);
  assert.deepEqual(
    start.map((e) => ("bib" in e ? e.bib : 0)),
    [1, 2],
  );
  assert.deepEqual(
    splits.map((e) => e.split),
    ["1", "9"],
  );
});

test("checkStartPunch rejects only future and stale punches", () => {
  const now = new Date("2026-12-06T10:00:00Z");
  assert.deepEqual(checkStartPunch(now.getTime(), now), { ok: true });
  assert.deepEqual(checkStartPunch(now.getTime() - 3 * 3600_000, now), { ok: true });
  assert.deepEqual(checkStartPunch(now.getTime() + 3600_000, now), {
    ok: false,
    reason: "future",
  });
  assert.deepEqual(checkStartPunch(now.getTime() - 25 * 3600_000, now), {
    ok: false,
    reason: "stale",
  });
});

test("startOffsetSeconds measures deviation from the planned start incl. second wave", () => {
  // číslo 3 → plánovaně 10:15:30
  assert.equal(startOffsetSeconds(new Date("2026-12-06T09:15:35.400Z"), ZERO, 3, 15), 5);
  assert.equal(startOffsetSeconds(new Date("2026-12-06T09:15:20Z"), ZERO, 3, 15), -10);
  // číslo 601 = první ve druhé vlně → plánovaně v nule
  assert.equal(startOffsetSeconds(ZERO, ZERO, 601, 15), 0);
});

test("formatOffset prints signed m:ss", () => {
  assert.equal(formatOffset(0), "0:00");
  assert.equal(formatOffset(5), "+0:05");
  assert.equal(formatOffset(-70), "-1:10");
  assert.equal(formatOffset(600), "+10:00");
});

test("first start record wins; later web entries are duplicates", () => {
  assert.equal(decideStartWrite(null), "insert");
  assert.equal(decideStartWrite({ startedAt: ZERO }), "duplicate");
});

test("ownsStart requires an applied entry with the same instant", () => {
  const row = { startedAt: ZERO };
  assert.equal(ownsStart({ outcome: "applied", startedAt: ZERO }, row), true);
  assert.equal(ownsStart({ outcome: "duplicate", startedAt: ZERO }, row), false);
  assert.equal(ownsStart({ outcome: "applied", startedAt: new Date(1) }, row), false);
  assert.equal(ownsStart({ outcome: "applied", startedAt: ZERO }, null), false);
});

test("buildStartOverview joins start list with records and counts DNS candidates", () => {
  const { rows, summary } = buildStartOverview(
    [
      { bib: 2, name: "Bára", club: "KOB", categoryId: "D21" },
      { bib: 1, name: "Adam", club: "SKOB", categoryId: "H21" },
      { bib: 2, name: "Bára dup", club: null, categoryId: null },
    ],
    [
      { bib: 1, startedAt: new Date(ZERO.getTime() + 3000), source: "web", userId: 7 },
      { bib: 900, startedAt: ZERO, source: "web", userId: null },
    ],
    ctx,
  );
  assert.deepEqual(summary, { total: 2, started: 1, missing: 1, unknown: 1 });
  assert.deepEqual(
    rows.map((r) => [r.bib, r.known, r.offsetS]),
    [
      [1, true, 3],
      [2, true, null],
      [900, false, -4485],
    ],
  );
  assert.equal(rows[1]!.planned.toISOString(), "2026-12-06T09:15:15.000Z");

  assert.deepEqual(
    filterStartRows(rows, "missing").map((r) => r.bib),
    [2],
  );
  assert.deepEqual(
    filterStartRows(rows, "started").map((r) => r.bib),
    [1],
  );
  assert.deepEqual(
    filterStartRows(rows, "unknown").map((r) => r.bib),
    [900],
  );
  assert.deepEqual(
    filterStartRows(rows, "all", "skob").map((r) => r.bib),
    [1],
  );
  assert.deepEqual(
    filterStartRows(rows, "all", "2").map((r) => r.bib),
    [2],
  );
});

test("parseStartFilter defaults to all", () => {
  assert.equal(parseStartFilter("missing"), "missing");
  assert.equal(parseStartFilter("nonsense"), "all");
  assert.equal(parseStartFilter(undefined), "all");
});

test("snapshotStarts is sorted by bib", () => {
  assert.deepEqual(
    snapshotStarts([
      { bib: 5, startedAt: ZERO, source: "web", userId: 1 },
      { bib: 2, startedAt: ZERO, source: "admin", userId: null },
    ]),
    [
      [2, ZERO.toISOString(), "admin"],
      [5, ZERO.toISOString(), "web"],
    ],
  );
});

test("expected guard protects against concurrent edits", () => {
  assert.equal(parseExpectedStart(""), null);
  assert.equal(parseExpectedStart(String(ZERO.getTime())), ZERO.getTime());
  assert.equal(parseExpectedStart("abc"), undefined);
  assert.equal(expectedMatches(null, null), true);
  assert.equal(expectedMatches(null, { startedAt: ZERO }), false);
  assert.equal(expectedMatches(ZERO.getTime(), { startedAt: ZERO }), true);
  assert.equal(expectedMatches(ZERO.getTime() + 1, { startedAt: ZERO }), false);
  assert.equal(expectedMatches(ZERO.getTime(), null), false);
});

test("parseStartClock reads Prague wall-clock on the race day", () => {
  assert.equal(
    parseStartClock("10:15:05", "2026-12-06")?.toISOString(),
    "2026-12-06T09:15:05.000Z",
  );
  assert.equal(parseStartClock("9:59", "2026-12-06")?.toISOString(), "2026-12-06T08:59:00.000Z");
  assert.equal(parseStartClock("25:00", "2026-12-06"), null);
  assert.equal(parseStartClock("10:61", "2026-12-06"), null);
  assert.equal(parseStartClock("abc", "2026-12-06"), null);
  assert.equal(parseStartClock("10:15", "bad"), null);
  assert.equal(pragueClock(new Date("2026-12-06T09:15:05Z")), "10:15:05");
});

test("buildStartOverview keeps the club id for the club link (#196)", () => {
  const { rows } = buildStartOverview(
    [{ bib: 3, name: "Cyril", club: "K.O.B. Choceň", clubId: "CHC", categoryId: "H21" }],
    [{ bib: 9, startedAt: ZERO, source: "web", userId: null }],
    ctx,
  );
  assert.equal(rows[0].clubId, "CHC");
  assert.equal(rows[1].clubId, undefined);
  assert.equal(rows[1].club, null);
});
