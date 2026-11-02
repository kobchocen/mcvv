/**
 * Sloučení duplicitních běžců (#261, Q253) – čistá logika bez databáze.
 *
 * Hlavní běžec (zůstane) převezme všechny odkazy slučovaného (zanikne); slučovaný se pak
 * z `cis_bezec` smaže. Ročníkové tabulky mají klíč (rok, běžec) – když mají oba běžci záznam
 * ve stejném ročníku, nejde o duplicitu (nebo jsou data nekonzistentní) a sloučení se zablokuje.
 */
import { birthYearOf, runnerSexOf } from "@/lib/admin/runner-sex-core";

/** Modely s odkazem na `cis_bezec.id` (kontrolováno proti schématu v testu). */
export const RUNNER_MERGE_MODELS = [
  "RegistrationLine",
  "StartEntry",
  "Result",
  "StartLineMeta",
  "SpecialStart",
  "RunnerPhoto",
  "WebImage",
] as const;

/** Tabulky v náhledu, auditu a počtech (spec. start „spolu s“ zvlášť jako partner). */
export const RUNNER_MERGE_TABLES = [
  "mcvv_prihlaska_radek",
  "mcvv_start",
  "mcvv_time",
  "mcvv_start_radek",
  "mcvv_spec_start",
  "mcvv_spec_start_partner",
  "mcvv_bezec_fotka",
  "webimages",
] as const;
export type RunnerMergeTable = (typeof RUNNER_MERGE_TABLES)[number];

/** Tabulky s klíčem (rok, běžec) – společný ročník = konflikt. */
const YEAR_TABLES: ReadonlySet<RunnerMergeTable> = new Set([
  "mcvv_prihlaska_radek",
  "mcvv_start",
  "mcvv_time",
  "mcvv_start_radek",
  "mcvv_spec_start",
  "mcvv_spec_start_partner",
]);

export type RunnerMergeRow = {
  table: RunnerMergeTable;
  /** Ročník (u fotek / obrázků jen informativně, může chybět). */
  year: number | null;
  /** Klíč řádku: fotka_id, id obrázku, u přihlášek prihlaska_id; jinde rok. */
  key: string;
};

export type RunnerMergeSide = {
  id: string;
  name: string;
  nationality: string | null;
  rows: RunnerMergeRow[];
};

export type RunnerMergeConflict = {
  year: number;
  main: RunnerMergeTable[];
  other: RunnerMergeTable[];
};

export type RunnerMergeWarning = "sex" | "birth_year" | "name";

export type RunnerMergePlan = {
  mainId: string;
  otherId: string;
  /** Řádky slučovaného, které se přepíšou na hlavního (bez duplicitních štítků fotek). */
  moved: RunnerMergeRow[];
  /** Štítky fotek, kde už je označený i hlavní běžec – smažou se. */
  droppedPhotoTags: RunnerMergeRow[];
  counts: Record<RunnerMergeTable, number>;
  /** Doplnění státní příslušnosti hlavnímu (má prázdnou, slučovaný ji má). */
  nationality: string | null;
  warnings: RunnerMergeWarning[];
};

export type RunnerMergeError = "same" | "not_found" | "conflict";

export type RunnerMergeResult =
  | { ok: true; plan: RunnerMergePlan }
  | { ok: false; error: "same" | "not_found" }
  | { ok: false; error: "conflict"; conflicts: RunnerMergeConflict[] };

function nameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("cs");
}

function yearMap(rows: readonly RunnerMergeRow[]): Map<number, RunnerMergeTable[]> {
  const map = new Map<number, RunnerMergeTable[]>();
  for (const row of rows) {
    if (row.year == null || !YEAR_TABLES.has(row.table)) continue;
    const tables = map.get(row.year) ?? [];
    if (!tables.includes(row.table)) tables.push(row.table);
    map.set(row.year, tables);
  }
  return map;
}

/** Ročníky, kde mají záznam oba běžci (seřazené). */
export function findRunnerMergeConflicts(
  main: readonly RunnerMergeRow[],
  other: readonly RunnerMergeRow[],
): RunnerMergeConflict[] {
  const mainYears = yearMap(main);
  const otherYears = yearMap(other);
  return [...otherYears.entries()]
    .filter(([year]) => mainYears.has(year))
    .map(([year, tables]) => ({ year, main: mainYears.get(year) ?? [], other: tables }))
    .sort((a, b) => a.year - b.year);
}

/** Ročníky závodu běžce (z ročníkových tabulek), od nejnovějšího. */
export function runnerMergeYears(rows: readonly RunnerMergeRow[]): number[] {
  return [...yearMap(rows).keys()].sort((a, b) => b - a);
}

