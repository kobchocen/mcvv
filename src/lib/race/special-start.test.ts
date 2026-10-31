import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkSpecialStarts,
  formatOffset,
  offsetSlots,
  parseOffset,
  type SpecialCheckRow,
  type SpecialStartSpec,
} from "./special-start";
import type { BibRange } from "./start-settings";
import { DEFAULT_START_MODEL, startSeriesForBib, startSlot } from "./start-time";
import { generateStartList, type GeneratorEntry, type GeneratorInput } from "./startlist-generator";

const MODEL = DEFAULT_START_MODEL; // interval 15 s, 2. start od 601
const RANGES: BibRange[] = [
  { categoryId: "J", bibFrom: 41, bibTo: 90 },
  { categoryId: "A", bibFrom: 301, bibTo: 380 },
  { categoryId: "K", bibFrom: 641, bibTo: 680 },
  { categoryId: "F", bibFrom: 901, bibTo: 930 },
];
const SORT = { J: 1, A: 3, K: 8, F: 10 };

let seq = 0;
function entry(partial: Partial<GeneratorEntry> & { categoryId: string }): GeneratorEntry {
  seq += 1;
  return {
    runnerId: partial.runnerId ?? `R${String(seq).padStart(7, "0")}`,
    name: partial.name ?? `Běžec ${String(seq).padStart(3, "0")}`,
    currentBib: null,
    locked: false,
    eligible: true,
    organizer: false,
    lastYearTime: null,
    groupId: null,
    groupOrder: 0,
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
  return {
    model: MODEL,
    ranges: RANGES,
    categorySort: SORT,
    champions: [],
    groups: [],
    entries,
    ...extra,
  };
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
    exempt: e.organizer,
    special: e.special ?? null,
  }));
}

const filler = (categoryId: string, count: number) =>
  Array.from({ length: count }, () => entry({ categoryId }));

describe("parseOffset / formatOffset", () => {
  it("parses minutes with an optional :ss and sign", () => {
    assert.equal(parseOffset(""), 0);
    assert.equal(parseOffset("0"), 0);
    assert.equal(parseOffset("+2"), 120);
    assert.equal(parseOffset("2"), 120);
    assert.equal(parseOffset("-1"), -60);
    assert.equal(parseOffset("−1:30"), -90);
    assert.equal(parseOffset(" +0:15 "), 15);
    assert.equal(parseOffset("30"), 1800);
  });
  it("rejects garbage and offsets above 30 minutes", () => {
    assert.equal(parseOffset("abc"), null);
    assert.equal(parseOffset("1:75"), null);
    assert.equal(parseOffset("31"), null);
    assert.equal(parseOffset("1.5"), null);
  });
  it("formats back", () => {
    assert.equal(formatOffset(0), "0");
    assert.equal(formatOffset(120), "+2:00");
    assert.equal(formatOffset(-90), "−1:30");
    assert.equal(formatOffset(15), "+0:15");
  });
  it("rounds the offset to start intervals", () => {
    assert.equal(offsetSlots(MODEL, 120), 8);
    assert.equal(offsetSlots(MODEL, 20), 1);
    assert.equal(offsetSlots(MODEL, -15), -1);
  });
});

