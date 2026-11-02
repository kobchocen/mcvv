/**
 * Resultboard – velké obrazovky v cíli (náhrada OFB). Čistá logika bez DB a prohlížeče:
 * nastavení (uložené jako JSON v `mcvv_setting`), rozdělení kategorií na TV a do sloupců
 * a skupiny log partnerů. Data výsledků jsou stejný snímek jako `/vysledky/online`.
 */

import type { OnlineCategoryState, OnlineRunner } from "./online-results-core";
import type { PointKey, ShownRow } from "./speaker-core";

export const RESULTBOARD_CONFIG_KEY = "resultboard_config";
export const RESULTBOARD_MAX_MONITORS = 4;
export const RESULTBOARD_COLUMNS = [3, 4, 5, 6] as const;
/** „Auto“ = 5 sloupců (16:9, 1080p i 4K – rozměry se škálují s šířkou obrazovky). */
export const RESULTBOARD_AUTO_COLUMNS = 5;
/** Kolik log se v pruhu partnerů střídá naráz. */
export const PARTNER_GROUP_SIZE = 5;
/** Jak často si obrazovky znovu načtou nastavení (a sdílená cache na replice). */
export const RESULTBOARD_CONFIG_POLL_MS = 30_000;

export type ResultboardMonitor = {
  name: string;
  /** Počet sloupců; null = auto. */
  columns: number | null;
};

export type ResultboardConfig = {
  monitors: ResultboardMonitor[];
  /** Pořadí kategorií na obrazovkách (id); chybějící kategorie se doplní na konec v pořadí webu. */
  order: string[];
  /** Kategorie → číslo TV (1…); 0 = skrýt. Chybějící kategorie → výchozí rozdělení. */
  assign: Record<string, number>;
  /** Pevně nahoře (nescrolluje) – počet řádků výsledků. */
  fixedTop: number;
  /** Rychlost posunu v řádcích za sekundu. */
  scrollRowsPerS: number;
  /** Pauza nahoře a dole (s). */
  scrollPauseS: number;
  showRunning: boolean;
  showWaiting: boolean;
  showDns: boolean;
  leader: { speaker: boolean; resultboard: boolean; points: PointKey[] };
  /** Pevné logo = generální partner z administrace partnerů (Q153), tady se nenastavuje. */
  partners: { show: boolean; rotateS: number; qr: boolean };
};

export const DEFAULT_MONITOR_NAMES = ["Cíl – vlevo", "Cíl – vpravo", "TV 3", "TV 4"];

export const DEFAULT_RESULTBOARD_CONFIG: ResultboardConfig = {
  monitors: [
    { name: DEFAULT_MONITOR_NAMES[0], columns: null },
    { name: DEFAULT_MONITOR_NAMES[1], columns: null },
  ],
  order: [],
  assign: {},
  fixedTop: 5,
  scrollRowsPerS: 0.8,
  scrollPauseS: 6,
  showRunning: true,
  showWaiting: true,
  showDns: true,
  leader: { speaker: true, resultboard: true, points: ["m1", "m2", "fin"] },
  partners: { show: true, rotateS: 8, qr: true },
};

const num = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Uložené nastavení (JSON) → platné nastavení; cokoli chybného nahradí výchozí hodnota. */
export function parseResultboardConfig(raw: unknown): ResultboardConfig {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  const d = DEFAULT_RESULTBOARD_CONFIG;
  if (!isRecord(value)) return structuredClone(d);
  const monitors = Array.isArray(value.monitors)
    ? value.monitors.slice(0, RESULTBOARD_MAX_MONITORS).map((m, i): ResultboardMonitor => {
        const rec = isRecord(m) ? m : {};
        const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 40) : "";
        const cols = Number(rec.columns);
        return {
          name: name || DEFAULT_MONITOR_NAMES[i],
          columns: (RESULTBOARD_COLUMNS as readonly number[]).includes(cols) ? cols : null,
        };
      })
    : [];
  const order = Array.isArray(value.order)
    ? [...new Set(value.order.filter((x): x is string => typeof x === "string"))]
    : [];
  const assign: Record<string, number> = {};
  if (isRecord(value.assign)) {
    for (const [cat, tv] of Object.entries(value.assign)) {
      const n = Number(tv);
      if (Number.isInteger(n) && n >= 0 && n <= RESULTBOARD_MAX_MONITORS) assign[cat] = n;
    }
  }
  const leader = isRecord(value.leader) ? value.leader : {};
  const points = Array.isArray(leader.points)
    ? (["m1", "m2", "fin"] as const).filter((k) => (leader.points as unknown[]).includes(k))
    : d.leader.points;
  const partners = isRecord(value.partners) ? value.partners : {};
  return {
    monitors: monitors.length ? monitors : structuredClone(d.monitors),
    order,
    assign,
    fixedTop: Math.round(num(value.fixedTop, 1, 10, d.fixedTop)),
    scrollRowsPerS: num(value.scrollRowsPerS, 0.2, 3, d.scrollRowsPerS),
    scrollPauseS: num(value.scrollPauseS, 0, 30, d.scrollPauseS),
    showRunning: bool(value.showRunning, d.showRunning),
    showWaiting: bool(value.showWaiting, d.showWaiting),
    showDns: bool(value.showDns, d.showDns),
    leader: {
      speaker: bool(leader.speaker, d.leader.speaker),
      resultboard: bool(leader.resultboard, d.leader.resultboard),
      points: [...points],
    },
    partners: {
      show: bool(partners.show, d.partners.show),
      rotateS: Math.round(num(partners.rotateS, 3, 60, d.partners.rotateS)),
      qr: bool(partners.qr, d.partners.qr),
    },
  };
}

