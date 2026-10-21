import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BibRange } from "./start-settings";
import {
  generateStartList,
  seedOrder,
  spreadIndexes,
  type GeneratorEntry,
  type GeneratorInput,
} from "./startlist-generator";
import { DEFAULT_START_MODEL, startSlot, startTimeForBib } from "./start-time";

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

function input(entries: GeneratorEntry[], extra: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    model: DEFAULT_START_MODEL,
    ranges: RANGES,
    categorySort: SORT,
    champions: [],
    groups: [],
    entries,
    ...extra,
  };
}

function bibs(result: ReturnType<typeof generateStartList>): Map<string, number | null> {
  return new Map(result.lines.map((line) => [line.runnerId, line.bib]));
}

describe("spreadIndexes", () => {
  it("spreads evenly and never repeats an index", () => {
    assert.deepEqual(spreadIndexes(5, 10), [0, 2, 4, 6, 8]);
    assert.deepEqual(spreadIndexes(3, 3), [0, 1, 2]);
    assert.deepEqual(spreadIndexes(0, 10), []);
    const idx = spreadIndexes(17, 50);
    assert.equal(new Set(idx).size, 17);
    const gaps = idx.slice(1).map((value, i) => value - idx[i]);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1);
  });
  it("caps at the number of slots", () => {
    assert.deepEqual(spreadIndexes(4, 2), [0, 1]);
  });
});

describe("seedOrder", () => {
  it("puts newcomers first (by name), then returning runners slowest → fastest", () => {
    const order = seedOrder([
      { runnerId: "1", name: "Zeman", lastYearTime: 900 },
      { runnerId: "2", name: "Adam", lastYearTime: null },
      { runnerId: "3", name: "Čermák", lastYearTime: 1100 },
      { runnerId: "4", name: "Bílý", lastYearTime: null },
      { runnerId: "5", name: "Novák", lastYearTime: 1000 },
    ]);
    assert.deepEqual(
      order.map((r) => r.name),
      ["Adam", "Bílý", "Čermák", "Novák", "Zeman"],
    );
  });
});

