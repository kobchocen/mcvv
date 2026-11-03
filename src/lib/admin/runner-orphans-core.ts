/**
 * Navázaná data běžce a úklid „sirotků“ v číselníku běžců. Pure – data dodá
 * `runner-orphans.ts`.
 *
 * Sirotek = řádek `cis_bezec`, na který neodkazuje žádný řádek v tabulkách níže. Seznam
 * pokrývá všechny vazby na `cis_bezec.id` (cizí klíče i sloupec `bezec_id` bez relace –
 * kontroluje to `runner-orphans.test.ts` proti Prisma schématu a `RUNNER_REFERENCE_MODELS`).
 * Další data se na běžce vážou jen nepřímo a jsou tím pokrytá: mezičasy a evidence startu
 * (`mcvv_split*`, `mcvv_start_check_entry`) přes startovní číslo v `mcvv_start`, přihláška,
 * platby, zprávy a účet přihlašujícího přes řádek přihlášky. Účet (`mcvv_user`) na běžce
 * přímo neodkazuje.
 */

/** Druhy vazeb v pořadí zobrazení. `partner` = spec. start „spolu s“, kde je partnerem. */
export const RUNNER_LINK_KINDS = [
  "registrationLines",
  "startEntries",
  "results",
  "startLines",
  "specialStarts",
  "specialPartners",
  "photoTags",
  "webImages",
] as const;
export type RunnerLinkKind = (typeof RUNNER_LINK_KINDS)[number];

/** Tabulka a sloupec každé vazby (pro SQL i kontrolu úplnosti v testu). */
export const RUNNER_LINK_TABLES: Record<RunnerLinkKind, { table: string; column: string }> = {
  registrationLines: { table: "mcvv_prihlaska_radek", column: "bezec_id" },
  startEntries: { table: "mcvv_start", column: "bezec_id" },
  results: { table: "mcvv_time", column: "bezec_id" },
  startLines: { table: "mcvv_start_radek", column: "bezec_id" },
  specialStarts: { table: "mcvv_spec_start", column: "bezec_id" },
  specialPartners: { table: "mcvv_spec_start", column: "partner_bezec_id" },
  photoTags: { table: "mcvv_bezec_fotka", column: "bezec_id" },
  webImages: { table: "webimages", column: "bezec_id" },
};

export type RunnerLinkCounts = Record<RunnerLinkKind, number>;

export function emptyLinkCounts(): RunnerLinkCounts {
  return Object.fromEntries(RUNNER_LINK_KINDS.map((kind) => [kind, 0])) as RunnerLinkCounts;
}

export function totalLinks(counts: RunnerLinkCounts): number {
  return RUNNER_LINK_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
}

/** Smazat jde jen běžce bez jediné vazby. */
export function canDeleteRunner(counts: RunnerLinkCounts): boolean {
  return totalLinks(counts) === 0;
}

export const RUNNER_ID_PATTERN = /^\d{8}$/;

export function isRunnerId(value: unknown): value is string {
  return typeof value === "string" && RUNNER_ID_PATTERN.test(value);
}

export type RunnerOrphanRow = {
  id: string;
  name: string;
  nationality: string | null;
  created: Date | null;
  author: string | null;
};

/**
 * Výběr ke smazání z formuláře: jen platná id, bez duplicit, jen z nabídnutého seznamu
 * (`offered`, odeslaný se stránkou). Vrací seřazený seznam.
 */
export function selectedRunnerIds(
  values: readonly unknown[],
  offered: ReadonlySet<string> | null = null,
): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (isRunnerId(value) && (!offered || offered.has(value))) ids.add(value);
  }
  return [...ids].sort();
}

/** Řádek smazaného běžce v auditu – plný stav pro ruční obnovení (INSERT do cis_bezec). */
export type RunnerAuditRow = {
  id: string;
  jmeno: string;
  statni_prislusnost: string | null;
  created: string | null;
  autor: string | null;
};

export type RunnerDeleteAuditDetail = {
  version: 1;
  /** `single` = z detailu běžce, `orphans` = hromadný úklid sirotků. */
  source: "single" | "orphans";
  count: number;
  rows: RunnerAuditRow[];
};

export function runnerAuditRow(row: RunnerOrphanRow): RunnerAuditRow {
  return {
    id: row.id,
    jmeno: row.name,
    statni_prislusnost: row.nationality,
    created: validDate(row.created)?.toISOString() ?? null,
    autor: row.author,
  };
}

export function runnerDeleteAuditDetail(
  source: RunnerDeleteAuditDetail["source"],
  rows: readonly RunnerOrphanRow[],
): RunnerDeleteAuditDetail {
  return { version: 1, source, count: rows.length, rows: rows.map(runnerAuditRow) };
}

/** Legacy `created` může být `0000-00-00` (neplatné Date) – bereme jako neznámé. */
export function validDate(value: Date | null | undefined): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() > 0
    ? value
    : null;
}