export type BoardCategory = { id: string; name: string };

/** Veteránská kategorie („muži nad 40 let“, „ženy nad 50 let“) – výchozí TV 2 (Q140). */
export function isVeteranCategory(name: string): boolean {
  return /\bnad\s+\d+/i.test(name);
}

/** Výchozí TV kategorie: mládež + muži/ženy na TV 1, veteráni na TV 2 (při 1 TV vše na 1). */
export function defaultMonitorFor(category: BoardCategory, monitors: number): number {
  if (monitors < 2) return 1;
  return isVeteranCategory(category.name) ? 2 : 1;
}

/** Pořadí kategorií na obrazovkách: uložené pořadí, zbytek v pořadí webu. */
export function orderedCategories<T extends BoardCategory>(
  categories: readonly T[],
  order: readonly string[],
): T[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: T[] = [];
  for (const id of order) {
    const c = byId.get(id);
    if (c) {
      out.push(c);
      byId.delete(id);
    }
  }
  return [...out, ...categories.filter((c) => byId.has(c.id))];
}

/** TV kategorie podle nastavení (0 = skrytá, TV nad počtem monitorů = skrytá). */
export function monitorOf(config: ResultboardConfig, category: BoardCategory): number {
  const n = config.monitors.length;
  const tv = config.assign[category.id] ?? defaultMonitorFor(category, n);
  return tv >= 1 && tv <= n ? tv : 0;
}

/** Kategorie jedné TV v pořadí obrazovky. */
export function monitorCategories<T extends BoardCategory>(
  config: ResultboardConfig,
  categories: readonly T[],
  tv: number,
): T[] {
  return orderedCategories(categories, config.order).filter((c) => monitorOf(config, c) === tv);
}

/** Výška kategorie v řádcích: běžci + nadpis, hlavička tabulky a oddělovač sekce. */
export const categoryCost = (entries: number) => entries + 3;

/**
 * Rozdělí položky (v daném pořadí) do nejvýš `columns` souvislých skupin tak, aby nejvyšší
 * skupina byla co nejnižší a při shodě byly skupiny co nejvyrovnanější (lineární rozklad, DP).
 * Vrací rozsahy `[od, do)`; prázdný vstup → žádná skupina.
 */
export function partitionColumns(costs: readonly number[], columns: number): [number, number][] {
  const n = costs.length;
  if (n === 0) return [];
  const C = Math.max(1, Math.min(Math.floor(columns), n));
  const pre = [0];
  for (const c of costs) pre.push(pre[pre.length - 1] + c);
  type Cost = [number, number];
  const better = (a: Cost, b: Cost) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const dp: (Cost | null)[][] = Array.from({ length: C + 1 }, () => Array(n + 1).fill(null));
  const cut: number[][] = Array.from({ length: C + 1 }, () => Array(n + 1).fill(0));
  dp[0][0] = [0, 0];
  for (let k = 1; k <= C; k += 1) {
    for (let i = k; i <= n; i += 1) {
      for (let j = k - 1; j < i; j += 1) {
        const base = dp[k - 1][j];
        if (!base) continue;
        const s = pre[i] - pre[j];
        const v: Cost = [Math.max(base[0], s), base[1] + s * s];
        const cur = dp[k][i];
        if (!cur || better(v, cur)) {
          dp[k][i] = v;
          cut[k][i] = j;
        }
      }
    }
  }
  const groups: [number, number][] = [];
  let i = n;
  for (let k = C; k >= 1; k -= 1) {
    const j = cut[k][i];
    groups.unshift([j, i]);
    i = j;
  }
  return groups;
}

/** Sloupce jedné TV: kategorie rozdělené podle počtu běžců. */
export function layoutColumns<T extends BoardCategory>(
  categories: readonly T[],
  entries: (category: T) => number,
  columns: number,
): T[][] {
  return partitionColumns(
    categories.map((c) => categoryCost(entries(c))),
    columns,
  ).map(([a, b]) => categories.slice(a, b));
}

/**
 * „Rozdělit automaticky“: kategorie v pořadí obrazovky rozdělí na `monitors` TV
 * s co nejvyrovnanějším počtem běžců (pořadí zůstává). Skryté kategorie zůstanou skryté.
 */
export function autoAssign<T extends BoardCategory>(
  categories: readonly T[],
  entries: (category: T) => number,
  monitors: number,
  hidden: ReadonlySet<string> = new Set(),
): Record<string, number> {
  const visible = categories.filter((c) => !hidden.has(c.id));
  const assign: Record<string, number> = {};
  for (const c of categories) if (hidden.has(c.id)) assign[c.id] = 0;
  partitionColumns(
    visible.map((c) => entries(c)),
    Math.max(1, monitors),
  ).forEach(([a, b], i) => {
    for (const c of visible.slice(a, b)) assign[c.id] = i + 1;
  });
  return assign;
}