describe("generateStartList – spec. starty", () => {
  it("treats the organizer flag like registration #1 (organizer block, category order)", () => {
    const reg1 = entry({ categoryId: "A", organizer: true, name: "Adamec" });
    const flagged = entry({ categoryId: "J", special: organizer, name: "Zelený" });
    const woman = entry({ categoryId: "K", special: organizer });
    const { bib, line } = run([reg1, flagged, woman, ...filler("A", 5)]);
    // J má menší sort než A → pořadatel s příznakem jde první.
    assert.equal(bib(flagged), 1);
    assert.equal(bib(reg1), 2);
    assert.equal(bib(woman), 601);
    assert.equal(line(flagged).reason, "organizer");
    assert.equal(line(flagged).outsideCategory, false);
  });

  it("puts early runners right after the organizers in their own start", () => {
    const org = entry({ categoryId: "A", organizer: true });
    const a = entry({ categoryId: "A", special: early, name: "Brzký A" });
    const j = entry({ categoryId: "J", special: early, name: "Brzký J" });
    const k = entry({ categoryId: "K", special: early });
    const { bib, line, result } = run([org, a, j, k, ...filler("A", 10), ...filler("K", 4)]);
    assert.equal(bib(org), 1);
    assert.equal(bib(j), 2, "category order J before A");
    assert.equal(bib(a), 3);
    assert.equal(bib(k), 601);
    assert.equal(line(a).reason, "early");
    assert.equal(line(a).outsideCategory, false, "organizer block is not 'outside category'");
    assert.equal(result.warnings.length, 0);
  });

  it("falls back to the earliest window numbers with spare capacity when the block is full", () => {
    const ranges: BibRange[] = [
      { categoryId: "J", bibFrom: 3, bibTo: 6 },
      { categoryId: "A", bibFrom: 7, bibTo: 20 },
    ];
    const orgs = [
      entry({ categoryId: "A", organizer: true }),
      entry({ categoryId: "A", organizer: true }),
    ];
    const full = filler("J", 4); // J nemá žádné volné číslo navíc
    const runner = entry({ categoryId: "A", special: early });
    const { bib, result } = run([...orgs, ...full, runner, ...filler("A", 3)], { ranges });
    assert.equal(bib(runner), 7, "skips the full J window, first A number");
    assert.equal(result.blocking, false, "no shortage caused");
    for (const j of full) {
      assert.ok(bib(j)! >= 3 && bib(j)! <= 6);
    }
  });

  it("puts late runners on the last window numbers of their start", () => {
    const j = entry({ categoryId: "J", special: late });
    const a = entry({ categoryId: "A", special: late });
    const k = entry({ categoryId: "K", special: late });
    const { bib, line } = run([j, a, k, ...filler("A", 20), ...filler("F", 5), ...filler("J", 3)]);
    assert.equal(bib(j), 379);
    assert.equal(bib(a), 380);
    assert.equal(bib(k), 930, "women start: last F number");
    assert.equal(line(a).reason, "late");
    assert.equal(line(a).outsideCategory, false);
    assert.equal(line(j).outsideCategory, true, "J runner in A window is labelled");
  });

  it("warns and places normally when no number is left for early / late", () => {
    const ranges: BibRange[] = [
      { categoryId: "J", bibFrom: 1, bibTo: 2 },
      { categoryId: "A", bibFrom: 3, bibTo: 5 },
    ];
    // Žádné okno nemá volné číslo navíc → pozdě se nedá upřednostnit, běžec jde normálně
    // do své kategorie (a tam chybí číslo – nedostatek ohlásí rozprostření kategorie).
    const runner = entry({ categoryId: "J", special: late });
    const { line, result } = run([runner, ...filler("J", 2), ...filler("A", 3)], { ranges });
    assert.notEqual(line(runner).reason, "late");
    assert.deepEqual(
      result.warnings.map((w) => w.code),
      ["specOverflow", "shortage"],
    );
  });

  it("starts 'with' at the same time in the other start for offset 0", () => {
    const partner = entry({ categoryId: "J", name: "Táta", currentBib: 50, locked: true });
    const kid = entry({ categoryId: "K", special: withRunner(partner.runnerId, 0) });
    const { bib, line, result } = run([partner, kid, ...filler("J", 10), ...filler("K", 5)]);
    assert.notEqual(startSeriesForBib(MODEL, bib(kid)!), startSeriesForBib(MODEL, bib(partner)!));
    assert.equal(startSlot(MODEL, bib(kid)!), startSlot(MODEL, bib(partner)!));
    assert.equal(line(kid).reason, "with");
    assert.equal(result.warnings.length, 0);
  });

  it("uses the nearest time and warns when the exact time has no number", () => {
    // Slot 373 (A) nemá ve 2. startu žádné okno (F končí slotem 330) → nejbližší možné číslo.
    const partner = entry({ categoryId: "A", currentBib: 373, locked: true });
    const kid = entry({ categoryId: "F", special: withRunner(partner.runnerId, 0) });
    const { bib, result } = run([partner, kid, ...filler("F", 3)]);
    assert.equal(bib(kid), 374, "slot 374 in the men's start is closer than 330 in its own");
    assert.deepEqual(result.warnings, [
      { code: "specApprox", runnerId: kid.runnerId, deviation: 1 },
    ]);
  });

  it("applies a positive or negative offset relative to the partner", () => {
    const partner = entry({ categoryId: "A", currentBib: 340, locked: true });
    const after = entry({ categoryId: "A", special: withRunner(partner.runnerId, 120) });
    const before = entry({ categoryId: "A", special: withRunner(partner.runnerId, -60) });
    const all = [partner, after, before, ...filler("A", 20)];
    const { bib, result } = run(all);
    assert.equal(startSlot(MODEL, bib(after)!) - startSlot(MODEL, bib(partner)!), 8);
    assert.equal(startSlot(MODEL, bib(before)!) - startSlot(MODEL, bib(partner)!), -4);
    const checks = checkSpecialStarts(MODEL, RANGES, checkRows(all, result));
    assert.deepEqual([...checks.values()], [{ ok: true }, { ok: true }]);
  });

  it("resolves chains (partner first) and relocates a regular runner inside its own window", () => {
    const a = entry({ categoryId: "A", runnerId: "Z0000001" });
    const b = entry({ categoryId: "A", runnerId: "A0000002", special: withRunner("Z0000001", 15) });
    const c = entry({ categoryId: "A", runnerId: "A0000001", special: withRunner("A0000002", 15) });
    // Plné okno (80 čísel, 78 běžců) → cílová čísla obsadí běžní běžci, ti se posunou.
    const all = [a, b, c, ...filler("A", 75)];
    const { bib, result } = run(all);
    assert.equal(bib(b)! - bib(a)!, 1);
    assert.equal(bib(c)! - bib(b)!, 1);
    assert.equal(result.blocking, false);
    for (const e of all) {
      assert.ok(bib(e)! >= 301 && bib(e)! <= 380, "everyone stays in the A window");
    }
  });

  it("accepts a mutual 'with' pair (cycle) when it is consistent", () => {
    const a = entry({ categoryId: "A", runnerId: "A0000010" });
    const b = entry({ categoryId: "K", runnerId: "B0000010" });
    a.special = withRunner(b.runnerId, 0);
    b.special = withRunner(a.runnerId, 0);
    const { bib, result } = run([a, b, ...filler("A", 5), ...filler("K", 5)]);
    assert.equal(startSlot(MODEL, bib(a)!), startSlot(MODEL, bib(b)!));
    assert.equal(
      result.warnings.some((w) => w.code === "specCycle"),
      false,
    );
  });

  it("warns about an inconsistent cycle", () => {
    const a = entry({ categoryId: "A", runnerId: "A0000020" });
    const b = entry({ categoryId: "A", runnerId: "B0000020" });
    a.special = withRunner(b.runnerId, 15);
    b.special = withRunner(a.runnerId, 15);
    const { result } = run([a, b, ...filler("A", 5)]);
    assert.deepEqual(
      result.warnings.filter((w) => w.code === "specCycle"),
      [{ code: "specCycle", runnerIds: ["A0000020", "B0000020"] }],
    );
  });

  it("falls back to normal placement when the partner is missing or has no number", () => {
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

  it("never moves a locked runner or a group member, only evaluates them", () => {
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

  it("lets a group anchor to an early member", () => {
    const lead = entry({ categoryId: "A", special: early, groupId: 1, groupOrder: 0 });
    const follower = entry({ categoryId: "A", groupId: 1, groupOrder: 1 });
    const { bib } = run([lead, follower, ...filler("A", 5)], {
      groups: [{ id: 1, kind: "consecutive" }],
    });
    assert.equal(bib(lead), 1);
    assert.ok(bib(follower) != null);
  });

  it("is stable: applying the proposal and re-running changes nothing", () => {
    const partner = entry({ categoryId: "A" });
    const entries = [
      partner,
      entry({ categoryId: "J", special: early }),
      entry({ categoryId: "A", special: late }),
      entry({ categoryId: "K", special: withRunner(partner.runnerId, 0) }),
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
  ): SpecialCheckRow => ({ runnerId, bib, active: true, exempt: false, special, ...extra });

  it("flags early / late / organizer violations", () => {
    const checks = checkSpecialStarts(MODEL, RANGES, [
      row("r1", 301),
      row("r2", 360),
      row("early-ok", 3, early),
      row("early-bad", 320, early),
      row("late-ok", 380, late),
      row("late-bad", 330, late),
      row("org-ok", 5, organizer),
      row("org-bad", 310, organizer),
      row("org-reg1", 400, null, { exempt: true }),
    ]);
    assert.deepEqual(checks.get("early-ok"), { ok: true });
    assert.deepEqual(checks.get("early-bad"), { ok: false, reason: "notEarliest" });
    assert.deepEqual(checks.get("late-ok"), { ok: true });
    assert.deepEqual(checks.get("late-bad"), { ok: false, reason: "notLatest" });
    assert.deepEqual(checks.get("org-ok"), { ok: true });
    assert.deepEqual(checks.get("org-bad"), { ok: false, reason: "block" });
    assert.equal(checks.has("org-reg1"), false, "exempt rows without a flag are not checked");
  });

  it("compares early / late only within the same start", () => {
    const checks = checkSpecialStarts(MODEL, RANGES, [
      row("men", 301),
      row("women-early", 641, early),
      row("women", 650),
    ]);
    assert.deepEqual(checks.get("women-early"), { ok: true });
  });

  it("reports a wrong offset with the actual value, a missing partner and a missing bib", () => {
    const checks = checkSpecialStarts(MODEL, RANGES, [
      row("p", 310),
      row("w", 312, withRunner("p", 15)),
      row("x", 320, withRunner("nobody", 0)),
      row("y", null, early),
      row("inactive", 50, withRunner("p", 0), { active: false }),
    ]);
    assert.deepEqual(checks.get("w"), { ok: false, reason: "offset", actualSeconds: 30 });
    assert.deepEqual(checks.get("x"), { ok: false, reason: "partnerMissing" });
    assert.deepEqual(checks.get("y"), { ok: false, reason: "noBib" });
    assert.deepEqual(checks.get("inactive"), { ok: false, reason: "noBib" });
  });
});
