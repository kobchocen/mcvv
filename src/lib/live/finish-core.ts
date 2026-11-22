/**
 * Cíl (#252): stopky (fronta časů) a stanice čísel – čistá logika bez DB a frameworku.
 *
 * - Stopky: obsluha klikne při každém průběhu cílovou čárou → okamžik (ms) po korekci hodin.
 * - Čísla: druhá obsluha opisuje čísla v pořadí doběhu.
 * - Párování: n-tý platný klik ↔ n-té platné číslo (podle pořadí). Opravy (prohození,
 *   chybějící / přebytečný klik či číslo) mění jen pořadí nebo příznak smazání, nic se nemaže.
 * - Čistý čas = okamžik v cíli − plánovaný start ze startovky (pozdní start se neopravuje),
 *   celé sekundy zaokrouhlené dolů jako u mezičasů.
 */
import { z } from "zod";

import { parsePragueLocal } from "./admin-core";

/** Kód splitu cíle v `mcvv_split` (legacy). */
export const FINISH_SPLIT_CODE = "9";
/** Autor řádku `mcvv_split` zapsaného z párování cíle (VARCHAR(8)). */
export const FINISH_AUTHOR = "cil";
/** Zdroj zápisu v deníku `mcvv_split_entry`. */
export const FINISH_SOURCE = "cil";
/** Nejvyšší startovní číslo. */
export const FINISH_BIB_MAX = 999;
/** Rozumná délka závodu: kratší čas = podezřelé (posun párování), delší = mimo závod. */
export const FINISH_MIN_SECONDS = 9 * 60;
export const FINISH_MAX_SECONDS = 4 * 3600;

export type FinishPunchRow = {
  id: number;
  entryKey: string;
  punchedAt: number;
  deleted: boolean;
  source: string;
};

export type FinishBibRow = {
  id: number;
  entryKey: string;
  bib: number;
  readAt: number;
  sortKey: number;
  deleted: boolean;
  source: string;
};

export type FinishIssue =
  | "missing-bib" // klik bez čísla (číslo chybí, nebo se ještě opisuje)
  | "missing-punch" // číslo bez kliku
  | "unknown-bib" // číslo není ve startovce
  | "duplicate-bib" // číslo je ve frontě víckrát (platí první výskyt)
  | "too-fast" // čas kratší než rozumné minimum → nejspíš posun párování
  | "too-long" // čas delší než maximum / před startem
  | "manual-kept"; // ručně zapsaný čas admina má přednost, párování ho nepřepíše

export type FinishPair = {
  /** Pořadí doběhu (1, 2, …). */
  position: number;
  punch: FinishPunchRow | null;
  bib: FinishBibRow | null;
  /** Čistý čas v sekundách (jen když jsou obojí a číslo je ve startovce). */
  time: number | null;
  issues: FinishIssue[];
};

export type StartLookup = (bib: number) => number | null;

const byPunch = (a: FinishPunchRow, b: FinishPunchRow) => a.punchedAt - b.punchedAt || a.id - b.id;
const byBibOrder = (a: FinishBibRow, b: FinishBibRow) => a.sortKey - b.sortKey || a.id - b.id;

/** Čistý čas: okamžik v cíli − plánovaný start, celé sekundy dolů. */
export function netTime(punchedAt: number, plannedStart: number): number {
  return Math.floor((punchedAt - plannedStart) / 1000);
}

/**
 * Spáruje platné kliky s platnými čísly podle pořadí. `startOf` vrací plánovaný start čísla
 * (ms) nebo null, když číslo ve startovce není.
 */
export function pairFinish(
  punches: readonly FinishPunchRow[],
  bibs: readonly FinishBibRow[],
  startOf: StartLookup,
): FinishPair[] {
  const p = punches.filter((row) => !row.deleted).sort(byPunch);
  const b = bibs.filter((row) => !row.deleted).sort(byBibOrder);
  const seen = new Set<number>();
  const pairs: FinishPair[] = [];
  const length = Math.max(p.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const punch = p[index] ?? null;
    const bib = b[index] ?? null;
    const issues: FinishIssue[] = [];
    let time: number | null = null;
    if (!bib) issues.push("missing-bib");
    if (!punch) issues.push("missing-punch");
    if (bib) {
      if (seen.has(bib.bib)) issues.push("duplicate-bib");
      seen.add(bib.bib);
      const start = startOf(bib.bib);
      if (start === null) issues.push("unknown-bib");
      else if (punch) {
        const value = netTime(punch.punchedAt, start);
        if (value < 0 || value > FINISH_MAX_SECONDS) issues.push("too-long");
        else {
          if (value < FINISH_MIN_SECONDS) issues.push("too-fast");
          time = value;
        }
      }
    }
    pairs.push({ position: index + 1, punch, bib, time, issues });
  }
  return pairs;
}

/** Páry, které se smí zapsat do výsledků: kompletní, známé číslo, první výskyt čísla. */
export function writablePairs(pairs: readonly FinishPair[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const pair of pairs) {
    if (!pair.bib || pair.time === null) continue;
    if (pair.issues.includes("duplicate-bib") || pair.issues.includes("unknown-bib")) continue;
    if (!out.has(pair.bib.bib)) out.set(pair.bib.bib, pair.time);
  }
  return out;
}

