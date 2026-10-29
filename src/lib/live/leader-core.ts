/**
 * Upozornění „nový lídr“ (speaker #188 i resultboard) – čistá logika bez DB a prohlížeče.
 *
 * Server nic nového nepočítá: prohlížeč si u každého nového snímku spočítá lídra každé
 * kategorie na M1, M2 a v cíli a porovná ho s lídrem z předchozího snímku. Změna čísla lídra
 * (i první běžec na bodu) = událost. První snímek po načtení stránky, po výpadku spojení
 * nebo hromadná změna (import, úklid testu) jen nastaví výchozí stav – nic nebliká.
 */

import { byCategory, type PointKey, type SpeakerRunner } from "./speaker-core";

/** Pořadí důležitosti bodů: cíl > M2 > M1. */
const PRIORITY: Record<PointKey, number> = { m1: 1, m2: 2, fin: 3 };

/** Cíl: 4 silné pulzy po 1,2 s. */
export const LEADER_PULSE_FIN_MS = 4800;
/** Mezičas: 3 slabší pulzy po 1,2 s. */
export const LEADER_PULSE_SPLIT_MS = 3600;
/** Jak dlouho od události drží zlatý rámeček, štítek a banner. */
export const LEADER_HOLD_MS = 12_000;
/** Průchod starší než tohle v okamžiku zjištění = dodatečný (ruční zápis, oprava, import). */
export const LEADER_LATE_S = 60;
/** Mezera mezi snímky delší než tohle (výpadek, uspaná záložka) → jen nový výchozí stav. */
export const LEADER_GAP_MS = 60_000;
/** Víc událostí v jednom snímku = hromadná změna (import výsledků, úklid testu) → nic nebliká. */
export const LEADER_BULK_LIMIT = 6;
/** Nejvýš řádků banneru v jednom boxu. */
export const LEADER_MAX_LINES = 2;

export type Leader = {
  bib: number;
  name: string;
  /** Čas na bodu (s od startu). */
  time: number;
  /** Okamžik průchodu (epoch s). */
  at: number;
};

/** Klíč `kategorie|bod`. */
export type LeaderKey = `${string}|${PointKey}`;
export type LeaderMap = Map<LeaderKey, Leader>;

export const leaderKey = (cat: string, point: PointKey): LeaderKey => `${cat}|${point}`;

/**
 * Lídr každé kategorie na každém sledovaném bodu: nejlepší čas; při shodě zůstává ten, kdo
 * bodem proběhl dřív (shodný čas lídra nemění), pak nižší číslo.
 */
export function leadersOf(
  runners: readonly SpeakerRunner[],
  points: readonly PointKey[] = ["m1", "m2", "fin"],
): LeaderMap {
  const map: LeaderMap = new Map();
  for (const r of runners) {
    for (const k of points) {
      const time = r[k];
      if (time == null) continue;
      const key = leaderKey(r.cat, k);
      const at = r.start + time;
      const cur = map.get(key);
      if (
        !cur ||
        time < cur.time ||
        (time === cur.time && (at < cur.at || (at === cur.at && r.bib < cur.bib)))
      ) {
        map.set(key, { bib: r.bib, name: r.name, time, at });
      }
    }
  }
  return map;
}

export type LeaderEvent = {
  cat: string;
  point: PointKey;
  leader: Leader;
  /** Předchozí lídr (null = první běžec na bodu). */
  previous: Leader | null;
  /** Průchod je starší než `LEADER_LATE_S` – dodatečně zapsaný nebo opravený čas. */
  late: boolean;
};

/**
 * Události mezi dvěma snímky. `prev === null` (první snímek) → žádné. Zmizení lídra
 * (smazaný čas, úklid testu) událost nedělá; když po opravě nastoupí jiný, je to událost.
 */
export function diffLeaders(prev: LeaderMap | null, next: LeaderMap, nowS: number): LeaderEvent[] {
  if (!prev) return [];
  const events: LeaderEvent[] = [];
  for (const [key, leader] of next) {
    const before = prev.get(key) ?? null;
    if (before && before.bib === leader.bib) continue;
    const [cat, point] = splitKey(key);
    events.push({
      cat,
      point,
      leader,
      previous: before,
      late: nowS - leader.at > LEADER_LATE_S,
    });
  }
  return events;
}

function splitKey(key: LeaderKey): [string, PointKey] {
  const i = key.lastIndexOf("|");
  return [key.slice(0, i), key.slice(i + 1) as PointKey];
}

/** Hromadná změna – místo blikání jen nový výchozí stav. */
export function isBulkChange(events: readonly LeaderEvent[]): boolean {
  return events.length > LEADER_BULK_LIMIT;
}

