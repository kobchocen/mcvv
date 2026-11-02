import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkSpecialStarts,
  formatOffset,
  inAnySpecialRange,
  inSpecialRange,
  offsetSlots,
  parseOffset,
  specialBibRange,
  specialRangeText,
  type SpecialCheckRow,
  type SpecialStartSpec,
} from "./special-start";
import type { BibRange } from "./start-settings";
import { DEFAULT_START_MODEL, startSeriesForBib, startSlot } from "./start-time";
import { generateStartList, type GeneratorEntry, type GeneratorInput } from "./startlist-generator";

const MODEL = DEFAULT_START_MODEL; // interval 15 s, 2. řada od 601
// Okna kategorií mimo rozsahy spec. startů (1–99, 261–299 a totéž od 601).
const RANGES: BibRange[] = [
  { categoryId: "J", bibFrom: 101, bibTo: 140 },
  { categoryId: "B", bibFrom: 201, bibTo: 260 },
  { categoryId: "A", bibFrom: 301, bibTo: 380 },
  { categoryId: "K", bibFrom: 701, bibTo: 740 },
  { categoryId: "F", bibFrom: 901, bibTo: 930 },
];
const SORT = { J: 1, B: 2, A: 3, K: 8, F: 10 };

let seq = 0;
function entry(partial: Partial<GeneratorEntry> & { categoryId: string }): GeneratorEntry {
  seq += 1;
  return {
    runnerId: partial.runnerId ?? `R${String(seq).padStart(7, "0")}`,
    name: partial.name ?? `Běžec ${String(seq).padStart(3, "0")}`,
    currentBib: null,
    locked: false,
    eligible: true,
    lastYearTime: null,
    ...partial,
  };
}

const early: SpecialStartSpec = { kind: "early", partnerId: null, offsetSeconds: 0 };
const late: SpecialStartSpec = { kind: "late", partnerId: null, offsetSeconds: 0 };
const organizer: SpecialStartSpec = { kind: "organizer", partnerId: null, offsetSeconds: 0 };
const withRunner = (partnerId: string, offsetSeconds = 0): SpecialStartSpec => ({
  kind: "with",
  partnerId,
  offsetSeconds,
});

function input(entries: GeneratorEntry[], extra: Partial<GeneratorInput> = {}): GeneratorInput {
  return { model: MODEL, ranges: RANGES, categorySort: SORT, champions: [], entries, ...extra };
}

function run(entries: GeneratorEntry[], extra: Partial<GeneratorInput> = {}) {
  const result = generateStartList(input(entries, extra));
  const bib = (e: GeneratorEntry) => result.lines.find((l) => l.runnerId === e.runnerId)!.bib;
  const line = (e: GeneratorEntry) => result.lines.find((l) => l.runnerId === e.runnerId)!;
  const unique = result.lines.filter((l) => l.bib != null).map((l) => l.bib);
  assert.equal(new Set(unique).size, unique.length, "bibs are unique");
  return { result, bib, line };
}

function checkRows(
  entries: GeneratorEntry[],
  result: ReturnType<typeof generateStartList>,
): SpecialCheckRow[] {
  return entries.map((e) => ({
    runnerId: e.runnerId,
    bib: result.lines.find((l) => l.runnerId === e.runnerId)!.bib,
    active: e.eligible,
    special: e.special ?? null,
  }));
}

const filler = (categoryId: string, count: number) =>
  Array.from({ length: count }, () => entry({ categoryId }));
const slotDiff = (a: number | null, b: number | null) =>
  startSlot(MODEL, a!) - startSlot(MODEL, b!);

describe("spec. start ranges (Q236, Q221, Q222)", () => {
  it("uses the same slots on both lines", () => {
    assert.deepEqual(specialBibRange(MODEL, "organizer", 1), { from: 1, to: 40 });
    assert.deepEqual(specialBibRange(MODEL, "organizer", 2), { from: 601, to: 640 });
    assert.deepEqual(specialBibRange(MODEL, "early", 1), { from: 41, to: 99 });
    assert.deepEqual(specialBibRange(MODEL, "early", 2), { from: 641, to: 699 });
    assert.deepEqual(specialBibRange(MODEL, "late", 1), { from: 261, to: 299 });
    assert.deepEqual(specialBibRange(MODEL, "late", 2), { from: 861, to: 899 });
    assert.equal(specialRangeText(MODEL, "early"), "41–99 / 641–699");
  });
  it("tells whether a bib lies in a range on either line", () => {
    assert.ok(inSpecialRange(MODEL, "organizer", 40));
    assert.ok(!inSpecialRange(MODEL, "organizer", 41));
    assert.ok(inSpecialRange(MODEL, "early", 699));
    assert.ok(inSpecialRange(MODEL, "late", 861));
    assert.ok(!inSpecialRange(MODEL, "late", 900), "no reserve numbers (Q222)");
    assert.ok(!inSpecialRange(MODEL, "late", 300));
    assert.ok(inAnySpecialRange(MODEL, 620));
    assert.ok(!inAnySpecialRange(MODEL, 150));
  });
});

