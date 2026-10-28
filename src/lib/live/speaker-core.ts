/**
 * Obrazovka pro speakera (#188) – čistá logika bez DB a prohlížečových API.
 *
 * Server posílá jen surová data (startovka s plánovanými starty a zapsané časy), všechno, co
 * závisí na „teď“ (pořadí, ✓ konečné, živý čas, virtuální pořadí), se počítá v prohlížeči
 * každou sekundu přes tyhle funkce. Časy jsou v celých sekundách: `start` je okamžik startu
 * (epoch s), `m1`/`m2`/`fin` čas od startu (jako `mcvv_split.time`).
 */

export type PointKey = "m1" | "m2" | "fin";
export const POINTS: readonly PointKey[] = ["m1", "m2", "fin"];

export type SpeakerRunner = {
  bib: number;
  name: string;
  /** Id kategorie. */
  cat: string;
  /** Plánovaný start (epoch, s) podle startovky a pravidel startu (vč. zkušební nuly). */
  start: number;
  m1: number | null;
  m2: number | null;
  fin: number | null;
};

export type SpeakerCategory = { id: string; name: string; sex: string };

/** Odpověď `/api/live/speaker` (bez „teď“, aby se ETag neměnil zbytečně). */
export type SpeakerSnapshot = {
  year: number;
  /** Běží testovací běh (#186) – obrazovka ukáže TEST. */
  test: boolean;
  categories: SpeakerCategory[];
  runners: SpeakerRunner[];
};

export const TOP = 10;
/** Zvýraznění průchodu v poslední minutě. */
export const RECENT_S = 60;
export const RECENT_PASSAGES = 6;

const LEVEL: Record<PointKey, number> = { m1: 1, m2: 2, fin: 3 };
const KEY_AT: readonly (PointKey | null)[] = [null, "m1", "m2", "fin"];

/** Nejdál dosažený bod se záznamem (cíl > M2 > M1), nebo null. */
export function lastPoint(r: SpeakerRunner): PointKey | null {
  if (r.fin != null) return "fin";
  if (r.m2 != null) return "m2";
  if (r.m1 != null) return "m1";
  return null;
}

/** Další bod, na který běžec ještě nedoběhl (null = v cíli). */
export function nextPoint(r: SpeakerRunner): PointKey | null {
  if (r.fin != null) return null;
  if (r.m2 != null) return "fin";
  if (r.m1 != null) return "m2";
  return "m1";
}

export function level(r: SpeakerRunner): number {
  const k = lastPoint(r);
  return k ? LEVEL[k] : 0;
}

export function hasRecord(r: SpeakerRunner): boolean {
  return lastPoint(r) !== null;
}

/** Živý čas od plánovaného startu (záporný před startem). */
export function elapsed(r: SpeakerRunner, now: number): number {
  return now - r.start;
}

/**
 * Půjde vkládaný běžec `a` (úroveň ≤ úroveň `x`) nad `x`? Porovnání na nejvzdálenějším
 * SPOLEČNÉM bodu; při shodě zůstane výš ten, kdo je dál (tj. `x`). Kdo je na trati a jeho
 * živý čas už přesáhl čas soupeře na soupeřově nejdál dosaženém bodu, ho už nedožene → pod něj.
 * Když `x` na společném bodu záznam nemá (vynechaný mezičas), zůstává výš, protože je dál.
 */
export function beats(a: SpeakerRunner, x: SpeakerRunner, now: number): boolean {
  const la = level(a);
  const lx = level(x);
  const k = KEY_AT[Math.min(la, lx)];
  if (!k) return false;
  if (lx > la) {
    const xFurthest = x[KEY_AT[lx] as PointKey] as number;
    if (elapsed(a, now) > xFurthest) return false;
  }
  const av = a[k];
  const xv = x[k];
  if (av == null || xv == null) return false;
  return av < xv;
}

/**
 * Jeden společný seznam kategorie (bez dělení na doběhlé a běžce na trati). Porovnání
 * `beats` není tranzitivní (A v cíli > C na M1 > B na M2 > A), proto se neřadí přes sort(),
 * ale deterministicky po úrovních: doběhlí podle cílového času, pak běžci na M2 podle M2
 * a nakonec na M1 podle M1; každý se vloží těsně NAD prvního v dosavadním seznamu, kterého
 * na společném bodu porazí (jinak na konec). Pořadí dál dobězlých se tím nemění.
 * Do seznamu patří jen běžci s aspoň jedním záznamem.
 */