export type ExistingFinish = { bib: number; time: number; author: string | null };

export type FinishSyncPlan = {
  insert: { bib: number; time: number }[];
  update: { bib: number; time: number; previous: number }[];
  /** Řádky zapsané párováním, které už v párování nejsou (číslo smazáno / přečíslováno). */
  remove: { bib: number; previous: number }[];
  /** Čísla s ručním (nebo jiným než párovacím) cílovým časem – párování je nechá být. */
  kept: number[];
};

/**
 * Rozdíl mezi požadovaným stavem z párování a cílovými řádky v `mcvv_split`. Párování vlastní
 * jen řádky s autorem `cil`; ruční zápis admina (záloha) i starší data mají přednost.
 */
export function planFinishSync(
  desired: ReadonlyMap<number, number>,
  existing: readonly ExistingFinish[],
): FinishSyncPlan {
  const plan: FinishSyncPlan = { insert: [], update: [], remove: [], kept: [] };
  const current = new Map(existing.map((row) => [row.bib, row]));
  for (const [bib, time] of desired) {
    const row = current.get(bib);
    if (!row) plan.insert.push({ bib, time });
    else if (row.author !== FINISH_AUTHOR) plan.kept.push(bib);
    else if (row.time !== time) plan.update.push({ bib, time, previous: row.time });
  }
  for (const row of existing) {
    if (row.author === FINISH_AUTHOR && !desired.has(row.bib)) {
      plan.remove.push({ bib: row.bib, previous: row.time });
    }
  }
  plan.insert.sort((a, b) => a.bib - b.bib);
  plan.update.sort((a, b) => a.bib - b.bib);
  plan.remove.sort((a, b) => a.bib - b.bib);
  plan.kept.sort((a, b) => a - b);
  return plan;
}

/** Označí páry, jejichž čas párování nepřepíše (ruční cílový čas). */
export function markKept(pairs: FinishPair[], kept: readonly number[]): FinishPair[] {
  const set = new Set(kept);
  return pairs.map((pair) =>
    pair.bib && set.has(pair.bib.bib) && !pair.issues.includes("manual-kept")
      ? { ...pair, issues: [...pair.issues, "manual-kept"] }
      : pair,
  );
}

/** Pořadí pro číslo vložené mezi dva sousedy (nebo na začátek / konec). */
export function sortKeyBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return Date.now();
  if (before === null) return (after as number) - 1000;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}

/** Souhrn pro přehled: počty a problémy. */
export function summarizePairs(pairs: readonly FinishPair[]) {
  let complete = 0;
  let problems = 0;
  for (const pair of pairs) {
    if (pair.time !== null && pair.issues.every((i) => i === "too-fast" || i === "manual-kept"))
      complete += 1;
    if (pair.issues.some((i) => i !== "manual-kept")) problems += 1;
  }
  return {
    punches: pairs.filter((pair) => pair.punch).length,
    bibs: pairs.filter((pair) => pair.bib).length,
    complete,
    problems,
  };
}

// ---------------------------------------------------------------------------
// Dávka ze stanic (offline fronta): idempotentní podle `id` (UUID).

const uuid = z.string().min(8).max(80);
const epochMs = z.number().int().min(1_500_000_000_000).max(4_000_000_000_000);

export const finishOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("punch"), id: uuid, at: epochMs }),
  z.object({
    kind: z.literal("bib"),
    id: uuid,
    at: epochMs,
    bib: z.number().int().min(1).max(FINISH_BIB_MAX),
  }),
  /** Smazání vlastního zápisu stanice (přebytečný klik / omylem opsané číslo). */
  z.object({ kind: z.literal("delete"), id: uuid, target: uuid }),
]);
export type FinishOp = z.infer<typeof finishOpSchema>;

export const finishBatchSchema = z.object({ ops: z.array(finishOpSchema).min(1).max(200) });

export type FinishOpOutcome = "applied" | "duplicate" | "missing" | "rejected";
export type FinishOpResult = { id: string; outcome: FinishOpOutcome; note?: string };

/** Okamžik z dávky: ne z daleké budoucnosti ani starší než den (zastaralá fronta). */
export function checkStamp(at: number, now: number): "ok" | "future" | "stale" {
  if (at > now + 2 * 60_000) return "future";
  if (at < now - 24 * 3600_000) return "stale";
  return "ok";
}

/**
 * Ručně doplněný klik: denní čas `hh:mm:ss[.d…]` (Europe/Prague) v den `day` (`YYYY-MM-DD`,
 * den nuly závodu) → okamžik v ms. Nesmysl → null.
 */
export function parseFinishClock(raw: string | null | undefined, day: string): number | null {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec((raw ?? "").trim());
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const base = parsePragueLocal(`${day}T${match[1].padStart(2, "0")}:${match[2]}:${match[3]}`);
  if (!base) return null;
  const fraction = match[4] ? Number(match[4].padEnd(3, "0")) : 0;
  return base.getTime() + fraction;
}
