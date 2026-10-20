import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";

import type { ObdExportData } from "./obd-export";

/**
 * Načte data exportu stejnými SQL dotazy jako legacy `data/prihl2obd.php`, aby řazení
 * (včetně kolace DB) i výběr řádků byly 1:1. Rok = rok posledního ročníku
 * (`mcvv_info ORDER BY id DESC`), stejně jako legacy.
 */
export async function loadObdExportData(): Promise<ObdExportData> {
  const { year } = await currentRaceYear();
  const [categories, clubs, runners, starts] = await Promise.all([
    prisma.$queryRaw<{ id: string; jmeno: string; rekord: number | bigint }[]>`
      SELECT id, jmeno, rekord FROM cis_mcvv_kateg ORDER BY id`,
    prisma.$queryRaw<{ id: string; jmeno: string }[]>`
      SELECT id, jmeno FROM cis_klub ORDER BY id, rok DESC`,
    prisma.$queryRaw<{ id: string; jmeno: string }[]>`
      SELECT id, jmeno FROM cis_bezec ORDER BY id`,
    prisma.$queryRaw<
      {
        bezec_id: string;
        klub_id: string;
        kateg_id: string;
        rok: number | bigint;
        cislo: number | bigint;
      }[]
    >`
      SELECT bezec_id, klub_id, kateg_id, rok, cislo FROM mcvv_prihlaska_radek
      WHERE rok = ${year} AND cislo > 0 ORDER BY cislo, kateg_id, bezec_id`,
  ]);
  return {
    year,
    categories: categories.map((row) => ({
      id: row.id,
      name: row.jmeno,
      record: Number(row.rekord),
    })),
    clubs: clubs.map((row) => ({ id: row.id, name: row.jmeno })),
    runners: runners.map((row) => ({ id: row.id, name: row.jmeno })),
    starts: starts.map((row) => ({
      runnerId: row.bezec_id,
      clubId: row.klub_id,
      categoryId: row.kateg_id,
      year: Number(row.rok),
      bib: Number(row.cislo),
    })),
  };
}

/** Běžci se startovním číslem, jejichž přihláška je zrušená (stav 0) – jen upozornění. */
export async function cancelledStartRunnerIds(year: number): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ bezec_id: string }[]>`
    SELECT r.bezec_id FROM mcvv_prihlaska_radek r
    JOIN mcvv_prihlaska p ON p.rok = r.rok AND p.id = r.prihlaska_id
    WHERE r.rok = ${year} AND r.cislo > 0 AND p.stav = 0`;
  return new Set(rows.map((row) => row.bezec_id));
}