export function combinedOrder(runners: readonly SpeakerRunner[], now: number): SpeakerRunner[] {
  const list: SpeakerRunner[] = [];
  for (const L of [3, 2, 1]) {
    const k = KEY_AT[L] as PointKey;
    const group = runners
      .filter((r) => level(r) === L)
      .sort((a, b) => (a[k] as number) - (b[k] as number) || a.bib - b.bib);
    for (const r of group) {
      const i = list.findIndex((x) => beats(r, x, now));
      if (i < 0) list.push(r);
      else list.splice(i, 0, r);
    }
  }
  return list;
}

/** Pořadí na bodu: 1 + počet běžců kategorie s lepším časem na tom bodu (shoda = stejné). */
export function rankAt(runners: readonly SpeakerRunner[], key: PointKey, value: number): number {
  let better = 0;
  for (const r of runners) {
    const v = r[key];
    if (v != null && v < value) better += 1;
  }
  return 1 + better;
}

/**
 * Konečné pořadí doběhlého (zelené ✓): žádný nedoběhlý běžec kategorie ho už nepředběhne,
 * ani kdyby právě teď proběhl cílem. Počítají se VŠICHNI nedoběhlí, i bez záznamu – jejich
 * virtuální čas je teď − plánovaný start; kdo ještě nestartoval, ✓ blokuje.
 */
export function isFinalFinish(
  finTime: number,
  unfinished: readonly SpeakerRunner[],
  now: number,
): boolean {
  return unfinished.every((r) => elapsed(r, now) > finTime);
}

/** Virtuální pořadí: kam by se běžec zařadil mezi doběhlé, kdyby doběhl právě teď. */
export function virtualRank(finTimes: readonly number[], live: number): number {
  let better = 0;
  for (const t of finTimes) if (t < live) better += 1;
  return 1 + better;
}

/** Poslední zapsaný bod do minuty od průchodu. */
export function recentHit(r: SpeakerRunner, now: number, windowS = RECENT_S): boolean {
  const k = lastPoint(r);
  if (!k) return false;
  const at = r.start + (r[k] as number);
  return now >= at && now - at <= windowS;
}

export type ShownRow = {
  runner: SpeakerRunner;
  /** Pořadí mezi doběhlými; null = na trati (prázdná buňka). */
  rank: number | null;
  /** ✓ – pořadí doběhlého je konečné. */
  final: boolean;
  /** Průchod v poslední minutě. */
  recent: boolean;
};

export type CategoryState = {
  /** Celý společný seznam (běžci se záznamem). */
  order: SpeakerRunner[];
  shown: ShownRow[];
  finished: number;
  /** Na trati se záznamem (bez cíle). */
  onCourse: number;
  /** Celá zobrazená top 10 je konečná (nebo už nikdo nedoběhlý nezbývá). */
  done: boolean;
  /** Cílové časy doběhlých, vzestupně. */
  finTimes: number[];
};

export function categoryState(
  runners: readonly SpeakerRunner[],
  now: number,
  top = TOP,
): CategoryState {
  const finTimes = runners
    .filter((r) => r.fin != null)
    .map((r) => r.fin as number)
    .sort((a, b) => a - b);
  const unfinished = runners.filter((r) => r.fin == null);
  const order = combinedOrder(
    runners.filter((r) => hasRecord(r)),
    now,
  );
  const shown = order.slice(0, top).map((runner): ShownRow => {
    const isFin = runner.fin != null;
    return {
      runner,
      rank: isFin ? virtualRank(finTimes, runner.fin as number) : null,
      final: isFin && isFinalFinish(runner.fin as number, unfinished, now),
      recent: recentHit(runner, now),
    };
  });
  const done =
    order.length > 0 &&
    shown.every((row) => row.final) &&
    (order.length >= top || unfinished.length === 0);
  return {
    order,
    shown,
    finished: finTimes.length,
    onCourse: unfinished.filter((r) => hasRecord(r)).length,
    done,
    finTimes,
  };
}

export type Passage = {
  runner: SpeakerRunner;
  point: PointKey;
  /** Okamžik průchodu (epoch s). */
  at: number;
  time: number;
  /** Pořadí v kategorii na daném bodu. */
  rank: number;
};

/** Nejnovější průchody napříč kategoriemi (jen ty, které už nastaly). */
export function recentPassages(
  runners: readonly SpeakerRunner[],
  now: number,
  limit = RECENT_PASSAGES,
): Passage[] {
  const all: Omit<Passage, "rank">[] = [];
  for (const runner of runners) {
    for (const point of POINTS) {
      const time = runner[point];
      if (time == null) continue;
      const at = runner.start + time;
      if (at <= now) all.push({ runner, point, at, time });
    }
  }
  all.sort((a, b) => b.at - a.at || LEVEL[b.point] - LEVEL[a.point] || a.runner.bib - b.runner.bib);
  const byCat = byCategory(runners);
  return all.slice(0, limit).map((p) => ({
    ...p,
    rank: rankAt(byCat.get(p.runner.cat) ?? [], p.point, p.time),
  }));
}

