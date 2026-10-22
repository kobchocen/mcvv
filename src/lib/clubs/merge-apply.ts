/**
 * Applying a club merge to the database (#104, Q45): see `planClubMerge` for the rules.
 * Called inside one transaction (`tx`); nothing here commits on its own. No `@/lib/db/client`
 * import, so the integration test can pass its own client.
 */
import { Prisma } from "@prisma/client";

import { clubKey } from "./core";
import { planClubMerge, type ClubMergeError, type ClubYearRow } from "./merge";

type Db = Prisma.TransactionClient;

/** Tables with a club id (`klub_id`, `rok` → cis_klub). Their key is (rok, bezec_id). */
export const CLUB_ROW_TABLES = ["mcvv_prihlaska_radek", "mcvv_start", "mcvv_time"] as const;
export type ClubRowTable = (typeof CLUB_ROW_TABLES)[number];

/** Key of one row in a club row table: [rok, bezec_id]. */
export type ClubRowKey = [number, string];

type ClubRowState = Record<ClubRowTable, ClubRowKey[]>;

/** Counts shown before confirming and stored in the audit entry. */
export type ClubMergeCounts = Record<ClubRowTable, number> & {
  cisKlubMoved: number;
  cisKlubDropped: number;
  cisKlubCreated: number;
  rejectedPairs: number;
};

export type ClubMergePreview = {
  mainId: string;
  otherId: string;
  mainName: string;
  otherName: string;
  moveYears: { year: number; name: string }[];
  /** Collision editions: the merged id's name that disappears and the main id's name kept. */
  dropYears: { year: number; name: string; mainName: string }[];
  createYears: { year: number; name: string }[];
  counts: ClubMergeCounts;
};

/**
 * Audit detail of a merge: the full before-state, enough to reconstruct the merge by hand
 * (set `klub_id` back to `merged` for the listed row keys, re-insert the cis_klub rows).
 */
export type ClubMergeAuditDetail = {
  version: 1;
  source: "admin" | "migration";
  main: string;
  merged: string;
  counts: ClubMergeCounts;
  cisKlub: {
    /** Rows of the merged id that now belong to the main id (same edition and name). */
    moved: AuditClubRow[];
    /** Rows of the merged id deleted because the main id has the edition (collision). */
    dropped: AuditClubRow[];
    /** Rows of the main id created for editions that had no cis_klub row at all. */
    created: { rok: number; jmeno: string }[];
  };
  /** Keys [rok, bezec_id] of the rows whose klub_id changed from `merged` to `main`. */
  rows: Record<ClubRowTable, ClubRowKey[]>;
  /** Rejected suggestions with the merged id, deleted (the id no longer exists). */
  rejectedPairs: [string, string][];
};

type AuditClubRow = { rok: number; jmeno: string; created: string | null; autor: string | null };

type State = {
  mainRows: ClubYearRow[];
  otherRows: ClubYearRow[];
  rows: ClubRowState;
  rejected: [string, string][];
};

async function clubRows(db: Db, id: string, lock: boolean): Promise<ClubYearRow[]> {
  const rows = await db.$queryRaw<
    { rok: number; jmeno: string; created: string | null; autor: string | null }[]
  >`SELECT rok, jmeno, CAST(created AS CHAR) AS created, autor FROM cis_klub
    WHERE id = ${id} ORDER BY rok ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;
  return rows.map((row) => ({
    year: Number(row.rok),
    name: row.jmeno,
    created: row.created,
    author: row.autor,
  }));
}

async function rowKeys(
  db: Db,
  table: ClubRowTable,
  id: string,
  lock: boolean,
): Promise<ClubRowKey[]> {
  const rows = await db.$queryRaw<{ rok: number; bezec_id: string }[]>`
    SELECT rok, bezec_id FROM ${Prisma.raw(`\`${table}\``)} WHERE klub_id = ${id}
    ORDER BY rok, bezec_id ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;
  return rows.map((row) => [Number(row.rok), row.bezec_id]);
}

async function loadState(db: Db, mainId: string, otherId: string, lock: boolean): Promise<State> {
  // Sequential: one connection inside a transaction.
  const mainRows = await clubRows(db, mainId, lock);
  const otherRows = await clubRows(db, otherId, lock);
  const rows = {} as ClubRowState;
  for (const table of CLUB_ROW_TABLES) rows[table] = await rowKeys(db, table, otherId, lock);
  const rejected = await db.clubMergeRejection.findMany({
    where: { OR: [{ clubIdA: otherId }, { clubIdB: otherId }] },
    select: { clubIdA: true, clubIdB: true },
  });
  return {
    mainRows,
    otherRows,
    rows,
    rejected: rejected.map((row) => [row.clubIdA, row.clubIdB]),
  };
}

function planFor(mainId: string, otherId: string, state: State) {
  return planClubMerge({
    mainId,
    otherId,
    mainRows: state.mainRows,
    otherRows: state.otherRows,
    rowYears: CLUB_ROW_TABLES.flatMap((table) => state.rows[table].map(([year]) => year)),
  });
}

function countsOf(
  state: State,
  plan: { moveYears: number[]; dropYears: number[]; createYears: unknown[] },
): ClubMergeCounts {
  return {
    mcvv_prihlaska_radek: state.rows.mcvv_prihlaska_radek.length,
    mcvv_start: state.rows.mcvv_start.length,
    mcvv_time: state.rows.mcvv_time.length,
    cisKlubMoved: plan.moveYears.length,
    cisKlubDropped: plan.dropYears.length,
    cisKlubCreated: plan.createYears.length,
    rejectedPairs: state.rejected.length,
  };
}

