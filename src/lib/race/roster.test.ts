import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ENTRY_STATUS } from "@/lib/entries/status-codes";

import { loadRoster, rosterHasBib, type Db } from "./roster";

/* Syntetická data (žádní skuteční účastníci). */
type Line = {
  year: number;
  runnerId: string;
  bib: number | null;
  registrationId: number;
  categoryId: string;
  clubId: string;
  entryFee: number | null;
};

const YEAR = 2026;
const registrations = [
  { year: YEAR, id: 1, status: ENTRY_STATUS.paid },
  { year: YEAR, id: 2, status: ENTRY_STATUS.unpaid }, // dohláška čeká na platbu
  { year: YEAR, id: 3, status: ENTRY_STATUS.cancelled },
  { year: YEAR, id: 4, status: ENTRY_STATUS.confirmed },
  { year: YEAR, id: 5, status: ENTRY_STATUS.unpaid }, // zaplaceno, uložený stav zastaralý
  { year: YEAR, id: 6, status: ENTRY_STATUS.paid }, // 0 Kč
];
const lines: Line[] = [
  {
    year: YEAR,
    runnerId: "90000001",
    bib: 11,
    registrationId: 1,
    categoryId: "H",
    clubId: "TST",
    entryFee: 300,
  },
  {
    year: YEAR,
    runnerId: "90000002",
    bib: 12,
    registrationId: 2,
    categoryId: "H",
    clubId: "TST",
    entryFee: 300,
  },
  {
    year: YEAR,
    runnerId: "90000003",
    bib: 13,
    registrationId: 3,
    categoryId: "D",
    clubId: "TST",
    entryFee: 300,
  },
  {
    year: YEAR,
    runnerId: "90000004",
    bib: 14,
    registrationId: 4,
    categoryId: "D",
    clubId: "TST",
    entryFee: 300,
  },
  {
    year: YEAR,
    runnerId: "90000005",
    bib: 15,
    registrationId: 5,
    categoryId: "D",
    clubId: "TST",
    entryFee: 300,
  },
  {
    year: YEAR,
    runnerId: "90000006",
    bib: 16,
    registrationId: 6,
    categoryId: "M",
    clubId: "TST",
    entryFee: 0,
  },
  {
    year: YEAR,
    runnerId: "90000007",
    bib: null,
    registrationId: 1,
    categoryId: "M",
    clubId: "TST",
    entryFee: 0,
  },
];
const payments = [
  { year: YEAR, registrationId: "1", amount: 300 },
  { year: YEAR, registrationId: "2", amount: 100 },
  { year: YEAR, registrationId: "005", amount: 300 },
];

type BibWhere = number | { gt?: number; gte?: number; lt?: number; in?: number[] };
function bibMatches(bib: number | null, where: BibWhere | undefined): boolean {
  if (where === undefined) return true;
  if (bib == null) return false;
  if (typeof where === "number") return bib === where;
  return (
    (where.gt === undefined || bib > where.gt) &&
    (where.gte === undefined || bib >= where.gte) &&
    (where.lt === undefined || bib < where.lt) &&
    (where.in === undefined || where.in.includes(bib))
  );
}

const fake = {
  registrationLine: {
    findMany: async ({ where }: { where: { year: number; bib?: BibWhere } }) =>
      lines
        .filter((line) => line.year === where.year && bibMatches(line.bib, where.bib))
        .map((line) => ({
          ...line,
          runner: { name: `Běžec ${line.runnerId.slice(-1)}` },
          club: { name: "Testovací klub" },
        })),
  },
  registration: {
    findMany: async ({ where }: { where: { year: number; id?: { in: number[] } } }) =>
      registrations
        .filter((reg) => reg.year === where.year && (!where.id || where.id.in.includes(reg.id)))
        .map((reg) => ({
          ...reg,
          lines: lines
            .filter((line) => line.registrationId === reg.id)
            .map((line) => ({ entryFee: line.entryFee, category: { entryFee: 300 } })),
        })),
  },
  payment: {
    findMany: async ({ where }: { where: { year: number } }) =>
      payments.filter((payment) => payment.year === where.year),
  },
} as unknown as Db;

describe("startovka = jen zaplacené přihlášky s číslem", () => {
  it("loadRoster skips unpaid and cancelled entries and lines without a bib", async () => {
    const roster = await loadRoster(YEAR, { db: fake });
    assert.deepEqual(
      roster.map((entry) => entry.bib),
      [11, 14, 15, 16],
    );
    assert.equal(roster[0]!.runnerName, "Běžec 1");
    assert.equal(roster[0]!.clubName, "Testovací klub");
  });

  it("loadRoster filters a bib range (start corridor)", async () => {
    const roster = await loadRoster(YEAR, { db: fake, bib: { gte: 14, lt: 16 } });
    assert.deepEqual(
      roster.map((entry) => entry.bib),
      [14, 15],
    );
  });

  it("rosterHasBib: paid yes, unpaid / cancelled / free bib no", async () => {
    assert.equal(await rosterHasBib(fake, YEAR, 11), true);
    assert.equal(await rosterHasBib(fake, YEAR, 12), false);
    assert.equal(await rosterHasBib(fake, YEAR, 13), false);
    assert.equal(await rosterHasBib(fake, YEAR, 15), true);
    assert.equal(await rosterHasBib(fake, YEAR, 99), false);
    assert.equal(await rosterHasBib(fake, YEAR, 0), false);
  });
});
