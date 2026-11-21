/**
 * Audit v2 (P9): jednotný přehled auditu a deníků dne závodu (start, mezičasy). Čisté
 * funkce: filtry z URL, query string, CSV.
 */

export const UNIFIED_KINDS = ["audit", "split", "start"] as const;
export type UnifiedKind = (typeof UNIFIED_KINDS)[number];
export const UNIFIED_PAGE_SIZE = 50;
export const UNIFIED_CSV_LIMIT = 20_000;

export type UnifiedFilters = {
  kind: UnifiedKind | null;
  actor: string;
  role: string;
  action: string;
  entity: string;
  source: string;
  year: number | null;
  bib: number | null;
  from: string | null;
  to: string | null;
  page: number;
};

export type UnifiedSearchParams = {
  druh?: string;
  kdo?: string;
  role?: string;
  akce?: string;
  entita?: string;
  zdroj?: string;
  rok?: string;
  cislo?: string;
  od?: string;
  do?: string;
  strana?: string;
};

export type UnifiedRow = {
  kind: UnifiedKind;
  id: number;
  at: Date;
  userId: number | null;
  who: string;
  roles: string | null;
  action: string;
  target: string | null;
  year: number | null;
  bib: number | null;
  entity: string | null;
  source: string | null;
  outcome: string | null;
  detail: string | null;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TOKEN_RE = /^[a-z0-9_.:-]{1,64}$/i;

function dateParam(value: string | undefined): string | null {
  const match = DATE_RE.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? match[0] : null;
}

function token(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return TOKEN_RE.test(trimmed) ? trimmed : "";
}

function intParam(value: string | undefined, min: number, max: number): number | null {
  if (!value || !/^\d{1,5}$/.test(value.trim())) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

export function parseUnifiedFilters(sp: UnifiedSearchParams): UnifiedFilters {
  return {
    kind: UNIFIED_KINDS.includes(sp.druh as UnifiedKind) ? (sp.druh as UnifiedKind) : null,
    actor: (sp.kdo ?? "").trim().slice(0, 80),
    role: token(sp.role),
    action: token(sp.akce),
    entity: token(sp.entita),
    source: token(sp.zdroj),
    year: intParam(sp.rok, 1990, 2100),
    bib: intParam(sp.cislo, 1, 32767),
    from: dateParam(sp.od),
    to: dateParam(sp.do),
    page: Math.max(1, Math.min(10_000, Number.parseInt(sp.strana ?? "", 10) || 1)),
  };
}

/** Query string filtru (bez stránky). */
export function unifiedQuery(filters: UnifiedFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.kind) out.druh = filters.kind;
  if (filters.actor) out.kdo = filters.actor;
  if (filters.role) out.role = filters.role;
  if (filters.action) out.akce = filters.action;
  if (filters.entity) out.entita = filters.entity;
  if (filters.source) out.zdroj = filters.source;
  if (filters.year !== null) out.rok = String(filters.year);
  if (filters.bib !== null) out.cislo = String(filters.bib);
  if (filters.from) out.od = filters.from;
  if (filters.to) out.do = filters.to;
  return out;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Ochrana proti vzorcům v Excelu.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_COLUMNS = [
  "kind",
  "id",
  "at",
  "userId",
  "who",
  "roles",
  "action",
  "target",
  "year",
  "bib",
  "entity",
  "source",
  "outcome",
  "detail",
] as const satisfies readonly (keyof UnifiedRow)[];

/** CSV (UTF-8 s BOM, čárky, časy v UTC ISO 8601). */
export function unifiedCsv(rows: readonly UnifiedRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export type UnifiedStats = {
  total: number;
  byKind: Record<UnifiedKind, number>;
  /** Hodina (Europe/Prague, „YYYY-MM-DD HH“) → počty zápisů startu a mezičasů. */
  byHour: { hour: string; split: number; start: number }[];
  topActors: { who: string; count: number }[];
  corrections: number;
  deletions: number;
  conflicts: number;
  rejected: number;
  duplicates: number;
};

const HOUR_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Přehledy pro vybraný rok: zápisy za hodinu, top aktéři, opravy, konflikty. */
export function unifiedStats(rows: readonly UnifiedRow[]): UnifiedStats {
  const byKind: Record<UnifiedKind, number> = { audit: 0, split: 0, start: 0 };
  const hours = new Map<string, { split: number; start: number }>();
  const actors = new Map<string, number>();
  const stats: UnifiedStats = {
    total: rows.length,
    byKind,
    byHour: [],
    topActors: [],
    corrections: 0,
    deletions: 0,
    conflicts: 0,
    rejected: 0,
    duplicates: 0,
  };
  for (const row of rows) {
    byKind[row.kind] += 1;
    actors.set(row.who, (actors.get(row.who) ?? 0) + 1);
    if (row.action.endsWith(".correct")) stats.corrections += 1;
    if (row.action.endsWith(".delete")) stats.deletions += 1;
    if (row.outcome === "conflict") stats.conflicts += 1;
    if (row.outcome === "rejected") stats.rejected += 1;
    if (row.outcome === "duplicate") stats.duplicates += 1;
    if (row.kind !== "audit") {
      const hour = HOUR_FORMAT.format(row.at).slice(0, 13);
      const bucket = hours.get(hour) ?? { split: 0, start: 0 };
      bucket[row.kind] += 1;
      hours.set(hour, bucket);
    }
  }
  stats.byHour = [...hours.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, counts]) => ({ hour, ...counts }));
  stats.topActors = [...actors.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([who, count]) => ({ who, count }));
  return stats;
}
