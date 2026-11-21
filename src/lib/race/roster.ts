import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { validRegistrationIds } from "@/lib/entries/status";

/**
 * Startovka ročníku = jediný zdroj pro živé moduly, veřejnou startovku i tisk (varianta A).
 *
 * Řádek přihlášky s číslem (`mcvv_prihlaska_radek.cislo > 0`) na **zaplacené** přihlášce
 * (`isEntryValid`: nezrušená, s běžci a zaplacená, potvrzená pořadatelem nebo za 0 Kč).
 * Nezaplacená přihláška do startovky nikdy nepatří, i když má číslo (Pavel, 21. 11. 2026).
 * `mcvv_start` je od ročníku 2026 jen archiv starších ročníků (viz `ROSTER_SINCE`).
 */
export type Db = Prisma.TransactionClient | typeof prisma;

/** Od tohoto ročníku je startovka z přihlášek; starší ročníky mají archiv v `mcvv_start`. */
export const ROSTER_SINCE = 2026;

export type RosterEntry = {
  bib: number;
  runnerId: string;
  runnerName: string;
  clubId: string;
  clubName: string;
  categoryId: string;
  registrationId: number;
};

export type BibRange = { gte?: number; lt?: number; in?: number[] };

/** Startovka ročníku (jen zaplacené přihlášky s číslem), seřazená podle čísla. */
export async function loadRoster(
  year: number,
  options: { db?: Db; bib?: BibRange } = {},
): Promise<RosterEntry[]> {
  const db = options.db ?? prisma;
  const [lines, valid] = await Promise.all([
    db.registrationLine.findMany({
      where: { year, bib: { gt: 0, ...options.bib } },
      select: {
        bib: true,
        runnerId: true,
        clubId: true,
        categoryId: true,
        registrationId: true,
        runner: { select: { name: true } },
        club: { select: { name: true } },
      },
      orderBy: [{ bib: "asc" }, { runnerId: "asc" }],
    }),
    validRegistrationIds(year, db),
  ]);
  return lines
    .filter((line) => valid.has(line.registrationId))
    .map((line) => ({
      bib: line.bib!,
      runnerId: line.runnerId,
      runnerName: line.runner.name,
      clubId: line.clubId,
      clubName: line.club.name,
      categoryId: line.categoryId,
      registrationId: line.registrationId,
    }));
}

/** Počet běžců ve startovce ročníku. */
export async function countRoster(year: number): Promise<number> {
  return (await loadRoster(year)).length;
}

/** Je číslo ve startovce ročníku? (Jedno číslo – kontroluje jen přihlášky s tímto číslem.) */
export async function rosterHasBib(db: Db, year: number, bib: number): Promise<boolean> {
  if (!Number.isInteger(bib) || bib < 1) return false;
  const lines = await db.registrationLine.findMany({
    where: { year, bib },
    select: { registrationId: true },
  });
  if (lines.length === 0) return false;
  const ids = [...new Set(lines.map((line) => line.registrationId))];
  const valid = await validRegistrationIds(year, db, ids);
  return ids.some((id) => valid.has(id));
}

/**
 * Čísla běžců ročníku pro výsledky a tombolu: od `ROSTER_SINCE` ze startovky (přihlášky),
 * starší ročníky z archivu `mcvv_start`.
 */
export async function yearStartEntries(
  year: number,
  bibs?: number[],
): Promise<Omit<RosterEntry, "registrationId">[]> {
  if (year >= ROSTER_SINCE) {
    return loadRoster(year, bibs ? { bib: { in: bibs } } : {});
  }
  const rows = await prisma.startEntry.findMany({
    where: { year, bib: bibs ? { in: bibs } : { gt: 0 } },
    select: {
      bib: true,
      runnerId: true,
      runnerName: true,
      clubId: true,
      clubName: true,
      categoryId: true,
      runner: { select: { name: true } },
      club: { select: { name: true } },
    },
    orderBy: { bib: "asc" },
  });
  return rows.map((row) => ({
    bib: row.bib,
    runnerId: row.runnerId,
    runnerName: row.runnerName || row.runner.name,
    clubId: row.clubId,
    clubName: row.clubName || row.club.name,
    categoryId: row.categoryId,
  }));
}