export type BoardItem =
  | { kind: "res"; row: ShownRow & { runner: OnlineRunner } }
  | { kind: "div"; variant: "run" | "wait" | "dns"; n: number }
  | { kind: "wait"; runner: OnlineRunner }
  | { kind: "dns"; runner: OnlineRunner };

/**
 * Řádky kategorie na resultboardu (Q155): výsledky přesně v pořadí speakeru
 * (`onlineCategoryState` → `categoryState` → `combinedOrder`, cíl i jen mezičasy v jednom
 * seznamu), pak volitelně odstartovaní bez mezičasu, čekající na start a DNS.
 */
export function boardItems(
  state: OnlineCategoryState,
  config: Pick<ResultboardConfig, "showRunning" | "showWaiting" | "showDns">,
): BoardItem[] {
  const items: BoardItem[] = state.rows.map((row) => ({ kind: "res", row }));
  if (config.showRunning && state.running.length) {
    items.push({ kind: "div", variant: "run", n: state.running.length });
    for (const r of state.running) {
      items.push({ kind: "res", row: { runner: r, rank: null, final: false, recent: false } });
    }
  }
  if (config.showWaiting && state.waiting.length) {
    items.push({ kind: "div", variant: "wait", n: state.waiting.length });
    for (const r of state.waiting) items.push({ kind: "wait", runner: r });
  }
  if (config.showDns && state.dns.length) {
    items.push({ kind: "div", variant: "dns", n: state.dns.length });
    for (const r of state.dns) items.push({ kind: "dns", runner: r });
  }
  return items;
}

export type BoardPartner = {
  id: number;
  name: string;
  category: number;
  logoSrc: string | null;
  /** Web partnera (normalizovaný na http/https), jinak null – logo pak není odkaz. */
  href: string | null;
  /** Generální partner (Q153) – pevné logo vlevo. */
  general: boolean;
};

/**
 * Rozdělí položky do skupin po `size`. Poslední kratší skupinu doplní od začátku seznamu
 * (Q214), aby byl pruh vždy plný; když se vše vejde do jedné skupiny, nic se neopakuje.
 */
export function fillGroups<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  if (!items.length) return [];
  if (items.length <= n) return [items.slice()];
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += n) groups.push(items.slice(i, i + n));
  const last = groups[groups.length - 1];
  for (let k = 0; last.length < n; k++) last.push(items[k]);
  return groups;
}

/**
 * Pruh partnerů (Q141, Q153): generální partner (příznak v administraci partnerů) stále,
 * ostatní (všechny kategorie, v pořadí webu) se střídají ve skupinách po 5; poslední skupina
 * se doplní od začátku (Q214). Bez generálního partnera pevné logo není a střídají se všechna.
 */
export function partnerGroups(partners: readonly BoardPartner[]): {
  fixed: BoardPartner | null;
  groups: BoardPartner[][];
} {
  const fixed = partners.find((p) => p.general) ?? null;
  const rest = partners.filter((p) => p !== fixed);
  return { fixed, groups: fillGroups(rest, PARTNER_GROUP_SIZE) };
}

/** Číslo TV z URL (`/resultboard/2`) → 1…4, jinak null. */
export function parseMonitorParam(value: string | undefined): number | null {
  if (!value || !/^[1-9]$/.test(value)) return null;
  const n = Number(value);
  return n <= RESULTBOARD_MAX_MONITORS ? n : null;
}

/** Posun ping-pong: nový stav po `dt` s (pozice v px, směr, zbývající pauza). */
export type ScrollState = { pos: number; dir: 1 | -1; hold: number };

export function stepScroll(
  st: ScrollState,
  dt: number,
  max: number,
  pxPerS: number,
  pauseS: number,
): ScrollState {
  if (max <= 0) return { pos: 0, dir: 1, hold: pauseS };
  if (st.hold > 0) return { ...st, pos: Math.min(st.pos, max), hold: st.hold - dt };
  const pos = st.pos + st.dir * pxPerS * dt;
  if (pos >= max) return { pos: max, dir: -1, hold: pauseS };
  if (pos <= 0) return { pos: 0, dir: 1, hold: pauseS };
  return { pos, dir: st.dir, hold: 0 };
}

/** Automatické obnovení kiosku: nová verze aplikace, nebo jednou za čas, ale jen se spojením. */
export const RESULTBOARD_RELOAD_MS = 6 * 60 * 60 * 1000;

export function shouldReload(input: {
  pageBuild: string;
  serverBuild: string | null;
  loadedMs: number;
  nowMs: number;
  stale: boolean;
}): boolean {
  if (input.stale) return false; // bez spojení by se místo dat ukázala chybová stránka
  if (input.serverBuild && input.serverBuild !== input.pageBuild) return true;
  return input.nowMs - input.loadedMs > RESULTBOARD_RELOAD_MS;
}
