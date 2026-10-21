/**
 * Tiskové sestavy pro prezentaci v den závodu (#125) – čisté funkce bez DB.
 *
 * Legacy: `admin/prezentace.php` (bloky po přihláškách se součtem a doplatkem),
 * `admin/abeceda.php` (abecední seznam s číslem přihlášky).
 */
import { compareByStart, startTimeForBib, type StartModel } from "@/lib/race/start-time";

export type PresentationLine = {
  registrationId: number;
  bib: number | null;
  runnerId: string;
  name: string;
  club: string;
  categoryId: string;
  categoryName: string;
  /** Startovné řádku po fallbacku na kategorii (`lineFee`). */
  fee: number;
};

export type PresentationRegistration = {
  id: number;
  name: string | null;
  email: string | null;
  status: number | null;
};

export type PresentationRow = PresentationLine & { time: string; birthYear: string };

export type PresentationBlock = {
  id: number;
  label: string;
  status: number | null;
  rows: PresentationRow[];
  fee: number;
  paid: number;
  /** Kolik zbývá uhradit na místě (nikdy záporné). */
  due: number;
  /** Přeplatek (paid > fee), jinak 0. */
  overpaid: number;
};

export type AlphabetRow = PresentationRow & { registrationLabel: string };

const COLLATOR = new Intl.Collator("cs", { sensitivity: "base", numeric: true });

function withTime(model: StartModel, line: PresentationLine): PresentationRow {
  return {
    ...line,
    time: line.bib ? startTimeForBib(model, line.bib) : "",
    birthYear: line.runnerId.slice(0, 4),
  };
}

/** Čísla vzestupně, řádky bez čísla na konec (podle jména). */
function byBib(a: PresentationRow, b: PresentationRow): number {
  if (a.bib && b.bib) return a.bib - b.bib;
  if (a.bib) return -1;
  if (b.bib) return 1;
  return COLLATOR.compare(a.name, b.name);
}

export function registrationLabel(registration: PresentationRegistration): string {
  const who = registration.name?.trim() || registration.email?.trim() || "";
  return who ? `${registration.id} · ${who}` : String(registration.id);
}

/**
 * Bloky po přihláškách (vzestupně podle čísla přihlášky) se součtem startovného, uhrazenou
 * částkou a doplatkem. Přihlášky bez běžců se netisknou.
 */
export function buildPresentationBlocks(
  registrations: readonly PresentationRegistration[],
  lines: readonly PresentationLine[],
  paidById: ReadonlyMap<number, number>,
  model: StartModel,
): PresentationBlock[] {
  const linesById = new Map<number, PresentationRow[]>();
  for (const line of lines) {
    const rows = linesById.get(line.registrationId) ?? [];
    rows.push(withTime(model, line));
    linesById.set(line.registrationId, rows);
  }
  return [...registrations]
    .filter((registration) => (linesById.get(registration.id)?.length ?? 0) > 0)
    .sort((a, b) => a.id - b.id)
    .map((registration) => {
      const rows = linesById.get(registration.id)!.sort(byBib);
      const fee = rows.reduce((sum, row) => sum + row.fee, 0);
      const paid = paidById.get(registration.id) ?? 0;
      return {
        id: registration.id,
        label: registrationLabel(registration),
        status: registration.status,
        rows,
        fee,
        paid,
        due: Math.max(fee - paid, 0),
        overpaid: Math.max(paid - fee, 0),
      };
    });
}

/** Abecední seznam všech běžců z přihlášek (jméno, pak číslo) s číslem přihlášky. */
export function buildAlphabetRows(
  registrations: readonly PresentationRegistration[],
  lines: readonly PresentationLine[],
  model: StartModel,
): AlphabetRow[] {
  const registrationsById = new Map(registrations.map((r) => [r.id, r]));
  return lines
    .filter((line) => registrationsById.has(line.registrationId))
    .map((line) => ({
      ...withTime(model, line),
      registrationLabel: String(line.registrationId),
    }))
    .sort((a, b) => COLLATOR.compare(a.name, b.name) || byBib(a, b));
}

export type StartListOrder = "time" | "bib";

export function parseStartListOrder(raw: string | null | undefined): StartListOrder {
  return raw === "bib" || raw === "cislo" ? "bib" : "time";
}

/** Startovka k tisku podle startovního času (obě vlny prolnuté) nebo podle čísla. */
export function sortStartList<T extends { bib: number }>(
  rows: readonly T[],
  model: StartModel,
  order: StartListOrder,
): T[] {
  const copy = [...rows];
  copy.sort(
    order === "bib" ? (a, b) => a.bib - b.bib : (a, b) => compareByStart(model, a.bib, b.bib),
  );
  return copy;
}

export function presentationTotals(blocks: readonly PresentationBlock[]) {
  return blocks.reduce(
    (sum, block) => ({
      registrations: sum.registrations + 1,
      runners: sum.runners + block.rows.length,
      fee: sum.fee + block.fee,
      paid: sum.paid + Math.min(block.paid, block.fee),
      due: sum.due + block.due,
    }),
    { registrations: 0, runners: 0, fee: 0, paid: 0, due: 0 },
  );
}