describe("parseOffset / formatOffset (Q224, Q235)", () => {
  const ok = (seconds: number) => ({ ok: true, seconds });
  it("parses m:ss, plain minutes and interval steps with a sign", () => {
    assert.deepEqual(parseOffset(""), ok(0));
    assert.deepEqual(parseOffset("0"), ok(0));
    assert.deepEqual(parseOffset("+2"), ok(120));
    assert.deepEqual(parseOffset("1:30"), ok(90), "several intervals (6 × 15 s)");
    assert.deepEqual(parseOffset("−1:30"), ok(-90));
    assert.deepEqual(parseOffset("–0:45"), ok(-45));
    assert.deepEqual(parseOffset(" +0:15 "), ok(15));
    assert.deepEqual(parseOffset("+6i"), ok(90));
    assert.deepEqual(parseOffset("-3x"), ok(-45));
    assert.deepEqual(parseOffset("60"), ok(3600));
    assert.deepEqual(parseOffset("-60:00"), ok(-3600));
  });
  it("requires a multiple of the start interval", () => {
    assert.deepEqual(parseOffset("0:20"), { ok: false, reason: "step" });
    assert.deepEqual(parseOffset("0:20", 10), ok(20));
    assert.deepEqual(parseOffset("+2i", 20), ok(40));
  });
  it("caps the offset at ± 60 min and rejects garbage", () => {
    assert.deepEqual(parseOffset("60:15"), { ok: false, reason: "range" });
    assert.deepEqual(parseOffset("-61"), { ok: false, reason: "range" });
    assert.deepEqual(parseOffset("abc"), { ok: false, reason: "format" });
    assert.deepEqual(parseOffset("1:75"), { ok: false, reason: "format" });
    assert.deepEqual(parseOffset("1.5"), { ok: false, reason: "format" });
  });
  it("formats back and counts intervals", () => {
    assert.equal(formatOffset(0), "0");
    assert.equal(formatOffset(120), "+2:00");
    assert.equal(formatOffset(-90), "−1:30");
    assert.equal(formatOffset(15), "+0:15");
    assert.equal(offsetSlots(MODEL, 90), 6);
    assert.equal(offsetSlots(MODEL, -15), -1);
  });
});

