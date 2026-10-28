/**
 * Úklid „sirotků“ v číselníku klubů (#193). Pure – data dodá `orphans-apply.ts`.
 *
 * Sirotek = řádek `cis_klub(id, rok)`, na který neodkazuje žádný řádek přihlášky
 * (`mcvv_prihlaska_radek`), startu (`mcvv_start`) ani výsledku (`mcvv_time`) se stejným
 * `klub_id` a `rok` (cizí klíč je (klub_id, rok), jiné vazby na id klubu v DB nejsou –
 * účet má jen volný text `club_name`, předvyplnění bere klub z poslední přihlášky).
 *
 * Řádky aktuálního (a budoucího) ročníku se nikdy nemažou: klub se může přihlásit až později
 * a OBD / OFeed při prezentaci nabízí kluby z číselníku.
 */
import { clubKey } from "./core";

/** `ids` = jen id klubu, která nemají vazbu v žádném roce (smaže všechny jeho řádky);
 *  `rows` = i jednotlivé roky bez vazby u id, která jinde data mají. */
export const ORPHAN_SCOPES = ["ids", "rows"] as const;
export type OrphanScope = (typeof ORPHAN_SCOPES)[number];

export function isOrphanScope(value: unknown): value is OrphanScope {
  return ORPHAN_SCOPES.includes(value as OrphanScope);
}

export type ClubRegistryRow = {
  id: string;
  year: number;
  name: string;
  created: Date | null;
  author: string | null;
  /** Odkazuje na řádek aspoň jedna přihláška / start / výsledek téhož roku. */
  used: boolean;
};

export type OrphanCleanupPlan = {
  scope: OrphanScope;
  currentYear: number;
  /** Řádky ke smazání, seřazené podle id a roku. */
  rows: ClubRegistryRow[];
  /** Počet různých id, kterých se úklid týká, a z toho id, která zmizí úplně. */
  ids: number;
  removedIds: number;
  /** Sirotci aktuálního / budoucího ročníku, které úklid ponechá. */
  keptCurrent: number;
  /** Otisk seznamu (id/rok) – potvrzení smaže jen to, co bylo v náhledu. */
  fingerprint: string;
};

function compareRows(a: ClubRegistryRow, b: ClubRegistryRow): number {
  return a.id.localeCompare(b.id) || a.year - b.year;
}

/** Krátký deterministický otisk (FNV-1a 32 bit, hex) seznamu klíčů. */
export function orphanFingerprint(rows: readonly Pick<ClubRegistryRow, "id" | "year">[]): string {
  let hash = 0x811c9dc5;
  const text = rows.map((row) => `${clubKey(row.id)}/${row.year}`).join(";");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${rows.length}-${hash.toString(16).padStart(8, "0")}`;
}

export function planOrphanCleanup(
  registry: readonly ClubRegistryRow[],
  options: { scope: OrphanScope; currentYear: number },
): OrphanCleanupPlan {
  const byId = new Map<string, ClubRegistryRow[]>();
  for (const row of registry) {
    const id = clubKey(row.id);
    byId.set(id, [...(byId.get(id) ?? []), row]);
  }
  const rows: ClubRegistryRow[] = [];
  let removedIds = 0;
  let keptCurrent = 0;
  for (const idRows of byId.values()) {
    const orphans = idRows.filter((row) => !row.used);
    const old = orphans.filter((row) => row.year < options.currentYear);
    keptCurrent += orphans.length - old.length;
    if (old.length === 0) continue;
    const wholeId = old.length === idRows.length;
    if (options.scope === "ids" && !wholeId) continue;
    rows.push(...old);
    if (wholeId) removedIds += 1;
  }
  rows.sort(compareRows);
  return {
    scope: options.scope,
    currentYear: options.currentYear,
    rows,
    ids: new Set(rows.map((row) => clubKey(row.id))).size,
    removedIds,
    keptCurrent,
    fingerprint: orphanFingerprint(rows),
  };
}

/** Řádek smazaného klubu v auditu – plný stav pro ruční obnovení (INSERT do cis_klub). */
export type OrphanAuditRow = {
  id: string;
  rok: number;
  jmeno: string;
  created: string | null;
  autor: string | null;
};

export type OrphanCleanupAuditDetail = {
  version: 1;
  scope: OrphanScope;
  currentYear: number;
  count: number;
  removedIds: number;
  rows: OrphanAuditRow[];
};

export function orphanAuditDetail(plan: OrphanCleanupPlan): OrphanCleanupAuditDetail {
  return {
    version: 1,
    scope: plan.scope,
    currentYear: plan.currentYear,
    count: plan.rows.length,
    removedIds: plan.removedIds,
    rows: plan.rows.map((row) => ({
      id: row.id,
      rok: row.year,
      jmeno: row.name,
      created: validDate(row.created)?.toISOString() ?? null,
      autor: row.author,
    })),
  };
}

/**
 * Legacy `cis_klub.created` může být `0000-00-00 …`, což driver vrátí jako
 * neplatné Date (`toISOString` by spadlo). Takové datum bereme jako neznámé.
 */
export function validDate(value: Date | null | undefined): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() > 0
    ? value
    : null;
}
