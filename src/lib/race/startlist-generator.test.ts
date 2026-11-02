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
import { DEFAULT_START_MODEL, startTimeForBib } from "./start-time";

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
    lastYearTime: null,
    ...partial,
  };
}

function input(entries: GeneratorEntry[], extra: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    model: DEFAULT_START_MODEL,
    ranges: RANGES,
    categorySort: SORT,
    champions: [],
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

  it("numbers organizers (spec. start) from 1 and 601 consecutively", () => {
    const org = { kind: "organizer", partnerId: null, offsetSeconds: 0 } as const;
    const orgA = entry({ categoryId: "A", special: org, name: "B Org" });
    const orgJ = entry({ categoryId: "J", special: org, name: "Z Org" });
    const orgF1 = entry({ categoryId: "F", special: org, name: "A Org" });
    const orgF2 = entry({ categoryId: "F", special: org, name: "C Org" });
    const plain = entry({ categoryId: "A", name: "A Plain" });
    const map = bibs(generateStartList(input([orgA, orgJ, orgF1, orgF2, plain])));
    assert.equal(map.get(orgJ.runnerId), 1, "category J sorts before A");
    assert.equal(map.get(orgA.runnerId), 2);
    assert.equal(map.get(orgF1.runnerId), 601);
    assert.equal(map.get(orgF2.runnerId), 602);
    assert.equal(map.get(plain.runnerId), 301, "no implicit organizer (Q220)");
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
});
