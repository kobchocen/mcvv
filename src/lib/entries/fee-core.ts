/**
 * Startovné zdarma (čisté funkce, bez DB): pořadatel (e-mail ze seznamu), absolutní vítěz
 * některého ročníku, veterán (startoval ve víc než polovině ročníků).
 */
export type FeeReason = "organizer" | "winner" | "veteran";

export type ResultRow = { year: number; runnerId: string; time: number };

function runnerSex(id: string): "M" | "F" {
  return id.charAt(4) < "5" ? "M" : "F";
}

/** Absolutní vítězové (nejlepší čas ročníku zvlášť pro muže a ženy). */
export function absoluteWinnerIdsFrom(rows: readonly ResultRow[]): Set<string> {
  const best = new Map<string, { id: string; time: number }>();
  for (const row of rows) {
    const key = `${row.year}-${runnerSex(row.runnerId)}`;
    const current = best.get(key);
    if (!current || row.time < current.time) {
      best.set(key, { id: row.runnerId, time: row.time });
    }
  }
  return new Set([...best.values()].map((row) => row.id));
}

/** Veteráni: počet startů větší než polovina počtu ročníků (zaokrouhlení jako legacy). */
export function veteranIdsFrom(rows: readonly Pick<ResultRow, "year" | "runnerId">[]): Set<string> {
  const yearCount = new Set(rows.map((row) => row.year)).size;
  const pocr = Math.round(yearCount / 2 + 0.5) - 1;
  const starts = new Map<string, number>();
  for (const row of rows) {
    starts.set(row.runnerId, (starts.get(row.runnerId) ?? 0) + 1);
  }
  const ids = new Set<string>();
  for (const [id, count] of starts) {
    if (count > pocr) {
      ids.add(id);
    }
  }
  return ids;
}

export function feeReasonFor(
  email: string,
  runnerId: string,
  data: {
    freeEmails: ReadonlySet<string>;
    winners: ReadonlySet<string>;
    veterans: ReadonlySet<string>;
  },
): FeeReason | null {
  if (data.freeEmails.has(email.trim().toLowerCase())) {
    return "organizer";
  }
  if (data.winners.has(runnerId)) {
    return "winner";
  }
  if (data.veterans.has(runnerId)) {
    return "veteran";
  }
  return null;
}
