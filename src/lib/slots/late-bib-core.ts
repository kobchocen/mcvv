/**
 * Číslo pro zaplacenou pozdní přihlášku po zveřejnění startovky (NAVRH 2.3/5, Q326) – bez DB.
 * - Volné číslo = nikomu nepřidělené (řádky přihlášek, startovka z prezentace) a není to
 *   číslo obhájce titulu.
 * - Přednostně náhodné volné číslo z okna kategorie ročníku.
 * - Když v kategorii žádné volné není → nejbližší volné nižší číslo mimo kategorii.
 * - Když není ani to → bez čísla (přidělí pořadatel ručně, alert).
 * Způsob přidělení se veřejně nikde neuvádí.
 */

import { formatStartClock } from "@/lib/date/race-schedule";
import { startTimeForBib, type StartModel } from "@/lib/race/start-time";

export type LateBibPick = { bib: number; outsideCategory: boolean };

export function pickLateBib(
  range: { bibFrom: number; bibTo: number } | null | undefined,
  taken: ReadonlySet<number>,
  random: () => number = Math.random,
): LateBibPick | null {
  if (!range || !Number.isInteger(range.bibFrom) || !Number.isInteger(range.bibTo)) return null;
  const from = Math.max(1, range.bibFrom);
  const to = range.bibTo;
  if (to < from) return null;
  const free: number[] = [];
  for (let bib = from; bib <= to; bib += 1) {
    if (!taken.has(bib)) free.push(bib);
  }
  if (free.length > 0) {
    const index = Math.min(free.length - 1, Math.floor(random() * free.length));
    return { bib: free[index], outsideCategory: false };
  }
  for (let bib = from - 1; bib >= 1; bib -= 1) {
    if (!taken.has(bib)) return { bib, outsideCategory: true };
  }
  return null;
}

/**
 * Čísla pro všechny běžce přihlášky (postupně, ať dva běžci nedostanou stejné číslo).
 * Řádky, které už číslo mají, se nemění.
 */
export function pickLateBibs(
  lines: readonly { runnerId: string; categoryId: string; bib: number | null }[],
  ranges: readonly { categoryId: string; bibFrom: number; bibTo: number }[],
  taken: ReadonlySet<number>,
  random: () => number = Math.random,
): { runnerId: string; pick: LateBibPick | null }[] {
  const used = new Set(taken);
  const byCategory = new Map(ranges.map((range) => [range.categoryId, range]));
  const result: { runnerId: string; pick: LateBibPick | null }[] = [];
  for (const line of lines) {
    if (line.bib != null && line.bib > 0) continue;
    const pick = pickLateBib(byCategory.get(line.categoryId), used, random);
    if (pick) used.add(pick.bib);
    result.push({ runnerId: line.runnerId, pick });
  }
  return result;
}

/** Klíč fronty e-mailů g (platba přijata), brání dvojímu odeslání. */
export function latePaidMailDedupeKey(year: number, id: number): string {
  return `late-paid:${year}:${id}`;
}

/**
 * Čísla, časy a „Start prvního běžce“ pro e-mail g – vše z modelu startu ročníku
 * (nulový čas st_nula_s, interval, 2. start; /admin/rocniky, výchozí 10:15), nic natvrdo (Q393).
 */
export function latePaidStartFacts<
  L extends {
    bib: number | null;
    runner: { name: string };
    category: { name: string };
    entryFee: number | null;
  },
>(model: StartModel, lines: L[], published: boolean) {
  return {
    lines: lines.map((line) => {
      const bib = published && line.bib && line.bib > 0 ? line.bib : null;
      return {
        runner: line.runner.name,
        category: line.category.name,
        fee: line.entryFee ?? 0,
        bib,
        start: bib ? startTimeForBib(model, bib) : null,
      };
    }),
    firstStart: formatStartClock(model.zeroSeconds),
  };
}
