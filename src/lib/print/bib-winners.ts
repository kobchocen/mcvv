/**
 * Historičtí absolutní vítězové (nejlepší čas ročníku zvlášť pro muže a ženy).
 * Stejné pravidlo jako statistiky `/statistiky/vitezove` a startovné zdarma v `fee-core`.
 * Pohlaví se bere z 5. znaku `bezec_id` (stejně jako všude jinde ve webu).
 */
export type WinnerResultRow = { year: number; runnerId: string; time: number };

/** Pohlaví z identifikátoru běžce: 5. znak `0–4` muž, `5–9` žena. */
export function runnerSexFromId(id: string): "M" | "F" {
  return id.charAt(4) < "5" ? "M" : "F";
}

/**
 * Počet absolutních vítězství (muži nebo ženy) podle historických časů.
 * Řádky s časem 0 se nepočítají (DNF/není čas). `beforeYear` vynechá ročník tisku
 * a novější, aby do čísla nelezly letošní nebo testovací výsledky.
 */
export function absoluteWinnerCountsFrom(
  rows: readonly WinnerResultRow[],
  options?: { beforeYear?: number },
): Map<string, number> {
  const before = options?.beforeYear;
  const usable = rows.filter((row) => row.time > 0 && (before == null || row.year < before));
  const best = new Map<string, { id: string; time: number }>();
  for (const row of usable) {
    const key = `${row.year}-${runnerSexFromId(row.runnerId)}`;
    const current = best.get(key);
    if (!current || row.time < current.time) {
      best.set(key, { id: row.runnerId, time: row.time });
    }
  }
  const counts = new Map<string, number>();
  for (const row of best.values()) {
    counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  }
  return counts;
}
