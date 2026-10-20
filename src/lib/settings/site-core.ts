/**
 * Site settings stored in mcvv_setting (key → text). Pure helpers, no DB access.
 */
export const STARTLIST_PUBLISHED_KEY = "startlist_published";
export const ONLINE_RESULTS_URL_KEY = "online_results_url";
export const STATS_MOMENT_KEY = "stats.moment";

export const SITE_SETTING_KEYS = [
  STARTLIST_PUBLISHED_KEY,
  ONLINE_RESULTS_URL_KEY,
  STATS_MOMENT_KEY,
] as const;

export type SiteSettings = {
  startlistPublished: boolean;
  onlineResultsUrl: string | null;
  statsMoment: string;
};

export const ONLINE_RESULTS_URL_MAX = 500;
export const STATS_MOMENT_MAX = 2000;

export function parseFlag(raw: string | null | undefined): boolean {
  return ["1", "true", "on", "yes"].includes((raw ?? "").trim().toLowerCase());
}

/** Absolute http(s) URL or null (empty input). Throws nothing; invalid → `{ error }`. */
export function parseHttpUrl(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false } {
  const value = (raw ?? "").trim();
  if (!value) {
    return { ok: true, value: null };
  }
  if (value.length > ONLINE_RESULTS_URL_MAX) {
    return { ok: false };
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
      return { ok: false };
    }
    if (url.username || url.password) {
      return { ok: false };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false };
  }
}

export function normalizeMoment(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
    .slice(0, STATS_MOMENT_MAX);
}

/** "Moment ročníku": the first line is the headline, the rest is the body. */
export function splitMoment(text: string): { headline: string; body: string } | null {
  const normalized = normalizeMoment(text);
  if (!normalized) {
    return null;
  }
  const [headline, ...rest] = normalized.split("\n");
  return { headline: headline.trim(), body: rest.join("\n").trim() };
}

export function siteSettingsFromRows(rows: { key: string; text: string }[]): SiteSettings {
  const map = new Map(rows.map((row) => [row.key, row.text]));
  const url = parseHttpUrl(map.get(ONLINE_RESULTS_URL_KEY));
  return {
    startlistPublished: parseFlag(map.get(STARTLIST_PUBLISHED_KEY)),
    onlineResultsUrl: url.ok ? url.value : null,
    statsMoment: normalizeMoment(map.get(STATS_MOMENT_KEY)),
  };
}
