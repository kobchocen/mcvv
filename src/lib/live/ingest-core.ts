import { z } from "zod";

import { FINISH_SPLIT, isSplitCode } from "./stations";

/**
 * Čistá logika příjmu mezičasů (bez DB): validace dávek, výpočet času a rozhodnutí,
 * co se stane s řádkem `mcvv_split` (klíč `(cislo, rok, split)` jako legacy PK).
 */

export const MAX_BATCH = 200;
export const MAX_BIB = 999;
/** `mcvv_split.time` je smallint; reálně nikdo neběží déle než 6 h. */
export const MAX_RACE_SECONDS = 6 * 3600;
/** Tolerance hodin zařízení dopředu proti serveru. */
export const FUTURE_SKEW_MS = 2 * 60_000;
/** Zápis starší než tohle (offline fronta) už nepřijímáme. */
export const MAX_AGE_MS = 24 * 3600_000;

const entryId = z
  .string()
  .regex(/^[A-Za-z0-9-]{8,64}$/, "invalid id")
  .describe("UUID zápisu ze zařízení");

const bib = z.number().int().min(1).max(MAX_BIB);
const split = z.string().refine(isSplitCode, "invalid split");

export const webEntrySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    id: entryId,
    split,
    bib,
    punchedAt: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("correct"),
    id: entryId,
    replaces: entryId,
    split,
    bib,
    punchedAt: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("delete"),
    id: entryId,
    replaces: entryId,
    split,
  }),
]);

export const webBatchSchema = z.object({
  entries: z.array(webEntrySchema).min(1).max(MAX_BATCH),
});

export type WebEntry = z.infer<typeof webEntrySchema>;

/** Položka z klienta OBD: `cislo;time_s` ze `splits.csv` (+ volitelný kód splitu). */
export const deviceItemSchema = z.object({
  bib,
  split: split.default(FINISH_SPLIT),
  timeS: z.number().int().min(0).max(MAX_RACE_SECONDS),
  /** Volitelné: čas, kdy klient řádek uviděl (jen pro audit). */
  seenAt: z.string().max(40).optional(),
});

export const deviceBatchSchema = z.object({
  items: z.array(deviceItemSchema).min(1).max(MAX_BATCH),
  /** Volitelné: verze klienta pro audit. */
  client: z.string().max(40).optional(),
});

export type DeviceItem = z.infer<typeof deviceItemSchema>;

export type Outcome =
  | "applied"
  | "duplicate"
  | "unchanged"
  | "conflict"
  | "resolved"
  | "rejected"
  | "replaced"
  | "deleted";

/** Stavy, ve kterých zápis „vlastní“ řádek v mcvv_split. */
export const OWNING_OUTCOMES: Outcome[] = ["applied", "resolved"];

export type WriteDecision = "insert" | "duplicate" | "unchanged" | "conflict";

/**
 * - nic tam není → zapsat;
 * - web (splitmaker): první zápis vyhrává, další je duplicita (dvojí zadání téhož běžce);
 * - OBD: stejná hodnota = beze změny, jiná = konflikt, nepřepisuje se automaticky (#120).
 */
export function decideWrite(
  existing: { time: number } | null,
  incomingTime: number,
  source: "web" | "obd",
): WriteDecision {
  if (!existing) return "insert";
  if (source === "web") return "duplicate";
  return existing.time === incomingTime ? "unchanged" : "conflict";
}

export type TimeCheck = { ok: true; time: number } | { ok: false; reason: string };

/** Čas od startu z okamžiku průběhu; odmítne nesmysly (před startem, zastaralé, z budoucnosti). */
export function checkPunch(punchedAt: number, startAt: Date, now: Date): TimeCheck {
  if (punchedAt > now.getTime() + FUTURE_SKEW_MS) {
    return { ok: false, reason: "future" };
  }
  if (punchedAt < now.getTime() - MAX_AGE_MS) {
    return { ok: false, reason: "stale" };
  }
  const time = Math.floor((punchedAt - startAt.getTime()) / 1000);
  if (time < 0) return { ok: false, reason: "before-start" };
  if (time > MAX_RACE_SECONDS) return { ok: false, reason: "too-long" };
  return { ok: true, time };
}

/** Idempotenční klíč položky z API: stejná trojice + čas = stejný zápis. */
export function deviceEntryKey(
  tokenId: number,
  item: { bib: number; split: string; timeS: number },
) {
  return `dev${tokenId}:${item.split}:${item.bib}:${item.timeS}`;
}

/** Odpověď pro klienta: souhrn počtů podle výsledku. */
export function summarize(outcomes: Outcome[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const outcome of outcomes) counts[outcome] = (counts[outcome] ?? 0) + 1;
  return counts;
}

/** Ochrana proti CSRF u cookie session: Origin musí sedět s hostem požadavku. */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
