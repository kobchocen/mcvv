/**
 * Veřejné online výsledky (náhrada OFeed) – čistá logika bez DB a prohlížečových API.
 *
 * Řazení, pořadí, ✓ konečné, virtuální pořadí a zvýraznění nových záznamů jsou 1:1 ze
 * speakeru (`speaker-core.ts`, #188); tady je jen to, co online výsledky přidávají: celá
 * kategorie místo top 10, sekce „odstartovali bez mezičasu“ / „čekají na start“ / DNS,
 * pozdní start a ztráta na vítěze. Všechno, co závisí na „teď“, počítá prohlížeč každou
 * sekundu. Časy jsou vždy od plánovaného startu ze startovky (Q115), i u pozdního startu.
 */

import {
  categoryState,
  hasRecord,
  lastPoint,
  normalizeSearch,
  virtualRank,
  type PointKey,
  type ShownRow,
  type SpeakerCategory,
  type SpeakerRunner,
} from "./speaker-core";

/** Lhůta DNS (Q114): bez záznamu startu i mezičasu tak dlouho po plánovaném startu → DNS. */
export const DEFAULT_DNS_GRACE_S = 5 * 60;
/** Záložní lhůta DNS (Q113): ročník / test, kde zatím není žádný záznam stanice Start. */
export const DEFAULT_DNS_GRACE_FALLBACK_S = 30 * 60;

export type OnlineRunner = SpeakerRunner & {
  /** Číslo má záznam stanice Start (`mcvv_start_check`). */
  started: boolean;
  /**
   * Pozdní start: o kolik sekund později než plán číslo odstartovalo, jen když je to nad
   * prahem odchylky na Startu (#228); jinak null. Čas se přesto počítá od plánu (Q115).
   */
  late: number | null;
};

export type OnlineCategory = SpeakerCategory & {
  /** Část URL `/vysledky/online/<slug>`. */
  slug: string;
  /** Krátký název na chip na mobilu (M 40, Ž 50, Dorci…). */
  short: string;
};

/** Odpověď veřejného `/api/live/results` – jen data pro zobrazení, bez „teď“. */
export type OnlineSnapshot = {
  year: number;
  /** Běží testovací běh (#186) – stránka ukáže TEST. */
  test: boolean;
  /** Platná lhůta DNS v sekundách (podle toho, zda ročník / test má záznam startu). */
  dnsGraceS: number;
  categories: OnlineCategory[];
  runners: OnlineRunner[];
};

/**
 * Kompaktní podoba snímku na drátě (`/api/live/results`): závodník jako n-tice
 * `[číslo, jméno, kategorie, plánovaný start (epoch s), M1, M2, cíl, start potvrzen 0/1,
 * pozdní start s | null]`. Proti objektům zhruba poloviční payload; běžící časy si počítá
 * klient z plánovaného startu a mezičasů.
 */
export type OnlineWireRunner = [
  number,
  string,
  string,
  number,
  number | null,
  number | null,
  number | null,
  0 | 1,
  number | null,
];

export type OnlineWire = Omit<OnlineSnapshot, "runners"> & { r: OnlineWireRunner[] };

export function encodeOnline({ runners, ...rest }: OnlineSnapshot): OnlineWire {
  return {
    ...rest,
    r: runners.map((x) => [
      x.bib,
      x.name,
      x.cat,
      x.start,
      x.m1,
      x.m2,
      x.fin,
      x.started ? 1 : 0,
      x.late,
    ]),
  };
}

export function decodeOnline({ r, ...rest }: OnlineWire): OnlineSnapshot {
  return {
    ...rest,
    runners: r.map(([bib, name, cat, start, m1, m2, fin, started, late]) => ({
      bib,
      name,
      cat,
      start,
      m1,
      m2,
      fin,
      started: started === 1,
      late,
    })),
  };
}

/** Q113: s aspoň jedním záznamem startu platí kratší lhůta, jinak záložní (výchozí 30 min). */
export function effectiveDnsGrace(
  hasStartRecords: boolean,
  graceS: number,
  fallbackS: number,
): number {
  return hasStartRecords ? graceS : fallbackS;
}

/** Odchylka startu (+ = později) → štítek „pozdní start“, jen nad prahem (#228). */
export function lateStart(offsetS: number | null | undefined, limitS: number): number | null {
  return offsetS != null && offsetS > limitS ? offsetS : null;
}

/** Odstartoval = má záznam Startu nebo jakýkoli mezičas (mezičas bez Startu = Start ho přehlédl). */
export function hasStarted(r: OnlineRunner): boolean {
  return r.started || hasRecord(r);
}

/**
 * DNS: bez záznamu startu i mezičasu déle než lhůta po plánovaném startu. Stav se počítá
 * pokaždé znovu, takže když záznam přijde později (pozdní start), běžec se vrátí mezi běžce.
 */
export function isDns(r: OnlineRunner, now: number, graceS: number): boolean {
  return !hasStarted(r) && now > r.start + graceS;
}

const byStart = (a: OnlineRunner, b: OnlineRunner) => a.start - b.start || a.bib - b.bib;