describe("generateStartList", () => {
  it("gives every eligible runner a unique bib inside its category window", () => {
    const entries = [
      ...Array.from({ length: 30 }, () => entry({ categoryId: "A", lastYearTime: 900 + seq })),
      ...Array.from({ length: 12 }, () => entry({ categoryId: "F" })),
      ...Array.from({ length: 20 }, () => entry({ categoryId: "J" })),
    ];
    const result = generateStartList(input(entries));
    assert.equal(result.blocking, false);
    const assigned = result.lines.map((line) => line.bib);
    assert.equal(new Set(assigned).size, entries.length);
    for (const e of entries) {
      const value = bibs(result).get(e.runnerId)!;
      const range = RANGES.find((r) => r.categoryId === e.categoryId)!;
      assert.ok(value >= range.bibFrom && value <= range.bibTo, `${value} in ${e.categoryId}`);
    }
  });

  it("spreads runners across the whole window without big gaps", () => {
    const entries = Array.from({ length: 20 }, () => entry({ categoryId: "A" }));
    const result = generateStartList(input(entries));
    const values = [...bibs(result).values()].map(Number).sort((a, b) => a - b);
    assert.equal(values[0], 301);
    assert.ok(values.at(-1)! >= 375, "last runner near the end of the window");
    const gaps = values.slice(1).map((value, i) => value - values[i]);
    assert.ok(Math.max(...gaps) <= 4);
    assert.ok(Math.min(...gaps) >= 4);
  });

  it("seeds by last year's time: newcomers first, fastest last", () => {
    const fast = entry({ categoryId: "A", name: "Rychlý", lastYearTime: 850 });
    const slow = entry({ categoryId: "A", name: "Pomalý", lastYearTime: 1300 });
    const fresh = entry({ categoryId: "A", name: "Nováček" });
    const map = bibs(generateStartList(input([fast, slow, fresh])));
    assert.ok(map.get(fresh.runnerId)! < map.get(slow.runnerId)!);
    assert.ok(map.get(slow.runnerId)! < map.get(fast.runnerId)!);
  });

  it("numbers organizers from 1 and 601 consecutively", () => {
    const orgA = entry({ categoryId: "A", organizer: true, name: "B Org" });
    const orgJ = entry({ categoryId: "J", organizer: true, name: "Z Org" });
    const orgF1 = entry({ categoryId: "F", organizer: true, name: "A Org" });
    const orgF2 = entry({ categoryId: "F", organizer: true, name: "C Org" });
    const map = bibs(generateStartList(input([orgA, orgJ, orgF1, orgF2])));
    assert.equal(map.get(orgJ.runnerId), 1, "category J sorts before A");
    assert.equal(map.get(orgA.runnerId), 2);
    assert.equal(map.get(orgF1.runnerId), 601);
    assert.equal(map.get(orgF2.runnerId), 602);
  });

  it("skips locked bibs in the organizer block", () => {
    const locked = entry({ categoryId: "A", locked: true, currentBib: 1 });
    const org = entry({ categoryId: "A", organizer: true });
    const map = bibs(generateStartList(input([locked, org])));
    assert.equal(map.get(locked.runnerId), 1);
    assert.equal(map.get(org.runnerId), 2);
  });

  it("assigns champion bibs and keeps them out of the windows", () => {
    const champ = entry({ categoryId: "A", lastYearTime: 800 });
    const champW = entry({ categoryId: "F", lastYearTime: 950 });
    const others = Array.from({ length: 5 }, () => entry({ categoryId: "A" }));
    const result = generateStartList(
      input([champ, champW, ...others], {
        champions: [
          { runnerId: champ.runnerId, bib: 400 },
          { runnerId: champW.runnerId, bib: 950 },
        ],
      }),
    );
    const map = bibs(result);
    assert.equal(map.get(champ.runnerId), 400);
    assert.equal(map.get(champW.runnerId), 950);
    assert.equal(startTimeForBib(DEFAULT_START_MODEL, 400), "11:54:45");
  });

  it("preserves locked bibs on re-run and never reuses them", () => {
    const entries = Array.from({ length: 10 }, () => entry({ categoryId: "J" }));
    const first = generateStartList(input(entries));
    const firstMap = bibs(first);
    const lockedOne = { ...entries[3], locked: true, currentBib: 42 };
    const rerunEntries = entries.map((e) =>
      e.runnerId === lockedOne.runnerId
        ? lockedOne
        : { ...e, currentBib: firstMap.get(e.runnerId)! },
    );
    const second = generateStartList(input(rerunEntries));
    const map = bibs(second);
    assert.equal(map.get(lockedOne.runnerId), 42);
    const values = [...map.values()];
    assert.equal(values.filter((v) => v === 42).length, 1);
    assert.equal(new Set(values).size, values.length);
  });

  it("is deterministic: running twice yields the same proposal and no changes", () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry({ categoryId: i % 2 ? "A" : "F", lastYearTime: i % 3 ? 1000 + i : null }),
    );
    const first = generateStartList(input(entries));
    const saved = entries.map((e) => ({
      ...e,
      currentBib: first.lines.find((l) => l.runnerId === e.runnerId)!.bib,
    }));
    const second = generateStartList(input(saved));
    assert.equal(second.changed, 0);
  });

  it("reports a shortage and blocks saving", () => {
    const entries = Array.from({ length: 32 }, () => entry({ categoryId: "F" }));
    const result = generateStartList(input(entries));
    assert.equal(result.blocking, true);
    assert.deepEqual(result.warnings[0], {
      code: "shortage",
      categoryId: "F",
      runners: 32,
      slots: 30,
    });
  });

  it("reports runners of a category without a range", () => {
    const result = generateStartList(input([entry({ categoryId: "X" })]));
    assert.equal(result.blocking, true);
    assert.equal(result.warnings[0].code, "noRange");
  });

  it("removes unlocked bibs of ineligible lines and keeps locked ones", () => {
    const unpaid = entry({ categoryId: "A", eligible: false, currentBib: 305 });
    const unpaidLocked = entry({ categoryId: "A", eligible: false, currentBib: 301, locked: true });
    const ok = entry({ categoryId: "A" });
    const map = bibs(generateStartList(input([unpaid, unpaidLocked, ok])));
    assert.equal(map.get(unpaid.runnerId), null);
    assert.equal(map.get(unpaidLocked.runnerId), 301);
    assert.notEqual(map.get(ok.runnerId), 301);
  });

  it("keeps a joint start group at the same start time across both starts", () => {
    const men = Array.from({ length: 40 }, (_, i) =>
      entry({ categoryId: "A", lastYearTime: 900 + i }),
    );
    const women = Array.from({ length: 20 }, (_, i) =>
      entry({ categoryId: "F", lastYearTime: 1000 + i }),
    );
    const husband = { ...men[5], groupId: 1, groupOrder: 0 };
    const wife = { ...women[17], groupId: 1, groupOrder: 1 };
    const all = [
      ...men.map((m) => (m.runnerId === husband.runnerId ? husband : m)),
      ...women.map((w) => (w.runnerId === wife.runnerId ? wife : w)),
    ];
    const result = generateStartList(input(all, { groups: [{ id: 1, kind: "joint" }] }));
    const map = bibs(result);
    const a = map.get(husband.runnerId)!;
    const b = map.get(wife.runnerId)!;
    assert.equal(startTimeForBib(DEFAULT_START_MODEL, a), startTimeForBib(DEFAULT_START_MODEL, b));
    assert.equal(new Set(map.values()).size, all.length);
    for (const e of all) {
      const value = map.get(e.runnerId)!;
      const range = RANGES.find((r) => r.categoryId === e.categoryId)!;
      assert.ok(value >= range.bibFrom && value <= range.bibTo);
    }
    assert.ok(!result.warnings.some((w) => w.code === "groupApprox"));
  });

  it("keeps a consecutive group adjacent in time", () => {
    const juniors = Array.from({ length: 20 }, () => entry({ categoryId: "J" }));
    const group = [juniors[2], juniors[10], juniors[18]].map((e, k) => ({
      ...e,
      groupId: 7,
      groupOrder: k,
    }));
    const all = juniors.map((e) => group.find((g) => g.runnerId === e.runnerId) ?? e);
    const map = bibs(generateStartList(input(all, { groups: [{ id: 7, kind: "consecutive" }] })));
    const slots = group.map((g) => startSlot(DEFAULT_START_MODEL, map.get(g.runnerId)!));
    assert.deepEqual(slots, [slots[0], slots[0] + 1, slots[0] + 2]);
    assert.equal(new Set(map.values()).size, all.length);
  });

  it("anchors a group to a locked member", () => {
    const locked = entry({ categoryId: "A", locked: true, currentBib: 320, groupId: 3 });
    const partner = entry({ categoryId: "F", groupId: 3, groupOrder: 1 });
    const filler = Array.from({ length: 10 }, () => entry({ categoryId: "F" }));
    const map = bibs(
      generateStartList(
        input([locked, partner, ...filler], { groups: [{ id: 3, kind: "joint" }] }),
      ),
    );
    assert.equal(map.get(locked.runnerId), 320);
    assert.equal(map.get(partner.runnerId), 920, "same start time as 320 (11:34:45)");
  });

  it("moves a partner to another start or window when the own window has no matching time", () => {
    const locked = entry({ categoryId: "A", locked: true, currentBib: 350, groupId: 4 });
    const partner = entry({ categoryId: "F", groupId: 4, groupOrder: 1 });
    const result = generateStartList(
      input([locked, partner], { groups: [{ id: 4, kind: "joint" }] }),
    );
    // 950 (stejný čas jako 350) je číslo obhájkyně mimo okna → nejbližší čas, okno A.
    const value = bibs(result).get(partner.runnerId)!;
    assert.ok(value === 349 || value === 351, `got ${value}`);
    assert.equal(result.lines.find((l) => l.runnerId === partner.runnerId)!.outsideCategory, true);
    assert.deepEqual(
      result.warnings.find((w) => w.code === "groupApprox"),
      { code: "groupApprox", groupId: 4, deviation: 1 },
    );
  });

  describe("groups across categories (categories are not set in stone)", () => {
    const inWindow = (categoryId: string, value: number) => {
      const range = RANGES.find((r) => r.categoryId === categoryId)!;
      return value >= range.bibFrom && value <= range.bibTo;
    };
    const line = (result: ReturnType<typeof generateStartList>, runnerId: string) =>
      result.lines.find((l) => l.runnerId === runnerId)!;

    it("starts a family of 3 from 3 categories together (joint start)", () => {
      const fillA = Array.from({ length: 40 }, (_, i) =>
        entry({ categoryId: "A", lastYearTime: 900 + i }),
      );
      const fillF = Array.from({ length: 20 }, () => entry({ categoryId: "F" }));
      const fillJ = Array.from({ length: 20 }, () => entry({ categoryId: "J" }));
      const dad = entry({ categoryId: "A", lastYearTime: 850, groupId: 5, groupOrder: 0 });
      const mum = entry({ categoryId: "F", lastYearTime: 1200, groupId: 5, groupOrder: 1 });
      const son = entry({ categoryId: "J", groupId: 5, groupOrder: 2 });
      const all = [...fillA, ...fillF, ...fillJ, dad, mum, son];
      const result = generateStartList(input(all, { groups: [{ id: 5, kind: "joint" }] }));
      const map = bibs(result);
      const slots = [dad, mum, son].map((e) =>
        startSlot(DEFAULT_START_MODEL, map.get(e.runnerId)!),
      );
      // Dva paralelní starty: dva na stejný čas, třetí hned za nimi.
      assert.ok(Math.max(...slots) - Math.min(...slots) <= 1, `slots ${slots}`);
      assert.equal(new Set(slots).size, 2);
      assert.ok(!result.warnings.some((w) => w.code === "groupApprox"));
      // Hostitel = nejlépe nasazený (táta, kategorie A) zůstává ve svém okně.
      assert.ok(inWindow("A", map.get(dad.runnerId)!));
      assert.equal(line(result, dad.runnerId).outsideCategory, false);
      // Syn (J) nemá v okně J odpovídající čas → startuje z okna jiné kategorie.
      assert.equal(line(result, son.runnerId).outsideCategory, true);
      assert.equal(line(result, son.runnerId).reason, "group");
      assert.equal(new Set(map.values()).size, all.length);
      for (const e of [...fillA, ...fillF, ...fillJ]) {
        assert.ok(inWindow(e.categoryId, map.get(e.runnerId)!), `${e.categoryId} stays in window`);
      }
      assert.equal(result.blocking, false);
      // Opakovaný návrh nad uloženými čísly nic nemění.
      const saved = all.map((e) => ({ ...e, currentBib: map.get(e.runnerId)! }));
      const again = generateStartList(input(saved, { groups: [{ id: 5, kind: "joint" }] }));
      assert.equal(again.changed, 0);
    });

    it("lets friends from 2 categories start right after each other (consecutive)", () => {
      const fillA = Array.from({ length: 30 }, (_, i) =>
        entry({ categoryId: "A", lastYearTime: 900 + i }),
      );
      const fillJ = Array.from({ length: 20 }, () => entry({ categoryId: "J" }));
      const junior = entry({ categoryId: "J", groupId: 6, groupOrder: 0 });
      const adult = entry({ categoryId: "A", lastYearTime: 850, groupId: 6, groupOrder: 1 });
      const all = [...fillA, ...fillJ, junior, adult];
      const result = generateStartList(input(all, { groups: [{ id: 6, kind: "consecutive" }] }));
      const map = bibs(result);
      const a = map.get(junior.runnerId)!;
      const b = map.get(adult.runnerId)!;
      assert.equal(startSlot(DEFAULT_START_MODEL, b), startSlot(DEFAULT_START_MODEL, a) + 1);
      // Většina nerozhoduje (1 : 1) → nejlépe nasazený (A) je hostitel, junior jde k němu.
      assert.ok(inWindow("A", b));
      assert.ok(inWindow("A", a), `junior moved into the A window, got ${a}`);
      assert.equal(line(result, junior.runnerId).outsideCategory, true);
      assert.equal(new Set(map.values()).size, all.length);
      for (const e of [...fillA, ...fillJ]) {
        assert.ok(inWindow(e.categoryId, map.get(e.runnerId)!));
      }
      assert.deepEqual(result.warnings, []);
    });

    it("follows the majority category of the group", () => {
      const fillJ = Array.from({ length: 10 }, () => entry({ categoryId: "J" }));
      const kids = [0, 1].map((k) => entry({ categoryId: "J", groupId: 8, groupOrder: k }));
      const coach = entry({ categoryId: "A", lastYearTime: 700, groupId: 8, groupOrder: 2 });
      const all = [...fillJ, ...kids, coach];
      const result = generateStartList(input(all, { groups: [{ id: 8, kind: "consecutive" }] }));
      const map = bibs(result);
      for (const kid of kids) {
        assert.ok(inWindow("J", map.get(kid.runnerId)!));
      }
      const slots = [...kids, coach].map((e) =>
        startSlot(DEFAULT_START_MODEL, map.get(e.runnerId)!),
      );
      assert.deepEqual(slots, [slots[0], slots[0] + 1, slots[0] + 2]);
      assert.equal(line(result, coach.runnerId).outsideCategory, true);
    });

    it("works around locked bibs, organizers and champion bibs 400/950", () => {
      const orgA = entry({ categoryId: "A", organizer: true });
      const orgF = entry({ categoryId: "F", organizer: true });
      const champM = entry({ categoryId: "A", lastYearTime: 800 });
      const champW = entry({ categoryId: "F", lastYearTime: 900 });
      const lockJ = entry({ categoryId: "J", locked: true, currentBib: 51 });
      const lockedK = entry({
        categoryId: "K",
        locked: true,
        currentBib: 650,
        groupId: 9,
        groupOrder: 0,
      });
      const friendA = entry({ categoryId: "A", lastYearTime: 1000, groupId: 9, groupOrder: 1 });
      const friendJ = entry({ categoryId: "J", groupId: 9, groupOrder: 2 });
      const fill = ["J", "A", "K"].flatMap((categoryId) =>
        Array.from({ length: 10 }, () => entry({ categoryId })),
      );
      const all = [orgA, orgF, champM, champW, lockJ, lockedK, friendA, friendJ, ...fill];
      const result = generateStartList(
        input(all, {
          champions: [
            { runnerId: champM.runnerId, bib: 400 },
            { runnerId: champW.runnerId, bib: 950 },
          ],
          groups: [{ id: 9, kind: "consecutive" }],
        }),
      );
      const map = bibs(result);
      assert.equal(map.get(orgA.runnerId), 1);
      assert.equal(map.get(orgF.runnerId), 601);
      assert.equal(map.get(champM.runnerId), 400);
      assert.equal(map.get(champW.runnerId), 950);
      assert.equal(map.get(lockJ.runnerId), 51);
      assert.equal(map.get(lockedK.runnerId), 650);
      // Kotva = zamčený člen (čas 50). Čas 51 v 1. startu drží zamčený cizí běžec → 651 (okno K).
      assert.equal(map.get(friendA.runnerId), 651);
      assert.equal(map.get(friendJ.runnerId), 52);
      assert.equal(line(result, friendA.runnerId).outsideCategory, true);
      assert.equal(line(result, friendJ.runnerId).outsideCategory, false);
      assert.equal(line(result, champM.runnerId).outsideCategory, false);
      assert.equal(line(result, orgA.runnerId).outsideCategory, false);
      assert.deepEqual(result.warnings, []);
      assert.equal(new Set(map.values()).size, all.length);
      for (const e of fill) {
        assert.ok(inWindow(e.categoryId, map.get(e.runnerId)!));
      }
    });

    it("never moves a champion; the partner gets as close as the windows allow", () => {
      const champM = entry({ categoryId: "A", lastYearTime: 800, groupId: 10, groupOrder: 0 });
      const daughter = entry({ categoryId: "F", groupId: 10, groupOrder: 1 });
      const result = generateStartList(
        input([champM, daughter], {
          champions: [{ runnerId: champM.runnerId, bib: 400 }],
          groups: [{ id: 10, kind: "joint" }],
        }),
      );
      const map = bibs(result);
      assert.equal(map.get(champM.runnerId), 400);
      // Rezervu (381–399, 401+) generátor nepřiděluje → nejbližší čas je konec okna A.
      assert.equal(map.get(daughter.runnerId), 380);
      assert.equal(result.warnings.find((w) => w.code === "groupApprox")?.groupId, 10);
    });
  });
});
