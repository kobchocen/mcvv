/**
 * Přehled provedených sloučení klubů (#192, Q246) z auditu `club.merge`. Detail je
 * `ClubMergeAuditDetail` (admin) nebo stejný tvar z migrace 1.5.0 (`source: "migration"`,
 * bez `counts`, čas sloučení v `mergedAt`). Čte se obranně – starší / ruční záznamy nesmí
 * stránku shodit.
 */

export const CLUB_MERGE_HISTORY_LIMIT = 20;

export type ClubMergeHistoryEntry = {
  id: number;
  /** Kdy se sloučilo (u migrace původní čas sloučení, jinak čas auditu). */
  at: Date;
  /** Čas záznamu v auditu (filtr odkazu do /admin/audit). */
  loggedAt: Date;
  source: "admin" | "migration";
  actor: string;
  main: string;
  merged: string;
  /** Poslední název sloučeného id v číselníku (z `detail.cisKlub`). */
  mergedName: string | null;
  counts: { entries: number; starts: number; results: number };
};

type AuditRow = {
  id: number;
  createdAt: Date;
  actorEmail: string;
  target: string | null;
  detail: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function length(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function count(counts: Record<string, unknown>, key: string, fallback: number): number {
  const value = counts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Poslední (nejnovější ročník) název ze seznamu řádků číselníku `{ rok, jmeno }`. */
function latestName(rows: unknown[]): string | null {
  let best: { year: number; name: string } | null = null;
  for (const row of rows) {
    const { rok, jmeno } = record(row);
    const name = text(jmeno);
    const year = typeof rok === "number" ? rok : Number(rok);
    if (name && Number.isFinite(year) && (!best || year > best.year)) best = { year, name };
  }
  return best?.name ?? null;
}

/** Čas z `mergedAt` migrace („YYYY-MM-DD HH:MM:SS[.fff]“ v UTC databáze) nebo null. */
function parseMergedAt(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function clubMergeHistoryEntry(row: AuditRow): ClubMergeHistoryEntry {
  const detail = record(row.detail);
  const source = detail.source === "migration" ? "migration" : "admin";
  const cisKlub = record(detail.cisKlub);
  const rows = record(detail.rows);
  const counts = record(detail.counts);
  const main = text(detail.main) ?? (row.target?.replace(/^club:/, "") || "?");
  return {
    id: row.id,
    at: (source === "migration" ? parseMergedAt(detail.mergedAt) : null) ?? row.createdAt,
    loggedAt: row.createdAt,
    source,
    actor: row.actorEmail,
    main,
    merged: text(detail.merged) ?? "?",
    mergedName: latestName([
      ...(Array.isArray(cisKlub.moved) ? cisKlub.moved : []),
      ...(Array.isArray(cisKlub.dropped) ? cisKlub.dropped : []),
    ]),
    counts: {
      entries: count(counts, "mcvv_prihlaska_radek", length(rows.mcvv_prihlaska_radek)),
      starts: count(counts, "mcvv_start", length(rows.mcvv_start)),
      results: count(counts, "mcvv_time", length(rows.mcvv_time)),
    },
  };
}