export type OnlineCategoryState = {
  /** ① společný seznam (cíl + na trati) – stejné řádky jako speaker, jen celá kategorie. */
  rows: (ShownRow & { runner: OnlineRunner })[];
  /** ① na konci: odstartovali (záznam Startu), zatím bez mezičasu – podle startu. */
  running: OnlineRunner[];
  /** ② čekají na start – podle startovního času. */
  waiting: OnlineRunner[];
  /** ③ nestartovali (DNS) – podle startovního času. */
  dns: OnlineRunner[];
  total: number;
  finished: number;
  /** Na trati: se záznamem bez cíle + odstartovaní bez mezičasu. */
  onCourse: number;
  /** Nejlepší cílový čas (pro ztrátu), nebo null. */
  best: number | null;
  /** Cílové časy doběhlých vzestupně (virtuální pořadí). */
  finTimes: number[];
  /** Kategorie je konečná: všichni doběhlí mají ✓ a nikdo není na trati ani nečeká. */
  done: boolean;
  /** Průchod v poslední minutě (tečka na záložce). */
  recent: boolean;
  /** Nejdřívější a nejpozdější plánovaný start kategorie. */
  firstStart: number | null;
  lastStart: number | null;
};

export function onlineCategoryState(
  runners: readonly OnlineRunner[],
  now: number,
  graceS: number,
): OnlineCategoryState {
  // celý společný seznam ze speakeru (bez omezení na top 10)
  const base = categoryState(runners, now, Number.POSITIVE_INFINITY);
  const rows = base.shown as OnlineCategoryState["rows"];
  const noRecord = runners.filter((r) => !hasRecord(r)).sort(byStart);
  const running = noRecord.filter((r) => r.started);
  const waiting: OnlineRunner[] = [];
  const dns: OnlineRunner[] = [];
  for (const r of noRecord) {
    if (r.started) continue;
    (isDns(r, now, graceS) ? dns : waiting).push(r);
  }
  const onCourse = base.onCourse + running.length;
  const starts = runners.map((r) => r.start);
  return {
    rows,
    running,
    waiting,
    dns,
    total: runners.length,
    finished: base.finished,
    onCourse,
    best: base.finTimes[0] ?? null,
    finTimes: base.finTimes,
    done:
      base.finished > 0 &&
      rows.every((row) => row.runner.fin == null || row.final) &&
      onCourse === 0 &&
      waiting.length === 0,
    recent: rows.some((row) => row.recent),
    firstStart: starts.length ? Math.min(...starts) : null,
    lastStart: starts.length ? Math.max(...starts) : null,
  };
}

/** Ztráta na vítěze v sekundách (vítěz a nedoběhlí → null). */
export function lossOf(fin: number | null, best: number | null): number | null {
  if (fin == null || best == null || fin === best) return null;
  return fin - best;
}

/** Krátký stav běžce do výsledků hledání. */
export type SearchStatus =
  | { kind: "finished"; time: number; rank: number }
  | { kind: "on-course"; point: PointKey; time: number }
  | { kind: "running"; live: number }
  | { kind: "waiting"; start: number }
  | { kind: "dns" };

export function searchStatus(
  r: OnlineRunner,
  catRunners: readonly OnlineRunner[],
  now: number,
  graceS: number,
): SearchStatus {
  if (r.fin != null) {
    const finTimes = catRunners.filter((x) => x.fin != null).map((x) => x.fin as number);
    return { kind: "finished", time: r.fin, rank: virtualRank(finTimes, r.fin) };
  }
  const k = lastPoint(r);
  if (k) return { kind: "on-course", point: k, time: r[k] as number };
  if (r.started) return { kind: "running", live: now - r.start };
  if (isDns(r, now, graceS)) return { kind: "dns" };
  return { kind: "waiting", start: r.start };
}

/* ---------- kategorie: URL a krátký název ---------- */

/** `muži nad 40 let` → `muzi-nad-40-let`. */
export function slugify(value: string): string {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug pro každou kategorii; prázdný nebo duplicitní slug dostane id kategorie. */
export function categorySlugs(categories: readonly { id: string; name: string }[]): string[] {
  const seen = new Set<string>();
  return categories.map((c) => {
    let slug = slugify(c.name) || slugify(c.id) || "k";
    if (seen.has(slug)) slug = `${slug}-${slugify(c.id) || seen.size}`;
    seen.add(slug);
    return slug;
  });
}

/** Krátký název na chip: „muži nad 40 let“ → „M 40“, „dorostenci“ → „Dorci“, jinak název. */
export function categoryShort(name: string): string {
  const trimmed = name.trim();
  const over = /^(muži|ženy)\s+nad\s+(\d+)/i.exec(trimmed);
  if (over) return `${over[1].toLowerCase() === "muži" ? "M" : "Ž"} ${over[2]}`;
  const n = trimmed.toLowerCase();
  if (n === "dorostenci") return "Dorci";
  if (n === "dorostenky") return "Dorky";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Kategorie podle slugu z URL (bez rozlišení velikosti písmen), jinak null. */
export function findCategoryBySlug<T extends { slug: string }>(
  categories: readonly T[],
  slug: string | null | undefined,
): T | null {
  if (!slug) return null;
  const s = slug.toLowerCase();
  return categories.find((c) => c.slug === s) ?? null;
}
