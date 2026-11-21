/**
 * Stanoviště mezičasů a kódy splitů (legacy `mcvv_split.split`): 1 = 1,3 km, 3 = 2,7 km, 9 = cíl.
 * Seznam stanovišť pro splitmakery je v nastavení (`live_stations`), výchozí 1 a 3.
 */
export const FINISH_SPLIT = "9";
export const LIVE_STATIONS_KEY = "live_stations";
export const LIVE_STATIONS_MAX = 2000;
/** Kolik mezičasů smí být veřejných (živé výsledky, tabule, speaker), #316. */
export const LIVE_PUBLIC_SPLITS_MAX_KEY = "live_public_splits_max";
export const DEFAULT_PUBLIC_SPLITS_MAX = 3;
/** Kolik veřejných mezičasů dnes umí veřejné výstupy (M1, M2). */
export const PUBLIC_OUTPUT_SLOTS = 2;

/**
 * Mezičas (#316): kód splitu, popis, pozice na trati ve stovkách metrů (15 = 1,5 km) a jestli je
 * veřejný. Pozice a příznak jsou volitelné kvůli starším zápisům (`kód=popis`).
 */
export type Station = { code: string; label: string; position?: number | null; public?: boolean };

export const DEFAULT_STATIONS: Station[] = [
  { code: "1", label: "1,3 km", position: 13, public: true },
  { code: "3", label: "2,7 km", position: 27, public: true },
];

/**
 * Stanoviště „Start“ (#203): evidence, kdo opravdu odstartoval. Kód "0" není kód splitu –
 * zápisy ze startu nejdou do `mcvv_split` (výsledky), ale do `mcvv_start_check`.
 * Je vestavěné (není v `live_stations`), splitmakerovi se přiřazuje jako ostatní stanoviště.
 */
export const START_STATION = "0";
export const START_STATION_LABEL = "Start";

export function isStartStation(code: unknown): boolean {
  return code === START_STATION;
}

/** Stanoviště pro klienta i server včetně startu (start první). */
export function withStart(stations: Station[]): Station[] {
  return [
    { code: START_STATION, label: START_STATION_LABEL },
    ...stations.filter((s) => s.code !== START_STATION),
  ];
}

/** Kód stanoviště ve webovém klientu: split 1–9 nebo start 0. */
export function isStationCode(value: unknown): value is string {
  return isSplitCode(value) || isStartStation(value);
}

/** Kód splitu = jeden znak 1–9 nebo a–z (sloupec char(1); 9 = cíl), #316. */
export function isSplitCode(value: unknown): value is string {
  return typeof value === "string" && /^[1-9a-z]$/.test(value);
}

/** Pozice z popisu ve starém zápisu (`1,3 km` → 13). */
export function positionFromLabel(label: string): number | null {
  const match = /(\d{1,2})(?:[,.](\d))?\s*km/i.exec(label);
  if (!match) return null;
  return Number(match[1]) * 10 + Number(match[2] ?? 0);
}

const PUBLIC_WORDS = new Set(["v", "veřejný", "verejny", "veřejné", "public", "1", "ano", "yes"]);
const PRIVATE_WORDS = new Set([
  "",
  "n",
  "neveřejný",
  "neverejny",
  "interní",
  "interni",
  "private",
  "0",
  "ne",
  "no",
]);

/**
 * Parsuje řádky `kód=popis` (např. `1=1,3 km`). Neplatné řádky přeskočí, duplicitní kód
 * bere první, cíl (9) do seznamu stanovišť pro splitmakery nepatří. Prázdný výsledek → výchozí.
 */
export function parseStations(raw: string | null | undefined): Station[] {
  const seen = new Set<string>();
  const stations: Station[] = [];
  for (const line of (raw ?? "").split(/\r?\n/)) {
    const match =
      /^\s*([1-9a-zA-Z])\s*=\s*([^|]{1,40}?)\s*(?:\|\s*(\d{0,3})\s*(?:\|\s*(\S*)\s*)?)?$/.exec(
        line,
      );
    if (!match) continue;
    const code = match[1].toLowerCase();
    if (code === FINISH_SPLIT || seen.has(code)) continue;
    const label = match[2];
    const extended = match[3] !== undefined;
    const flag = (match[4] ?? "").toLowerCase();
    if (extended && !PUBLIC_WORDS.has(flag) && !PRIVATE_WORDS.has(flag)) continue;
    seen.add(code);
    stations.push({
      code,
      label,
      position: match[3] ? Number(match[3]) : positionFromLabel(label),
      // starý zápis `kód=popis`: veřejné jako dosud (první dva na výstupech)
      public: extended ? PUBLIC_WORDS.has(flag) : true,
    });
  }
  return stations.length > 0 ? stations : DEFAULT_STATIONS;
}

/** Zápis do nastavení / editoru: `kód=popis | pozice | veřejný|interní`. */
export function formatStations(stations: Station[]): string {
  return stations
    .map(
      (s) =>
        `${s.code}=${s.label} | ${s.position ?? ""} | ${s.public === false ? "interní" : "veřejný"}`,
    )
    .join("\n");
}

/** Mezičasy seřazené podle pozice na trati (bez pozice na konec, pak podle zápisu). */
export function byPosition(stations: readonly Station[]): Station[] {
  return stations
    .map((station, index) => ({ station, index }))
    .sort(
      (a, b) =>
        (a.station.position ?? Number.MAX_SAFE_INTEGER) -
          (b.station.position ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
    )
    .map((entry) => entry.station);
}

export function parsePublicMax(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return DEFAULT_PUBLIC_SPLITS_MAX;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 9 ? n : DEFAULT_PUBLIC_SPLITS_MAX;
}

/** Veřejné mezičasy podle pozice, nejvýš `max` (víc označených se na výstupy nedostane). */
export function publicStations(stations: readonly Station[], max: number): Station[] {
  return byPosition(stations)
    .filter((s) => s.public !== false)
    .slice(0, max);
}

/** Autor zápisu z webu: kód stanoviště jako v legacy (`spl1`, `spl3`). */
export function webAuthor(split: string): string {
  return `spl${split}`;
}
