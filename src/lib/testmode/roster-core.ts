/**
 * Testovací startovka (B+): jen čtení ostrých přihlášek → řádky pro `mcvv_test_start`.
 * Losuje stávající čistý generátor (`generateStartList`) nad zaplacenými přihláškami
 * a fiktivními běžci; ostrá čísla se nemění. Po `copyLiveFrom` se kopíruje ostrá startovka.
 */
import {
  generateStartList,
  type GeneratorEntry,
  type GeneratorInput,
} from "@/lib/race/startlist-generator";

export type TestStartRow = {
  bib: number;
  /** Id ostrého běžce jen v paměti (párování při kopii); do `mcvv_test_start` se neukládá. */
  runnerId: string | null;
  name: string;
  categoryId: string;
  club: string | null;
  fictional: boolean;
};

const FIRST = ["Adam", "Bára", "Cyril", "Dana", "Emil", "Fany", "Gustav", "Hana", "Ivo", "Jana"];
const LAST = ["Testová", "Zkušební", "Pokusný", "Vzorová", "Cvičný", "Ukázková", "Nanečisto"];

/** Fiktivní běžec – id začíná „TEST“ (nekoliduje s ostrými id ročník + pořadí). */
export const FICTIONAL_ID_PREFIX = "TEST";

export function isFictionalId(runnerId: string): boolean {
  return runnerId.startsWith(FICTIONAL_ID_PREFIX);
}

/**
 * Fiktivní běžci rozdělení rovnoměrně do kategorií (podle pořadí), deterministicky.
 * Jména s předponou „TEST“, ať je nikdo nesplete s ostrými.
 */
export function makeFictionalEntries(
  count: number,
  categoryIds: readonly string[],
): GeneratorEntry[] {
  if (count <= 0 || categoryIds.length === 0) return [];
  return Array.from({ length: count }, (_, i) => ({
    runnerId: `${FICTIONAL_ID_PREFIX}${String(i + 1).padStart(4, "0")}`,
    name: `TEST ${LAST[i % LAST.length]} ${FIRST[(i * 3) % FIRST.length]}`,
    categoryId: categoryIds[i % categoryIds.length],
    currentBib: null,
    locked: false,
    eligible: true,
    lastYearTime: null,
    special: null,
  }));
}

/** Vstup losování testu: jen zaplacené (eligible) přihlášky + fiktivní, bez ostrých čísel a zámků. */
export function testGeneratorInput(
  base: GeneratorInput,
  fictional: GeneratorEntry[],
): GeneratorInput {
  return {
    ...base,
    entries: [
      ...base.entries
        .filter((e) => e.eligible)
        .map((e) => ({ ...e, currentBib: null, locked: false })),
      ...fictional,
    ],
  };
}

export type TestRosterResult =
  | { ok: true; rows: TestStartRow[]; source: "copy" | "draw" }
  | { ok: false; error: "empty" | "blocking" };

/** Testovací startovka: kopie ostrých čísel, nebo losování (zápis jen do testovacích tabulek). */
export function buildTestRoster(input: {
  base: GeneratorInput;
  clubOf: ReadonlyMap<string, string | null>;
  fictional: number;
  source: "copy" | "draw";
}): TestRosterResult {
  if (input.source === "copy") {
    const rows = input.base.entries
      .filter((e) => e.eligible && e.currentBib !== null)
      .map((e) => ({
        bib: e.currentBib as number,
        runnerId: e.runnerId,
        name: e.name,
        categoryId: e.categoryId,
        club: input.clubOf.get(e.runnerId) ?? null,
        fictional: false,
      }))
      .sort((a, b) => a.bib - b.bib);
    return rows.length ? { ok: true, rows, source: "copy" } : { ok: false, error: "empty" };
  }
  const categories = input.base.ranges.map((r) => r.categoryId);
  const fictional = makeFictionalEntries(input.fictional, categories);
  const gen = testGeneratorInput(input.base, fictional);
  if (gen.entries.length === 0) return { ok: false, error: "empty" };
  const proposal = generateStartList(gen);
  if (proposal.blocking) return { ok: false, error: "blocking" };
  const entryOf = new Map(gen.entries.map((e) => [e.runnerId, e]));
  const rows: TestStartRow[] = [];
  for (const line of proposal.lines) {
    const entry = entryOf.get(line.runnerId);
    if (line.bib === null || !entry) continue;
    const fake = isFictionalId(line.runnerId);
    rows.push({
      bib: line.bib,
      runnerId: fake ? null : line.runnerId,
      name: entry.name,
      categoryId: entry.categoryId,
      club: fake ? "TEST" : (input.clubOf.get(line.runnerId) ?? null),
      fictional: fake,
    });
  }
  rows.sort((a, b) => a.bib - b.bib);
  return rows.length ? { ok: true, rows, source: "draw" } : { ok: false, error: "empty" };
}
