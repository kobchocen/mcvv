/**
 * Stanoviště mezičasů a kódy splitů (legacy `mcvv_split.split`): 1 = 1,3 km, 3 = 2,7 km, 9 = cíl.
 * Seznam stanovišť pro splitmakery je v nastavení (`live_stations`), výchozí 1 a 3.
 */
export const FINISH_SPLIT = "9";
export const LIVE_STATIONS_KEY = "live_stations";
export const LIVE_STATIONS_MAX = 500;

export type Station = { code: string; label: string };

export const DEFAULT_STATIONS: Station[] = [
  { code: "1", label: "1,3 km" },
  { code: "3", label: "2,7 km" },
];

/** Kód splitu = jedna číslice 1–9 (sloupec char(1)). */
export function isSplitCode(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]$/.test(value);
}

/**
 * Parsuje řádky `kód=popis` (např. `1=1,3 km`). Neplatné řádky přeskočí, duplicitní kód
 * bere první, cíl (9) do seznamu stanovišť pro splitmakery nepatří. Prázdný výsledek → výchozí.
 */
export function parseStations(raw: string | null | undefined): Station[] {
  const seen = new Set<string>();
  const stations: Station[] = [];
  for (const line of (raw ?? "").split(/\r?\n/)) {
    const match = /^\s*([1-9])\s*=\s*(.{1,40}?)\s*$/.exec(line);
    if (!match || match[1] === FINISH_SPLIT || seen.has(match[1])) continue;
    seen.add(match[1]);
    stations.push({ code: match[1], label: match[2] });
  }
  return stations.length > 0 ? stations : DEFAULT_STATIONS;
}

export function formatStations(stations: Station[]): string {
  return stations.map((s) => `${s.code}=${s.label}`).join("\n");
}

/** Autor zápisu z webu: kód stanoviště jako v legacy (`spl1`, `spl3`). */
export function webAuthor(split: string): string {
  return `spl${split}`;
}