export type LeaderAlert = {
  /** Bod, podle kterého se box rozbliká (nejdůležitější aktivní). */
  point: PointKey;
  /** Číslo lídra zvýrazněné v tabulce. */
  bib: number;
  /** Řádky banneru (nejdůležitější první), nejvýš `LEADER_MAX_LINES`. */
  lines: LeaderEvent[];
  /** Pořadí spuštění – změna = animace začne znovu (nesčítá se). */
  seq: number;
  /** Do kdy pulzuje (ms). */
  pulseUntil: number;
  /** Do kdy drží rámeček a banner (ms). */
  until: number;
};

export type LeaderAlerts = ReadonlyMap<string, LeaderAlert>;

/**
 * Přidá události k aktivním upozorněním. V jednom boxu se nesčítají: nová událost animaci
 * spustí znovu; nižší bod (M1) ale nepřeruší ještě pulzující vyšší (cíl) – jen přidá řádek banneru.
 */
export function applyLeaderEvents(
  alerts: LeaderAlerts,
  events: readonly LeaderEvent[],
  nowMs: number,
  seqStart: number,
): { alerts: Map<string, LeaderAlert>; seq: number } {
  const out = new Map(expireAlerts(alerts, nowMs));
  let seq = seqStart;
  // důležitější body první, aby v jednom snímku vyhrál cíl
  const sorted = [...events].sort((a, b) => PRIORITY[b.point] - PRIORITY[a.point]);
  for (const ev of sorted) {
    const cur = out.get(ev.cat);
    if (cur && nowMs < cur.pulseUntil && PRIORITY[cur.point] > PRIORITY[ev.point]) {
      out.set(ev.cat, {
        ...cur,
        lines: [cur.lines[0], ev].slice(0, LEADER_MAX_LINES),
        until: Math.max(cur.until, nowMs + LEADER_HOLD_MS),
      });
      continue;
    }
    const others = (cur?.lines ?? []).filter((l) => l.point !== ev.point).slice(0, 1);
    seq += 1;
    out.set(ev.cat, {
      point: ev.point,
      bib: ev.leader.bib,
      lines: [ev, ...others].slice(0, LEADER_MAX_LINES),
      seq,
      pulseUntil: nowMs + (ev.point === "fin" ? LEADER_PULSE_FIN_MS : LEADER_PULSE_SPLIT_MS),
      until: nowMs + LEADER_HOLD_MS,
    });
  }
  return { alerts: out, seq };
}

/** Bez vypršelých upozornění. */
export function expireAlerts(alerts: LeaderAlerts, nowMs: number): Map<string, LeaderAlert> {
  const out = new Map<string, LeaderAlert>();
  for (const [cat, a] of alerts) if (a.until > nowMs) out.set(cat, a);
  return out;
}

export type LeaderTracker = {
  leaders: LeaderMap | null;
  /** Kdy přišel poslední snímek (ms). */
  seenMs: number;
  alerts: Map<string, LeaderAlert>;
  seq: number;
};

export const emptyTracker = (): LeaderTracker => ({
  leaders: null,
  seenMs: 0,
  alerts: new Map(),
  seq: 0,
});

/**
 * Jeden krok sledování: nový snímek → noví lídři, události a upozornění. První snímek,
 * snímek po dlouhé mezeře a hromadná změna jen nastaví výchozí stav.
 */
export function trackLeaders(
  tracker: LeaderTracker,
  runners: readonly SpeakerRunner[],
  nowMs: number,
  points: readonly PointKey[],
): { tracker: LeaderTracker; events: LeaderEvent[] } {
  const next = leadersOf(runners, points);
  const gap = tracker.leaders !== null && nowMs - tracker.seenMs > LEADER_GAP_MS;
  let events = gap ? [] : diffLeaders(tracker.leaders, next, Math.floor(nowMs / 1000));
  if (isBulkChange(events)) events = [];
  const { alerts, seq } = applyLeaderEvents(tracker.alerts, events, nowMs, tracker.seq);
  return { tracker: { leaders: next, seenMs: nowMs, alerts, seq }, events };
}

/**
 * Průchod udělal lídra: v okamžiku průchodu byl jeho čas na bodu nejlepší z těch, kdo
 * bodem proběhli před ním (★ v posledních průchodech speakera). Shodný čas lídra nedělá.
 */
export function madeLeader(
  passage: { runner: SpeakerRunner; point: PointKey; at: number; time: number },
  catRunners: readonly SpeakerRunner[],
): boolean {
  for (const r of catRunners) {
    if (r.bib === passage.runner.bib) continue;
    const v = r[passage.point];
    if (v == null) continue;
    const at = r.start + v;
    if (at <= passage.at && v <= passage.time) return false;
  }
  return true;
}

/** ★ pro každý průchod v seznamu (klíč `číslo|bod`). */
export function leaderPassages(
  passages: readonly { runner: SpeakerRunner; point: PointKey; at: number; time: number }[],
  runners: readonly SpeakerRunner[],
): Set<string> {
  const byCat = byCategory(runners);
  const out = new Set<string>();
  for (const p of passages) {
    if (madeLeader(p, byCat.get(p.runner.cat) ?? [])) out.add(`${p.runner.bib}|${p.point}`);
  }
  return out;
}