describe("generateStartList – organizer / early / late", () => {
  it("numbers flagged organizers from 1 and 601 in category order", () => {
    const a = entry({ categoryId: "A", special: organizer, name: "Adamec" });
    const j = entry({ categoryId: "J", special: organizer, name: "Zelený" });
    const k = entry({ categoryId: "K", special: organizer });
    const { bib, line, result } = run([a, j, k, ...filler("A", 5)]);
    assert.equal(bib(j), 1, "J sorts before A");
    assert.equal(bib(a), 2);
    assert.equal(bib(k), 601);
    assert.equal(line(j).reason, "organizer");
    assert.equal(line(j).outsideCategory, false);
    assert.deepEqual(result.warnings, []);
  });

  it("puts early runners on 41+ / 641+", () => {
    const a = entry({ categoryId: "A", special: early });
    const j = entry({ categoryId: "J", special: early });
    const k = entry({ categoryId: "K", special: early });
    const org = entry({ categoryId: "A", special: organizer });
    const { bib, line } = run([org, a, j, k, ...filler("A", 10), ...filler("K", 4)]);
    assert.equal(bib(org), 1);
    assert.equal(bib(j), 41);
    assert.equal(bib(a), 42);
    assert.equal(bib(k), 641);
    assert.equal(line(a).reason, "early");
    assert.equal(line(a).outsideCategory, false);
  });

  it("fills late from the end (299 / 899) and keeps a stable order", () => {
    const j = entry({ categoryId: "J", special: late });
    const a = entry({ categoryId: "A", special: late });
    const k = entry({ categoryId: "K", special: late });
    const { bib, line } = run([j, a, k, ...filler("A", 20), ...filler("F", 5)]);
    assert.equal(bib(j), 298);
    assert.equal(bib(a), 299);
    assert.equal(bib(k), 899);
    assert.equal(line(a).reason, "late");
    assert.equal(line(a).outsideCategory, false);
  });

  it("keeps a locked bib inside the range and skips it", () => {
    const locked = entry({ categoryId: "A", locked: true, currentBib: 1 });
    const org = entry({ categoryId: "A", special: organizer });
    const { bib } = run([locked, org]);
    assert.equal(bib(org), 2);
  });

  it("organizer overflow: nearest free bib outside 1–40 with a warning (Q237)", () => {
    const orgs = Array.from({ length: 41 }, (_, i) =>
      entry({ categoryId: "A", special: organizer, name: `Org ${String(i + 1).padStart(2, "0")}` }),
    );
    const { bib, result } = run(orgs);
    assert.deepEqual(
      orgs.slice(0, 40).map(bib),
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    assert.equal(bib(orgs[40]), 41, "first number after the range");
    assert.deepEqual(result.warnings, [
      { code: "specOverflow", kind: "organizer", series: 1, runnerIds: [orgs[40].runnerId] },
    ]);
    const checks = checkSpecialStarts(MODEL, checkRows(orgs, result));
    assert.deepEqual(checks.get(orgs[40].runnerId), { ok: false, reason: "range" });
    assert.deepEqual(checks.get(orgs[0].runnerId), { ok: true });
  });

  it("late overflow: the earliest-sorted runner goes just outside, before 261", () => {
    const lates = Array.from({ length: 40 }, (_, i) =>
      entry({ categoryId: "A", special: late, name: `Late ${String(i + 1).padStart(2, "0")}` }),
    );
    const { bib, result } = run(lates);
    // 39 čísel 261–299 od konce; 300 není v žádném okně → nejbližší volné 260 (okno B).
    assert.equal(bib(lates[39]), 299);
    assert.equal(bib(lates[1]), 261);
    assert.equal(bib(lates[0]), 260);
    assert.deepEqual(result.warnings, [
      { code: "specOverflow", kind: "late", series: 1, runnerIds: [lates[0].runnerId] },
    ]);
  });

  it("champions keep their bibs even inside a spec range", () => {
    const champ = entry({ categoryId: "A", lastYearTime: 800 });
    const e = entry({ categoryId: "A", special: early });
    const { bib } = run([champ, e], { champions: [{ runnerId: champ.runnerId, bib: 41 }] });
    assert.equal(bib(champ), 41);
    assert.equal(bib(e), 42);
  });
});

describe("generateStartList – „spolu s“ (Q224, Q235, Q226)", () => {
  it("offset 0 = same time on the other line (cross-line)", () => {
    const partner = entry({ categoryId: "J", currentBib: 120, locked: true });
    const kid = entry({ categoryId: "A", special: withRunner(partner.runnerId, 0) });
    const { bib, line, result } = run([partner, kid, ...filler("A", 10), ...filler("K", 5)]);
    assert.equal(bib(kid), 720);
    assert.notEqual(startSeriesForBib(MODEL, bib(kid)!), startSeriesForBib(MODEL, bib(partner)!));
    assert.equal(line(kid).reason, "with");
    assert.equal(line(kid).outsideCategory, true);
    assert.deepEqual(result.warnings, []);
  });

  it("applies a multi-interval positive and negative offset (+1:30, −0:45)", () => {
    const partner = entry({ categoryId: "A", currentBib: 340, locked: true });
    const after = entry({ categoryId: "A", special: withRunner(partner.runnerId, 90) });
    const before = entry({ categoryId: "A", special: withRunner(partner.runnerId, -45) });
    const all = [partner, after, before, ...filler("A", 20)];
    const { bib, result } = run(all);
    assert.equal(bib(after), 346);
    assert.equal(bib(before), 337);
    assert.equal(slotDiff(bib(after), bib(partner)), 6);
    const checks = checkSpecialStarts(MODEL, checkRows(all, result));
    assert.deepEqual([...checks.values()], [{ ok: true }, { ok: true }]);
  });

  it("spans many intervals and lines: −60 min and a cross-line +0:30", () => {
    const partner = entry({ categoryId: "A", currentBib: 360, locked: true });
    const hourEarlier = entry({ categoryId: "A", special: withRunner(partner.runnerId, -3600) });
    // Kategorie K (2. řada): slot 362 nemá ve 2. řadě okno → stejný čas v 1. řadě (okno A).
    const woman = entry({ categoryId: "K", special: withRunner(partner.runnerId, 30) });
    const { bib, line, result } = run([partner, hourEarlier, woman, ...filler("K", 3)]);
    assert.equal(bib(hourEarlier), 120, "slot 360 − 240");
    assert.equal(bib(woman), 362);
    assert.equal(line(woman).outsideCategory, true);
    assert.deepEqual(result.warnings, []);
  });

  it("uses the nearest free slot and warns when the exact one is taken", () => {
    const partner = entry({ categoryId: "A", currentBib: 340, locked: true });
    const blocker = entry({ categoryId: "A", currentBib: 346, locked: true });
    const kid = entry({ categoryId: "A", special: withRunner(partner.runnerId, 90) });
    const { bib, result } = run([partner, blocker, kid]);
    assert.equal(bib(kid), 347);
    assert.deepEqual(result.warnings, [
      { code: "specApprox", runnerId: kid.runnerId, deviation: 1 },
    ]);
  });

  it("missing partner: warning and normal placement (Q226)", () => {
    const gone = entry({ categoryId: "A", special: withRunner("19990001", 0) });
    const unpaid = entry({ categoryId: "A", eligible: false });
    const waiting = entry({ categoryId: "A", special: withRunner(unpaid.runnerId, 0) });
    const { bib, line, result } = run([gone, unpaid, waiting, ...filler("A", 3)]);
    assert.ok(bib(gone)! >= 301 && bib(gone)! <= 380);
    assert.equal(line(waiting).reason, "category");
    assert.deepEqual(
      result.warnings.map((w) => w.code),
      ["specPartnerMissing", "specPartnerMissing"],
    );
  });

  it("resolves chains (partner first) and relocates a regular runner in its window", () => {
    const a = entry({ categoryId: "A", runnerId: "Z0000001" });
    const b = entry({ categoryId: "A", runnerId: "A0000002", special: withRunner("Z0000001", 15) });
    const c = entry({ categoryId: "A", runnerId: "A0000001", special: withRunner("A0000002", 15) });
    const all = [a, b, c, ...filler("A", 75)];
    const { bib, result } = run(all);
    assert.equal(bib(b)! - bib(a)!, 1);
    assert.equal(bib(c)! - bib(b)!, 1);
    assert.equal(result.blocking, false);
    for (const e of all) {
      assert.ok(bib(e)! >= 301 && bib(e)! <= 380, "everyone stays in the A window");
    }
  });

  it("accepts a consistent mutual pair and warns about an inconsistent cycle", () => {
    const a = entry({ categoryId: "A", runnerId: "A0000010" });
    const b = entry({ categoryId: "K", runnerId: "B0000010" });
    a.special = withRunner(b.runnerId, 0);
    b.special = withRunner(a.runnerId, 0);
    const first = run([a, b, ...filler("A", 5), ...filler("K", 5)]);
    assert.equal(startSlot(MODEL, first.bib(a)!), startSlot(MODEL, first.bib(b)!));
    assert.ok(!first.result.warnings.some((w) => w.code === "specCycle"));

    const c = entry({ categoryId: "A", runnerId: "A0000020" });
    const d = entry({ categoryId: "A", runnerId: "B0000020" });
    c.special = withRunner(d.runnerId, 15);
    d.special = withRunner(c.runnerId, 15);
    const second = run([c, d, ...filler("A", 5)]);
    assert.deepEqual(
      second.result.warnings.filter((w) => w.code === "specCycle"),
      [{ code: "specCycle", runnerIds: ["A0000020", "B0000020"] }],
    );
  });

  it("never moves a locked runner, only evaluates it", () => {
    const partner = entry({ categoryId: "A" });
    const locked = entry({
      categoryId: "A",
      currentBib: 350,
      locked: true,
      special: withRunner(partner.runnerId, 0),
    });
    const { bib, line } = run([partner, locked, ...filler("A", 5)]);
    assert.equal(bib(locked), 350);
    assert.equal(line(locked).reason, "locked");
  });
});

describe("generateStartList – partners move with early / late runners (Q227)", () => {
  it("an early runner takes the family along (other line, chained offset)", () => {
    const mum = entry({ categoryId: "A", special: early, runnerId: "M0000001" });
    const kid = entry({ categoryId: "K", special: withRunner(mum.runnerId, 0) });
    const grandpa = entry({ categoryId: "A", special: withRunner(kid.runnerId, 15) });
    const { bib, line, result } = run([mum, kid, grandpa, ...filler("A", 10), ...filler("K", 5)]);
    assert.equal(bib(mum), 41);
    assert.equal(bib(kid), 641, "same time, other line, still in the early range");
    assert.equal(bib(grandpa), 42, "15 s after the kid, own line");
    assert.equal(line(kid).reason, "with");
    assert.equal(line(kid).outsideCategory, false, "spec range is not 'outside category'");
    assert.deepEqual(result.warnings, []);
  });

  it("a late runner keeps a partner starting 15 s before", () => {
    const dad = entry({ categoryId: "A", special: late });
    const son = entry({ categoryId: "A", special: withRunner(dad.runnerId, -15) });
    const { bib, result } = run([dad, son, ...filler("A", 10)]);
    assert.equal(bib(dad), 299);
    assert.equal(bib(son), 298);
    assert.deepEqual(result.warnings, []);
  });

  it("skips anchor slots where the partner would not fit", () => {
    const first = entry({ categoryId: "A", special: early, name: "A první" });
    const second = entry({ categoryId: "A", special: early, name: "B druhý" });
    // Partner druhého chce stejný čas ve 2. řadě; 642 drží zamčený běžec → druhý jde na 43.
    const blocker = entry({ categoryId: "K", currentBib: 642, locked: true });
    const partner = entry({ categoryId: "K", special: withRunner(second.runnerId, 0) });
    const { bib, result } = run([first, second, blocker, partner]);
    assert.equal(bib(first), 41);
    assert.equal(bib(second), 43);
    assert.equal(bib(partner), 643);
    assert.deepEqual(result.warnings, []);
  });

  it("is stable: applying the proposal and re-running changes nothing", () => {
    const partner = entry({ categoryId: "A" });
    const entries = [
      partner,
      entry({ categoryId: "J", special: early }),
      entry({ categoryId: "A", special: late }),
      entry({ categoryId: "A", special: organizer }),
      entry({ categoryId: "K", special: withRunner(partner.runnerId, 0) }),
      entry({ categoryId: "A", special: withRunner(partner.runnerId, 90) }),
      ...filler("A", 12),
      ...filler("K", 6),
    ];
    const first = generateStartList(input(entries));
    const applied = entries.map((e) => ({
      ...e,
      currentBib: first.lines.find((l) => l.runnerId === e.runnerId)!.bib,
    }));
    assert.equal(generateStartList(input(applied)).changed, 0);
  });
});

describe("checkSpecialStarts", () => {
  const row = (
    runnerId: string,
    bib: number | null,
    special: SpecialStartSpec | null = null,
    extra: Partial<SpecialCheckRow> = {},
  ): SpecialCheckRow => ({ runnerId, bib, active: true, special, ...extra });

  it("checks organizer / early / late against their ranges on both lines", () => {
    const checks = checkSpecialStarts(MODEL, [
      row("plain", 301),
      row("org-ok", 640, organizer),
      row("org-bad", 41, organizer),
      row("early-ok", 99, early),
      row("early-bad", 320, early),
      row("late-ok", 861, late),
      row("late-bad", 900, late),
    ]);
    assert.equal(checks.has("plain"), false);
    assert.deepEqual(checks.get("org-ok"), { ok: true });
    assert.deepEqual(checks.get("org-bad"), { ok: false, reason: "range" });
    assert.deepEqual(checks.get("early-ok"), { ok: true });
    assert.deepEqual(checks.get("early-bad"), { ok: false, reason: "range" });
    assert.deepEqual(checks.get("late-ok"), { ok: true });
    assert.deepEqual(checks.get("late-bad"), { ok: false, reason: "range" });
  });

  it("checks the offset across lines and reports missing partners / bibs", () => {
    const checks = checkSpecialStarts(MODEL, [
      row("p", 310),
      row("same", 910, withRunner("p", 0)),
      row("plus", 316, withRunner("p", 90)),
      row("w", 312, withRunner("p", 15)),
      row("x", 320, withRunner("nobody", 0)),
      row("y", null, early),
      row("inactive", 50, withRunner("p", 0), { active: false }),
    ]);
    assert.deepEqual(checks.get("same"), { ok: true });
    assert.deepEqual(checks.get("plus"), { ok: true });
    assert.deepEqual(checks.get("w"), { ok: false, reason: "offset", actualSeconds: 30 });
    assert.deepEqual(checks.get("x"), { ok: false, reason: "partnerMissing" });
    assert.deepEqual(checks.get("y"), { ok: false, reason: "noBib" });
    assert.deepEqual(checks.get("inactive"), { ok: false, reason: "noBib" });
  });
});
