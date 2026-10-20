import { startSeriesForBib, type StartModel } from "./start-time";

/** Rozsah čísel kategorie pro ročník. */
export type BibRange = { categoryId: string; bibFrom: number; bibTo: number };

export type ChampionBibs = { men: number | null; women: number | null };

export type StartSettingsIssue =
  | { code: "zero" }
  | { code: "interval" }
  | { code: "secondStart" }
  | { code: "rangeOrder"; categoryId: string }
  | { code: "rangeSeries"; categoryId: string }
  | { code: "rangeOverlap"; categoryId: string; other: string }
  | { code: "championInRange"; bib: number; categoryId: string }
  | { code: "championSame" };

/**
 * Kontrola nastavení startu ročníku (#114): rozsahy se nepřekrývají, každý leží celý
 * v jednom startu, čísla obhájců jsou kladná, různá a mimo rozsahy kategorií.
 */
export function validateStartSettings(
  model: StartModel,
  ranges: BibRange[],
  champions: ChampionBibs,
): StartSettingsIssue[] {
  const issues: StartSettingsIssue[] = [];
  if (!Number.isInteger(model.zeroSeconds) || model.zeroSeconds < 0 || model.zeroSeconds >= 86400) {
    issues.push({ code: "zero" });
  }
  if (
    !Number.isInteger(model.intervalSeconds) ||
    model.intervalSeconds < 1 ||
    model.intervalSeconds > 600
  ) {
    issues.push({ code: "interval" });
  }
  if (
    !Number.isInteger(model.secondStartFrom) ||
    model.secondStartFrom < 2 ||
    model.secondStartFrom > 9999
  ) {
    issues.push({ code: "secondStart" });
  }
  for (const range of ranges) {
    if (range.bibFrom < 1 || range.bibTo < range.bibFrom) {
      issues.push({ code: "rangeOrder", categoryId: range.categoryId });
      continue;
    }
    if (startSeriesForBib(model, range.bibFrom) !== startSeriesForBib(model, range.bibTo)) {
      issues.push({ code: "rangeSeries", categoryId: range.categoryId });
    }
  }
  const sorted = [...ranges]
    .filter((range) => range.bibFrom >= 1 && range.bibTo >= range.bibFrom)
    .sort((a, b) => a.bibFrom - b.bibFrom);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].bibFrom <= sorted[i - 1].bibTo) {
      issues.push({
        code: "rangeOverlap",
        categoryId: sorted[i].categoryId,
        other: sorted[i - 1].categoryId,
      });
    }
  }
  const bibs = [champions.men, champions.women].filter((bib): bib is number => bib != null);
  for (const bib of bibs) {
    const hit = ranges.find((range) => bib >= range.bibFrom && bib <= range.bibTo);
    if (hit) {
      issues.push({ code: "championInRange", bib, categoryId: hit.categoryId });
    }
  }
  if (champions.men != null && champions.men === champions.women) {
    issues.push({ code: "championSame" });
  }
  return issues;
}

export type BibInterval = { from: number; to: number | null };

/**
 * Rezerva čísel (rozhodnutí Pavla): v každém startu čísla za posledním běžně přiděleným číslem
 * až před číslo obhájce, a vše za číslem obhájce až do konce startu (1. start končí číslem
 * `secondStartFrom - 1`, 2. start je otevřený). Generátor je nepřiděluje; slouží pro ruční
 * přidělení (přihlášky na místě apod.).
 *
 * `lastRegular` = nejvyšší přidělené číslo startu mimo čísla obhájců (null = nic přiděleno,
 * pak se bere konec posledního rozsahu kategorie v tomto startu).
 */
export function reserveIntervals(
  model: StartModel,
  series: 1 | 2,
  championBib: number | null,
  lastRegular: number | null,
  ranges: BibRange[],
): BibInterval[] {
  const first = series === 1 ? 1 : model.secondStartFrom;
  const end = series === 1 ? model.secondStartFrom - 1 : null;
  const seriesRanges = ranges.filter((range) => startSeriesForBib(model, range.bibFrom) === series);
  const rangeEnd = seriesRanges.reduce((max, range) => Math.max(max, range.bibTo), first - 1);
  const last = Math.max(lastRegular ?? rangeEnd, first - 1);
  const champion =
    championBib != null && startSeriesForBib(model, championBib) === series && championBib > last
      ? championBib
      : null;
  const out: BibInterval[] = [];
  const push = (from: number, to: number | null) => {
    if (to == null || to >= from) {
      out.push({ from, to });
    }
  };
  if (champion != null) {
    push(last + 1, champion - 1);
    push(champion + 1, end);
  } else {
    push(last + 1, end);
  }
  return out;
}

export function formatInterval(interval: BibInterval): string {
  if (interval.to == null) {
    return `${interval.from}+`;
  }
  return interval.from === interval.to ? String(interval.from) : `${interval.from}–${interval.to}`;
}

/** Kódy chyb do URL (`?chyba=rangeOverlap.B.A,zero`). */
export function encodeStartIssues(issues: StartSettingsIssue[]): string {
  return issues
    .map((issue) => {
      switch (issue.code) {
        case "rangeOrder":
        case "rangeSeries":
          return `${issue.code}.${issue.categoryId}`;
        case "rangeOverlap":
          return `${issue.code}.${issue.categoryId}.${issue.other}`;
        case "championInRange":
          return `${issue.code}.${issue.categoryId}.${issue.bib}`;
        default:
          return issue.code;
      }
    })
    .join(",");
}

export type DecodedIssue = { code: string; category?: string; other?: string };

export function decodeStartIssues(raw: string | null | undefined): DecodedIssue[] {
  const known = new Set([
    "zero",
    "interval",
    "secondStart",
    "rangeOrder",
    "rangeSeries",
    "rangeOverlap",
    "championInRange",
    "championSame",
  ]);
  return (raw ?? "")
    .split(",")
    .map((token) => token.split("."))
    .filter(([code]) => known.has(code))
    .slice(0, 20)
    .map(([code, category, other]) => ({
      code,
      category: category?.slice(0, 4),
      other: other?.slice(0, 6),
    }));
}
