import { z } from "zod";

import { FINISH_SPLIT, isSplitCode, isStationCode } from "./stations";

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
/** Webový klient: split 1–9 nebo start "0" (#203, zápis jde do evidence startu). */
const webStation = z.string().refine(isStationCode, "invalid station");

export const webEntrySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    id: entryId,
    split: webStation,
    bib,
    punchedAt: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("correct"),
    id: entryId,
    replaces: entryId,
    split: webStation,
    bib,
    punchedAt: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("delete"),
    id: entryId,
    replaces: entryId,
    split: webStation,
  }),
]);

export const webBatchSchema = z.object({
  entries: z.array(webEntrySchema).min(1).max(MAX_BATCH),
});

export type WebEntry = z.infer<typeof webEntrySchema>;

/**
 * Položka z klienta OBD: `cislo;time_s` ze `splits.csv` (+ volitelný kód splitu).
 * Výchozí chování je 1:1 s legacy (Pavel, Q22): platí první zapsaný čas, oprava v OBD vznikne
 * jako konflikt pro admina a smazání se nepropaguje. Za přepínačem v klientovi:
 * - `replace: true` (klient `applyCorrections`): jiný čas přepíše hodnotu, kterou zapsalo OBD;
 * - `action: "delete"` (klient `deleteMissing`): řádek s tímto časem ze souboru zmizel.
 */
export const deviceItemSchema = z.object({
  action: z.enum(["set", "delete"]).default("set"),
  replace: z.boolean().default(false),
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
 * - OBD: stejná hodnota = beze změny, jiná = konflikt (API zařízení: `decideDeviceWrite`).
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

export type DeviceWriteDecision = "insert" | "unchanged" | "replace" | "conflict";

/**
 * Zápis z OBD: nic tam není → zapsat; stejný čas → beze změny; jiný čas → konflikt (výchozí,
 * 1:1 s legacy: platí první zapsaný čas). Jen s `allowReplace` (přepínač `applyCorrections`)
 * se přepíše čas, který dřív zapsalo OBD; ruční zápis (splitmaker, admin) se nepřepíše nikdy.
 */
export function decideDeviceWrite(
  existing: { time: number; ownedByObd: boolean } | null,
  incomingTime: number,
  allowReplace = false,
): DeviceWriteDecision {
  if (!existing) return "insert";
  if (existing.time === incomingTime) return "unchanged";
  return allowReplace && existing.ownedByObd ? "replace" : "conflict";
}

export type DeviceDeleteDecision = "delete" | "missing" | "not-owned";

/** Řádek zmizel ze souboru OBD: smazat jen hodnotu, kterou zapsalo OBD a která se nezměnila. */
export function decideDeviceDelete(
  existing: { time: number; ownedByObd: boolean } | null,
  removedTime: number,
): DeviceDeleteDecision {
  if (!existing || existing.time !== removedTime) return "missing";
  return existing.ownedByObd ? "delete" : "not-owned";
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
  item: { bib: number; split: string; timeS: number; action?: "set" | "delete" },
) {
  const prefix = item.action === "delete" ? "del:" : "";
  return `dev${tokenId}:${prefix}${item.split}:${item.bib}:${item.timeS}`;
}

/**
 * Stejný čas se může v OBD objevit znovu (smazán a vrácen). Další zápis se stejným klíčem
 * dostane pořadové číslo `#2`, `#3`…, aby šel znovu zapsat, a opakované odeslání zůstalo idempotentní.
 */
export function nextDeviceEntryKey(base: string, existingKeys: readonly string[]): string {
  const n = existingKeys.filter((key) => key === base || key.startsWith(`${base}#`)).length;
  return n === 0 ? base : `${base}#${n + 1}`;
}

/** Zápisy, které už neplatí (přepsané / smazané) – stejný klíč je pak nový zápis. */
export const SUPERSEDED_OUTCOMES: Outcome[] = ["replaced", "deleted"];

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