/* ---------- vyhledávání ---------- */

/** Bez diakritiky a velikosti písmen. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export type SearchEntry = { runner: SpeakerRunner; n: string; words: string[]; b: string };

export function buildSearchIndex(runners: readonly SpeakerRunner[]): SearchEntry[] {
  return runners.map((runner) => {
    const n = normalizeSearch(runner.name);
    return { runner, n, words: n.split(/[\s-]+/).filter(Boolean), b: String(runner.bib) };
  });
}

/**
 * Našeptávač: číslo (prefix) nebo jméno (prefix slova, jinak podřetězec), víc slov = všechna.
 * Přesná shoda čísla první, pak shody na začátku slov, pak abecedně.
 */
export function searchRunners(index: readonly SearchEntry[], query: string, limit = 6) {
  const q = normalizeSearch(query.trim());
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const prefixAll = (x: SearchEntry) =>
    tokens.every((t) => /^\d+$/.test(t) || x.words.some((w) => w.startsWith(t)));
  const hits = index.filter((x) =>
    tokens.every((t) =>
      /^\d+$/.test(t) ? x.b.startsWith(t) : x.words.some((w) => w.startsWith(t)) || x.n.includes(t),
    ),
  );
  hits.sort(
    (a, b) =>
      Number(b.b === q) - Number(a.b === q) ||
      Number(prefixAll(b)) - Number(prefixAll(a)) ||
      a.n.localeCompare(b.n, "cs") ||
      a.runner.bib - b.runner.bib,
  );
  return hits.slice(0, limit).map((x) => x.runner);
}

/** Úseky jména k zvýraznění (shoda bez ohledu na diakritiku); čísla se nezvýrazňují. */
export function highlightRanges(name: string, query: string): boolean[] {
  const marks = new Array<boolean>(name.length).fill(false);
  // NFD rozloží písmena s diakritikou, ale po odstranění znamének zůstane délka stejná
  // jen u znaků, které se rozkládají na 1 základ + znaménka – pro češtinu platí.
  const n = normalizeSearch(name);
  if (n.length !== name.length) return marks;
  for (const t of normalizeSearch(query)
    .split(/\s+/)
    .filter((t) => t && !/^\d+$/.test(t))) {
    const i = n.indexOf(t);
    if (i >= 0) for (let j = i; j < i + t.length; j += 1) marks[j] = true;
  }
  return marks;
}

/* ---------- stavová karta ---------- */

export type RunnerStatus =
  | { kind: "before-start"; start: number; inS: number }
  | { kind: "finished"; time: number; rank: number; final: boolean }
  | {
      kind: "on-course";
      live: number;
      last: { point: PointKey; time: number; rank: number } | null;
      next: PointKey;
      /** Kam by se zařadil mezi doběhlé, kdyby doběhl teď. */
      virtualRank: number;
      start: number;
    };

export function runnerStatus(
  r: SpeakerRunner,
  catRunners: readonly SpeakerRunner[],
  now: number,
): RunnerStatus {
  const finTimes = catRunners.filter((x) => x.fin != null).map((x) => x.fin as number);
  if (r.fin != null) {
    const unfinished = catRunners.filter((x) => x.fin == null);
    return {
      kind: "finished",
      time: r.fin,
      rank: virtualRank(finTimes, r.fin),
      final: isFinalFinish(r.fin, unfinished, now),
    };
  }
  const k = lastPoint(r);
  if (now < r.start && !k) return { kind: "before-start", start: r.start, inS: r.start - now };
  const live = elapsed(r, now);
  return {
    kind: "on-course",
    live,
    last: k
      ? { point: k, time: r[k] as number, rank: rankAt(catRunners, k, r[k] as number) }
      : null,
    next: nextPoint(r) as PointKey,
    virtualRank: virtualRank(finTimes, live),
    start: r.start,
  };
}

/* ---------- formátování ---------- */

/** `m:ss` (minuty bez omezení, jako výsledky). */
export function formatMinutes(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(seconds));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

let clockFormat: Intl.DateTimeFormat | null = null;

/** Denní čas `HH:MM:SS` v Europe/Prague z epoch sekund. */
export function formatDayTime(epochS: number): string {
  clockFormat ??= new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return clockFormat.format(new Date(epochS * 1000));
}

/** Seskupí běžce podle kategorie. */
export function byCategory(runners: readonly SpeakerRunner[]): Map<string, SpeakerRunner[]> {
  const map = new Map<string, SpeakerRunner[]>();
  for (const r of runners) {
    const list = map.get(r.cat) ?? [];
    list.push(r);
    map.set(r.cat, list);
  }
  return map;
}
