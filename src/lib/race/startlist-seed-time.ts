/**
 * Čas pro nasazení ve startovce (#381): poslední platný cílový čas (time > 0)
 * z nejnovějšího ročníku v okně Y−1 … Y−3. Kdo běžel loni, zůstane podle loňska
 * i když má z dřívějška rychlejší čas. Kdo loni vynechal, bere předloňský nebo
 * čas před třemi lety. Čas 0 a ročník mimo okno se nepočítají.
 *
 * Pole v návrhu zůstává `lastYearTime` (hodnota už nemusí být nutně loňská);
 * otisk návrhu ho zahrnuje, takže změna zdroje času zneplatní starý návrh.
 */

export const SEED_TIME_LOOKBACK_YEARS = 3;

export type SeedTimeResult = {
  runnerId?: string;
  year: number;
  time: number;
};

/** Uzavřené okno ročníků, ze kterých se bere čas pro nasazení: [Y−3, Y−1]. */
export function seedTimeWindow(raceYear: number): { from: number; to: number } {
  return { from: raceYear - SEED_TIME_LOOKBACK_YEARS, to: raceYear - 1 };
}

/**
 * Poslední dostupný platný čas jednoho běžce v okně nasazení. Při více výsledcích
 * ve stejném roce (nemělo by nastat – klíč je rok + běžec) vyhraje později
 * uvedený stejného roku jen když rok není novější; novější rok má vždy přednost.
 */
export function pickSeedTime(
  results: readonly { year: number; time: number }[],
  raceYear: number,
): number | null {
  const { from, to } = seedTimeWindow(raceYear);
  let chosenYear = Number.NEGATIVE_INFINITY;
  let time: number | null = null;
  for (const row of results) {
    if (row.year < from || row.year > to || !(row.time > 0)) continue;
    if (row.year > chosenYear) {
      chosenYear = row.year;
      time = row.time;
    }
  }
  return time;
}

/** Časy pro nasazení podle id běžce (jen kdo má v okně aspoň jeden platný čas). */
export function seedTimesByRunner(
  results: readonly SeedTimeResult[],
  raceYear: number,
): Map<string, number> {
  const byRunner = new Map<string, { year: number; time: number }[]>();
  for (const row of results) {
    if (!row.runnerId) continue;
    const list = byRunner.get(row.runnerId) ?? [];
    list.push(row);
    byRunner.set(row.runnerId, list);
  }
  const out = new Map<string, number>();
  for (const [id, rows] of byRunner) {
    const time = pickSeedTime(rows, raceYear);
    if (time != null) out.set(id, time);
  }
  return out;
}
