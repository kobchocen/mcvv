/**
 * Načtení číselníku klubů s příznakem vazby a smazání sirotků (#193). Bez importu
 * `@/lib/db/client`, aby šlo volat v transakci i z testu s vlastním klientem.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  planOrphanCleanup,
  type ClubRegistryRow,
  type OrphanCleanupPlan,
  type OrphanScope,
  validDate,
} from "./orphans";

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw"> | Prisma.TransactionClient;

/** Všechny řádky cis_klub a zda na ně odkazuje přihláška, start nebo výsledek téhož roku. */
export async function loadClubRegistry(db: Db): Promise<ClubRegistryRow[]> {
  const rows = await db.$queryRaw<
    {
      id: string;
      rok: number;
      jmeno: string;
      created: Date | null;
      autor: string | null;
      used: number | bigint;
    }[]
  >`
    SELECT k.id, k.rok, k.jmeno,
      -- legacy nulová data (0000-00-00) by driver nepřevedl na Date
      IF(k.created < '1000-01-01', NULL, k.created) AS created, k.autor,
      (EXISTS (SELECT 1 FROM mcvv_prihlaska_radek r WHERE r.klub_id = k.id AND r.rok = k.rok)
        OR EXISTS (SELECT 1 FROM mcvv_start s WHERE s.klub_id = k.id AND s.rok = k.rok)
        OR EXISTS (SELECT 1 FROM mcvv_time t WHERE t.klub_id = k.id AND t.rok = k.rok)) AS used
    FROM cis_klub k`;
  return rows.map((row) => ({
    id: row.id,
    year: Number(row.rok),
    name: row.jmeno,
    created: validDate(row.created),
    author: row.autor,
    used: Number(row.used) === 1,
  }));
}

export async function previewOrphanCleanup(
  db: Db,
  options: { scope: OrphanScope; currentYear: number },
): Promise<OrphanCleanupPlan> {
  return planOrphanCleanup(await loadClubRegistry(db), options);
}

/**
 * Smaže řádky plánu. Podmínka NOT EXISTS je i v DELETE (pojistka proti souběžné přihlášce;
 * cizí klíče by smazání odkazovaného řádku stejně nepustily). Vrací počet smazaných řádků.
 */
export async function deleteOrphanRows(
  db: Db,
  rows: readonly Pick<ClubRegistryRow, "id" | "year">[],
): Promise<number> {
  let deleted = 0;
  for (let start = 0; start < rows.length; start += 200) {
    const chunk = rows.slice(start, start + 200);
    const keys = Prisma.join(chunk.map((row) => Prisma.sql`(${row.id}, ${row.year})`));
    deleted += await db.$executeRaw`
      DELETE FROM cis_klub
      WHERE (id, rok) IN (${keys})
        AND NOT EXISTS (SELECT 1 FROM mcvv_prihlaska_radek r WHERE r.klub_id = cis_klub.id AND r.rok = cis_klub.rok)
        AND NOT EXISTS (SELECT 1 FROM mcvv_start s WHERE s.klub_id = cis_klub.id AND s.rok = cis_klub.rok)
        AND NOT EXISTS (SELECT 1 FROM mcvv_time t WHERE t.klub_id = cis_klub.id AND t.rok = cis_klub.rok)`;
  }
  return deleted;
}