const newestName = (rows: readonly ClubYearRow[]) =>
  [...rows].sort((a, b) => b.year - a.year)[0]?.name.trim() ?? "";

/** What a merge would change (read only), for the confirmation in the admin. */
export async function previewClubMerge(
  db: Db,
  mainIdRaw: string,
  otherIdRaw: string,
): Promise<{ ok: true; preview: ClubMergePreview } | { ok: false; error: ClubMergeError }> {
  const mainId = clubKey(mainIdRaw);
  const otherId = clubKey(otherIdRaw);
  const state = await loadState(db, mainId, otherId, false);
  const plan = planFor(mainId, otherId, state);
  if (!plan.ok) return plan;
  const nameIn = (rows: ClubYearRow[], year: number) =>
    rows.find((row) => row.year === year)?.name.trim() ?? "";
  return {
    ok: true,
    preview: {
      mainId: plan.mainId,
      otherId: plan.otherId,
      mainName: newestName(state.mainRows),
      otherName: newestName(state.otherRows),
      moveYears: plan.moveYears.map((year) => ({ year, name: nameIn(state.otherRows, year) })),
      dropYears: plan.dropYears.map((year) => ({
        year,
        name: nameIn(state.otherRows, year),
        mainName: nameIn(state.mainRows, year),
      })),
      createYears: plan.createYears,
      counts: countsOf(state, plan),
    },
  };
}

/**
 * Merges `otherId` into `mainId` inside the transaction `tx`: rewrites klub_id in all club
 * row tables, moves / drops / creates cis_klub rows (see `planClubMerge`), deletes rejected
 * suggestions with the merged id. Returns the audit detail; the caller writes it in the same
 * transaction. Throws when rows of the merged id remain (the transaction rolls back).
 */
export async function applyClubMerge(
  tx: Db,
  input: { mainId: string; otherId: string; author: string; source?: "admin" | "migration" },
): Promise<{ ok: true; detail: ClubMergeAuditDetail } | { ok: false; error: ClubMergeError }> {
  const mainKey = clubKey(input.mainId);
  const otherKey = clubKey(input.otherId);
  // Lock both ids' cis_klub rows (and the gap: no new edition row meanwhile) and their rows.
  const state = await loadState(tx, mainKey, otherKey, true);
  const plan = planFor(mainKey, otherKey, state);
  if (!plan.ok) return plan;
  const { mainId, otherId } = plan;
  const author = input.author.slice(0, 64);

  // 1) Editions with rows but no cis_klub row at all: the main id gets a row (FK target).
  if (plan.createYears.length > 0) {
    await tx.club.createMany({
      data: plan.createYears.map(({ year, name }) => ({
        id: mainId,
        year,
        name,
        created: new Date(),
        author,
      })),
    });
  }
  // 2) Editions only the merged id has: the row becomes the main id's row. ON UPDATE CASCADE
  //    moves the entries / starts / results of those editions with it.
  if (plan.moveYears.length > 0) {
    await tx.$executeRaw`UPDATE cis_klub SET id = ${mainId}
      WHERE id = ${otherId} AND rok IN (${Prisma.join(plan.moveYears)})`;
  }
  // 3) The remaining rows (collision editions and editions from step 1) get the main id.
  for (const table of CLUB_ROW_TABLES) {
    await tx.$executeRaw`UPDATE ${Prisma.raw(`\`${table}\``)} SET klub_id = ${mainId}
      WHERE klub_id = ${otherId}`;
  }
  // 4) Collision editions: the merged id's row goes (the main id's row and name stay).
  await tx.$executeRaw`DELETE FROM cis_klub WHERE id = ${otherId}`;
  // 5) Rejected suggestions with the merged id refer to an id that no longer exists.
  await tx.clubMergeRejection.deleteMany({
    where: { OR: [{ clubIdA: otherId }, { clubIdB: otherId }] },
  });

  // The merged id must be gone everywhere.
  for (const table of ["cis_klub", ...CLUB_ROW_TABLES] as const) {
    const column = table === "cis_klub" ? "id" : "klub_id";
    const [left] = await tx.$queryRaw<{ n: bigint | number }[]>`SELECT COUNT(*) AS n
      FROM ${Prisma.raw(`\`${table}\``)} WHERE ${Prisma.raw(column)} = ${otherId}`;
    if (Number(left?.n ?? 0) !== 0) {
      throw new Error(`club merge ${otherId} -> ${mainId}: rows left in ${table}`);
    }
  }

  const audit = (row: ClubYearRow): AuditClubRow => ({
    rok: row.year,
    jmeno: row.name,
    created: row.created,
    autor: row.author,
  });
  const drop = new Set(plan.dropYears);
  return {
    ok: true,
    detail: {
      version: 1,
      source: input.source ?? "admin",
      main: mainId,
      merged: otherId,
      counts: countsOf(state, plan),
      cisKlub: {
        moved: state.otherRows.filter((row) => !drop.has(row.year)).map(audit),
        dropped: state.otherRows.filter((row) => drop.has(row.year)).map(audit),
        created: plan.createYears.map(({ year, name }) => ({ rok: year, jmeno: name })),
      },
      rows: state.rows,
      rejectedPairs: state.rejected,
    },
  };
}
