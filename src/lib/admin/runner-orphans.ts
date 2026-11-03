/**
 * Navázaná data běžce, seznam sirotků a jejich smazání. Bez importu `@/lib/db/client`, aby
 * šlo volat v transakci i z testu s vlastním klientem.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  emptyLinkCounts,
  RUNNER_LINK_KINDS,
  RUNNER_LINK_TABLES,
  validDate,
  type RunnerLinkCounts,
  type RunnerLinkKind,
  type RunnerOrphanRow,
} from "./runner-orphans-core";

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw"> | Prisma.TransactionClient;

/** `NOT EXISTS (…)` pro všechny vazby na běžce `alias.id` (jména tabulek jsou konstanty). */
function noLinksSql(alias: string): Prisma.Sql {
  const parts = RUNNER_LINK_KINDS.map((kind) => {
    const { table, column } = RUNNER_LINK_TABLES[kind];
    return `NOT EXISTS (SELECT 1 FROM ${table} x WHERE x.${column} = ${alias}.id)`;
  });
  return Prisma.raw(parts.join("\n        AND "));
}

/** Počty navázaných řádků jednoho běžce podle druhu vazby. */
export async function loadRunnerLinkCounts(db: Db, runnerId: string): Promise<RunnerLinkCounts> {
  const selects = RUNNER_LINK_KINDS.map((kind) => {
    const { table, column } = RUNNER_LINK_TABLES[kind];
    return Prisma.sql`(SELECT COUNT(*) FROM ${Prisma.raw(table)} WHERE ${Prisma.raw(column)} = ${runnerId}) AS ${Prisma.raw(kind)}`;
  });
  const [row] = await db.$queryRaw<Record<RunnerLinkKind, number | bigint>[]>`
    SELECT ${Prisma.join(selects)}`;
  const counts = emptyLinkCounts();
  for (const kind of RUNNER_LINK_KINDS) counts[kind] = Number(row?.[kind] ?? 0);
  return counts;
}

type RunnerSqlRow = {
  id: string;
  jmeno: string;
  statni_prislusnost: string | null;
  created: Date | null;
  autor: string | null;
};

function orphanRow(row: RunnerSqlRow): RunnerOrphanRow {
  return {
    id: row.id,
    name: row.jmeno,
    nationality: row.statni_prislusnost,
    created: validDate(row.created),
    author: row.autor,
  };
}

const RUNNER_COLUMNS = Prisma.raw(
  // legacy nulová data (0000-00-00) by driver nepřevedl na Date
  "b.id, b.jmeno, b.statni_prislusnost, IF(b.created < '1000-01-01', NULL, b.created) AS created, b.autor",
);

/** Všichni běžci bez jediné vazby (sirotci), podle jména a id. */
export async function loadRunnerOrphans(db: Db): Promise<RunnerOrphanRow[]> {
  const rows = await db.$queryRaw<RunnerSqlRow[]>`
    SELECT ${RUNNER_COLUMNS}
    FROM cis_bezec b
    WHERE ${noLinksSql("b")}
    ORDER BY b.jmeno, b.id`;
  return rows.map(orphanRow);
}

/**
 * Smaže zadané běžce, ale jen ty, kteří stále nemají žádnou vazbu (pojistka proti souběžné
 * přihlášce: řádky se nejdřív zamknou, NOT EXISTS je i v DELETE). Volat v transakci; vrací
 * stav smazaných řádků před smazáním (pro audit) a počet smazaných.
 */
export async function deleteOrphanRunners(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<{ rows: RunnerOrphanRow[]; deleted: number }> {
  if (ids.length === 0) return { rows: [], deleted: 0 };
  const rows: RunnerOrphanRow[] = [];
  let deleted = 0;
  for (let start = 0; start < ids.length; start += 200) {
    const chunk = Prisma.join(ids.slice(start, start + 200));
    const locked = await tx.$queryRaw<RunnerSqlRow[]>`
      SELECT ${RUNNER_COLUMNS} FROM cis_bezec b
      WHERE b.id IN (${chunk}) AND ${noLinksSql("b")}
      ORDER BY b.id FOR UPDATE`;
    rows.push(...locked.map(orphanRow));
    deleted += await tx.$executeRaw`
      DELETE b FROM cis_bezec b
      WHERE b.id IN (${chunk}) AND ${noLinksSql("b")}`;
  }
  return { rows, deleted };
}

/** Záznamy auditu o běžci (změny jména, státu, sloučení do něj, startovka) – jen informace. */
export async function countRunnerAuditEntries(
  db: Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient,
  runnerId: string,
): Promise<number> {
  return db.auditLog.count({
    where: {
      OR: [
        { target: `runner:${runnerId}` },
        { target: { startsWith: "startlist:", endsWith: `/${runnerId}` } },
      ],
    },
  });
}