export function planRunnerMerge(
  main: RunnerMergeSide | null,
  other: RunnerMergeSide | null,
): RunnerMergeResult {
  if (!main || !other) return { ok: false, error: "not_found" };
  if (main.id === other.id) return { ok: false, error: "same" };
  const conflicts = findRunnerMergeConflicts(main.rows, other.rows);
  if (conflicts.length) return { ok: false, error: "conflict", conflicts };

  const mainPhotos = new Set(
    main.rows.filter((row) => row.table === "mcvv_bezec_fotka").map((row) => row.key),
  );
  const moved: RunnerMergeRow[] = [];
  const droppedPhotoTags: RunnerMergeRow[] = [];
  for (const row of other.rows) {
    if (row.table === "mcvv_bezec_fotka" && mainPhotos.has(row.key)) droppedPhotoTags.push(row);
    else moved.push(row);
  }
  const counts = Object.fromEntries(RUNNER_MERGE_TABLES.map((table) => [table, 0])) as Record<
    RunnerMergeTable,
    number
  >;
  for (const row of moved) counts[row.table] += 1;

  const warnings: RunnerMergeWarning[] = [];
  if (runnerSexOf(main.id) !== runnerSexOf(other.id)) warnings.push("sex");
  if (birthYearOf(main.id) !== birthYearOf(other.id)) warnings.push("birth_year");
  if (nameKey(main.name) !== nameKey(other.name)) warnings.push("name");

  return {
    ok: true,
    plan: {
      mainId: main.id,
      otherId: other.id,
      moved,
      droppedPhotoTags,
      counts,
      nationality: !main.nationality && other.nationality ? other.nationality : null,
      warnings,
    },
  };
}

export type RunnerDuplicateCandidate = {
  id: string;
  name: string;
  years: readonly number[];
};

/**
 * Návrhy duplicit: stejné jméno (bez ohledu na velikost písmen a mezery), rok narození ±1,
 * žádný společný ročník. Hlavní = běžec s více ročníky (při shodě nižší id). Pořadí: stejný
 * rok narození dřív, pak podle jména.
 */
export function runnerDuplicateSuggestions(
  runners: readonly RunnerDuplicateCandidate[],
): { main: RunnerDuplicateCandidate; other: RunnerDuplicateCandidate }[] {
  const byName = new Map<string, RunnerDuplicateCandidate[]>();
  for (const runner of runners) {
    const key = nameKey(runner.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), runner]);
  }
  const pairs: { main: RunnerDuplicateCandidate; other: RunnerDuplicateCandidate; gap: number }[] =
    [];
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i], group[j]];
        const gap = Math.abs(birthYearOf(a.id) - birthYearOf(b.id));
        if (gap > 1) continue;
        const shared = a.years.some((year) => b.years.includes(year));
        if (shared) continue;
        const aFirst =
          a.years.length > b.years.length || (a.years.length === b.years.length && a.id < b.id);
        pairs.push(aFirst ? { main: a, other: b, gap } : { main: b, other: a, gap });
      }
    }
  }
  return pairs
    .sort(
      (x, y) =>
        x.gap - y.gap ||
        x.main.name.localeCompare(y.main.name, "cs") ||
        x.main.id.localeCompare(y.main.id),
    )
    .map(({ main, other }) => ({ main, other }));
}

export const RUNNER_MERGE_HISTORY_LIMIT = 20;
export const RUNNER_MERGE_SUGGESTIONS_PAGE = 10;

export type RunnerMergeHistoryEntry = {
  id: number;
  at: Date;
  actor: string;
  mainId: string;
  otherId: string;
  mainName: string | null;
  otherName: string | null;
  /** Počet přepsaných řádků (všechny tabulky). */
  rows: number;
};

/** Řádek přehledu provedených sloučení z auditu (obranně – detail je volné JSON). */
export function runnerMergeHistoryEntry(row: {
  id: number;
  loggedAt: Date;
  actorEmail: string | null;
  target: string | null;
  detail: unknown;
}): RunnerMergeHistoryEntry {
  const detail =
    row.detail && typeof row.detail === "object" ? (row.detail as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);
  const counts =
    detail.counts && typeof detail.counts === "object"
      ? Object.values(detail.counts as Record<string, unknown>)
      : [];
  return {
    id: row.id,
    at: row.loggedAt,
    actor: row.actorEmail ?? "—",
    mainId: text(detail.mainId) ?? row.target?.replace(/^runner:/, "") ?? "?",
    otherId: text(detail.otherId) ?? "?",
    mainName: text(detail.mainName),
    otherName: text(detail.otherName),
    rows: counts.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0),
  };
}
