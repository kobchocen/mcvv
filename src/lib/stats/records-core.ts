/**
 * Rekordy kategorií (#129) – čisté funkce bez DB, jediné pravidlo pro statistiku
 * „Vývoj rekordů“ i pro uložený `cis_mcvv_kateg.rekord` (export do OBD, tisk).
 *
 * Legacy `admin/setkatrek.php`: rekord = nejlepší čas (> 0) napříč ročníky mezi běžci,
 * kteří v daném ročníku splňují podmínku kategorie – pohlaví podle 5. znaku ID
 * (0–4 muž, 5–9 žena) a ročník narození vůči `age` (`isEligibleByBirthYear`).
 */
import { isEligibleByBirthYear } from "@/lib/entries/category";

import { runnerBirthYear, runnerSex } from "./core";

export type RecordCategory = { id: string; sex: string; age: number };
export type RecordResult = { year: number; runnerId: string; time: number };

export function isRecordEligible(result: RecordResult, category: RecordCategory): boolean {
  return (
    result.time > 0 &&
    isEligibleByBirthYear(
      runnerBirthYear(result.runnerId),
      runnerSex(result.runnerId),
      result.year,
      category,
    )
  );
}

/**
 * Postupná zlepšení rekordu kategorie po ročnících: vítěz kategorie v ročníku se zapíše,
 * když byl rychlejší než dosavadní rekord. Poslední prvek je platný rekord.
 */
export function recordEvolution<T extends RecordResult>(
  category: RecordCategory,
  results: readonly T[],
): T[] {
  const winners = new Map<number, T>();
  for (const result of results) {
    if (!isRecordEligible(result, category)) continue;
    const best = winners.get(result.year);
    if (!best || result.time < best.time) winners.set(result.year, result);
  }
  const rows: T[] = [];
  let best = Number.POSITIVE_INFINITY;
  for (const year of [...winners.keys()].sort((a, b) => a - b)) {
    const winner = winners.get(year)!;
    if (winner.time < best) {
      best = winner.time;
      rows.push(winner);
    }
  }
  return rows;
}

export function categoryRecord<T extends RecordResult>(
  category: RecordCategory,
  results: readonly T[],
): T | null {
  return recordEvolution(category, results).at(-1) ?? null;
}

export type RecordChange = { id: string; from: number; to: number };

/**
 * Nové hodnoty `rekord` pro kategorie, kde se liší od uložené. Kategorie bez jediného
 * platného výsledku si uloženou hodnotu nechá (legacy by zapsal 999999, což by se do
 * OBD exportovalo jako nesmyslný čas).
 */
export function recordChanges(
  categories: readonly (RecordCategory & { record: number })[],
  results: readonly RecordResult[],
): RecordChange[] {
  const changes: RecordChange[] = [];
  for (const category of categories) {
    const best = categoryRecord(category, results);
    if (best && best.time !== category.record) {
      changes.push({ id: category.id, from: category.record, to: best.time });
    }
  }
  return changes;
}
