import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clubFollowPick,
  clubFollowState,
  FOLLOW_LIMIT,
  followEvents,
  followSignature,
  followStorageKey,
  mergeFollow,
  parseBibList,
  parseFollowed,
  searchClubs,
  toggleFollow,
  type FollowSnap,
} from "./follow-core";
import type { OnlineRunner } from "./online-results-core";

const T0 = 1_800_000_000;

function runner(bib: number, start: number, x: Partial<OnlineRunner> = {}): OnlineRunner {
  return {
    bib,
    name: `Běžec ${bib}`,
    cat: "A",
    start: T0 + start,
    m1: null,
    m2: null,
    fin: null,
    started: false,
    late: null,
    club: 0,
    ...x,
  };
}

test("storage key is per year", () => {
  assert.equal(followStorageKey(2026), "mcvv-sledovani-2026");
});

test("parseBibList / parseFollowed keep positive unique integers up to the limit", () => {
  assert.deepEqual(parseBibList("234, 203,abc,-1,234,0,7.5"), [234, 203]);
  assert.deepEqual(parseBibList(null), []);
  assert.equal(parseBibList(Array.from({ length: 20 }, (_, i) => i + 1).join(",")).length, 10);
  assert.deepEqual(parseFollowed('[5,6,"7",5]'), [5, 6]);
  assert.deepEqual(parseFollowed("{bad"), []);
  assert.deepEqual(parseFollowed('{"a":1}'), []);
});

test("toggleFollow adds, removes and refuses over the limit", () => {
  assert.deepEqual(toggleFollow([1, 2], 3), { list: [1, 2, 3], full: false });
  assert.deepEqual(toggleFollow([1, 2], 1), { list: [2], full: false });
  const full = Array.from({ length: FOLLOW_LIMIT }, (_, i) => i + 1);
  assert.deepEqual(toggleFollow(full, 99), { list: full, full: true });
  assert.deepEqual(toggleFollow(full, 3).list.length, FOLLOW_LIMIT - 1);
});

test("mergeFollow adds the shared selection without removing anything", () => {
  assert.deepEqual(mergeFollow([1, 2], [2, 3]), [1, 2, 3]);
  assert.deepEqual(mergeFollow([1, 2, 3], [4, 5], 4), [1, 2, 3, 4]);
});

test("searchClubs finds a club by name without diacritics or by id, not for numbers", () => {
  const clubs = [
    { id: "CHC", name: "K.O.B. Choceň" },
    { id: "UOS", name: "Orientační běh Ústí n. O." },
  ];
  assert.deepEqual(
    searchClubs(clubs, "choc").map((c) => c.id),
    ["CHC"],
  );
  assert.deepEqual(
    searchClubs(clubs, "uos").map((c) => c.id),
    ["UOS"],
  );
  assert.deepEqual(
    searchClubs(clubs, "usti").map((c) => c.id),
    ["UOS"],
  );
  assert.deepEqual(searchClubs(clubs, "203"), []);
  assert.deepEqual(searchClubs(clubs, "c"), []);
});

test("clubFollowPick fills free slots, runners still to finish first (Q179)", () => {
  const now = T0 + 3000;
  const members = [
    runner(1, 0, { fin: 1500 }), // doběhl
    runner(2, 2000, { started: true, m1: 300 }), // na trati
    runner(3, 3300), // čeká na start
    runner(4, 100), // DNS (bez záznamu, dávno po startu)
    runner(5, 1000, { m1: 400 }), // na trati, dřívější start
  ];
  assert.deepEqual(clubFollowPick(members, [], now, 300, 3), [5, 2, 3]);
  assert.deepEqual(clubFollowPick(members, [5], now, 300, 5), [2, 3, 1, 4]);
  assert.deepEqual(clubFollowPick(members, [9, 8], now, 300, 2), []);
});

test("clubFollowState covers all / some / full / unfollow", () => {
  const m = [{ bib: 1 }, { bib: 2 }, { bib: 3 }];
  assert.deepEqual(clubFollowState(m, []), { kind: "all", n: 3 });
  assert.deepEqual(clubFollowState(m, [1, 7, 8], 4), { kind: "some", free: 1, n: 2 });
  assert.deepEqual(clubFollowState(m, [7, 8, 9, 10], 4), { kind: "full" });
  assert.deepEqual(clubFollowState(m, [1, 2, 3]), { kind: "unfollow", n: 3 });
});

const snap = (x: Partial<FollowSnap> = {}): FollowSnap => ({
  m1: null,
  m2: null,
  fin: null,
  final: false,
  ...x,
});

test("followEvents reports new splits, finish and final rank, never on first load", () => {
  const prev = new Map([
    [1, snap()],
    [2, snap({ m1: 300, m2: 700 })],
    [3, snap({ m1: 300, m2: 700, fin: 1100 })],
  ]);
  const next = new Map([
    [1, snap({ m1: 310 })],
    [2, snap({ m1: 300, m2: 700, fin: 1000 })],
    [3, snap({ m1: 300, m2: 700, fin: 1100, final: true })],
    [4, snap({ m1: 290 })], // právě přidaný – nic
  ]);
  assert.deepEqual(followEvents(null, next), []);
  assert.deepEqual(followEvents(prev, next), [
    { kind: "split", bib: 1, point: "m1" },
    { kind: "fin", bib: 2 },
    { kind: "final", bib: 3 },
  ]);
  assert.deepEqual(followEvents(next, next), []);
  // dovezená data – víc bodů naráz
  assert.deepEqual(
    followEvents(new Map([[1, snap()]]), new Map([[1, snap({ m1: 1, m2: 2, fin: 3 })]])).map(
      (e) => e.kind,
    ),
    ["split", "split", "fin"],
  );
  assert.notEqual(followSignature(prev), followSignature(next));
});
