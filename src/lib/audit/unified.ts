import { Prisma } from "@prisma/client";

import { pragueDayStart } from "@/lib/audit/filters";
import {
  UNIFIED_PAGE_SIZE,
  type UnifiedFilters,
  type UnifiedKind,
  type UnifiedRow,
} from "@/lib/audit/unified-core";
import { prisma } from "@/lib/db/client";

/**
 * Audit v2 (P9): jeden přehled přes `mcvv_audit_log` (+ `mcvv_audit_meta`) a deníky dne
 * závodu `mcvv_split_entry` a `mcvv_start_check_entry` (UNION ALL, bez kopírování dat).
 * Rok / číslo / čas se filtrují uvnitř větví (indexy), ostatní filtry nad výsledkem.
 */

type RawRow = Omit<UnifiedRow, "id" | "userId" | "year" | "bib"> & {
  id: number | bigint;
  userId: number | bigint | null;
  year: number | bigint | null;
  bib: number | bigint | null;
};

function num(value: number | bigint | null): number | null {
  return value === null ? null : Number(value);
}

function timeRange(column: Prisma.Sql, filters: UnifiedFilters): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  if (filters.from) out.push(Prisma.sql`${column} >= ${pragueDayStart(filters.from)}`);
  if (filters.to) out.push(Prisma.sql`${column} < ${pragueDayStart(filters.to, 1)}`);
  return out;
}

function where(parts: Prisma.Sql[]): Prisma.Sql {
  return parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

function rolesOf(userColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(SELECT GROUP_CONCAT(r.role ORDER BY r.role) FROM mcvv_user_role r WHERE r.user_id = ${userColumn})`;
}

function branches(filters: UnifiedFilters): Prisma.Sql[] {
  const want = (kind: UnifiedKind) => filters.kind === null || filters.kind === kind;
  const out: Prisma.Sql[] = [];
  if (want("audit")) {
    const parts = timeRange(Prisma.sql`a.created_at`, filters);
    if (filters.year !== null) parts.push(Prisma.sql`m.year = ${filters.year}`);
    if (filters.bib !== null) parts.push(Prisma.sql`m.bib = ${filters.bib}`);
    out.push(Prisma.sql`
      SELECT 'audit' AS kind, a.id AS id, a.created_at AS at, a.actor_user_id AS userId,
        a.actor_email AS who, COALESCE(m.actor_roles, a.actor_role) AS roles,
        a.action AS action, a.target AS target, m.year AS year, m.bib AS bib,
        COALESCE(m.entity, SUBSTRING_INDEX(a.action, '.', 1)) AS entity,
        COALESCE(m.source, 'web') AS source, NULL AS outcome,
        CAST(a.detail AS CHAR(4000)) AS detail
      FROM mcvv_audit_log a LEFT JOIN mcvv_audit_meta m ON m.audit_id = a.id
      ${where(parts)}`);
  }
  if (want("split")) {
    const parts = timeRange(Prisma.sql`s.received_at`, filters);
    if (filters.year !== null) parts.push(Prisma.sql`s.rok = ${filters.year}`);
    if (filters.bib !== null) parts.push(Prisma.sql`s.cislo = ${filters.bib}`);
    out.push(Prisma.sql`
      SELECT 'split' AS kind, s.id AS id, s.received_at AS at, s.user_id AS userId,
        COALESCE(u.email, s.autor) AS who, ${rolesOf(Prisma.sql`s.user_id`)} AS roles,
        CONCAT('split.', s.action) AS action,
        CONCAT('split:', s.rok, ':', s.split, ':', s.cislo) AS target,
        s.rok AS year, s.cislo AS bib, 'split' AS entity, s.source AS source,
        s.outcome AS outcome,
        CONCAT_WS(' ', IF(s.time IS NULL, NULL, CONCAT('time=', s.time)), s.note) AS detail
      FROM mcvv_split_entry s LEFT JOIN mcvv_user u ON u.id = s.user_id
      ${where(parts)}`);
  }
  if (want("start")) {
    const parts = timeRange(Prisma.sql`e.received_at`, filters);
    if (filters.year !== null) parts.push(Prisma.sql`e.rok = ${filters.year}`);
    if (filters.bib !== null) parts.push(Prisma.sql`e.cislo = ${filters.bib}`);
    out.push(Prisma.sql`
      SELECT 'start' AS kind, e.id AS id, e.received_at AS at, e.user_id AS userId,
        COALESCE(u.email, e.source) AS who, ${rolesOf(Prisma.sql`e.user_id`)} AS roles,
        CONCAT('start.', e.action) AS action,
        CONCAT('start:', e.rok, ':', e.cislo) AS target,
        e.rok AS year, e.cislo AS bib, 'start' AS entity, e.source AS source,
        e.outcome AS outcome, e.note AS detail
      FROM mcvv_start_check_entry e LEFT JOIN mcvv_user u ON u.id = e.user_id
      ${where(parts)}`);
  }
  return out;
}

function outerWhere(filters: UnifiedFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.actor) parts.push(Prisma.sql`u.who LIKE ${`%${filters.actor}%`}`);
  if (filters.role) parts.push(Prisma.sql`FIND_IN_SET(${filters.role}, u.roles) > 0`);
  if (filters.action) {
    parts.push(
      filters.action.includes(".")
        ? Prisma.sql`u.action = ${filters.action}`
        : Prisma.sql`u.action LIKE ${`${filters.action}.%`}`,
    );
  }
  if (filters.entity) parts.push(Prisma.sql`u.entity = ${filters.entity}`);
  if (filters.source) parts.push(Prisma.sql`u.source = ${filters.source}`);
  return where(parts);
}

async function query(filters: UnifiedFilters, limit: number, offset: number) {
  const parts = branches(filters);
  if (parts.length === 0) return [];
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT * FROM (${Prisma.join(parts, " UNION ALL ")}) u
    ${outerWhere(filters)}
    ORDER BY u.at DESC, u.kind, u.id DESC
    LIMIT ${limit} OFFSET ${offset}`;
  return rows.map((row): UnifiedRow => ({
    ...row,
    id: Number(row.id),
    userId: num(row.userId),
    year: num(row.year),
    bib: num(row.bib),
  }));
}

/** Stránka přehledu (o řádek navíc kvůli odkazu „další“). */
export async function loadUnifiedPage(
  filters: UnifiedFilters,
): Promise<{ rows: UnifiedRow[]; hasNext: boolean }> {
  const rows = await query(filters, UNIFIED_PAGE_SIZE + 1, (filters.page - 1) * UNIFIED_PAGE_SIZE);
  return { rows: rows.slice(0, UNIFIED_PAGE_SIZE), hasNext: rows.length > UNIFIED_PAGE_SIZE };
}

/** Řádky pro CSV (nejvýš `limit`). */
export function loadUnifiedAll(filters: UnifiedFilters, limit: number): Promise<UnifiedRow[]> {
  return query({ ...filters, page: 1 }, limit, 0);
}
