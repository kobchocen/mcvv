/**
 * Denní limit e-mailů (#190) – nastavení v administraci (mcvv_setting). Čisté funkce, bez DB.
 *
 * Pořadí: nastavení v adminu → env `MAIL_DAILY_CAP` / `MAIL_PRIORITY_RESERVE` → 90 / 15.
 * Bez uloženého nastavení se fronta chová přesně jako dřív (jen env).
 */
import type { MailPolicy } from "@/lib/mail/queue-core";

import { parseFlag } from "./site-core";

export const MAIL_DAILY_CAP_KEY = "mail.daily_cap";
export const MAIL_PRIORITY_RESERVE_KEY = "mail.priority_reserve";
export const MAIL_UNLIMITED_KEY = "mail.unlimited";

export const MAIL_SETTING_KEYS = [
  MAIL_DAILY_CAP_KEY,
  MAIL_PRIORITY_RESERVE_KEY,
  MAIL_UNLIMITED_KEY,
] as const;

export const DEFAULT_MAIL_DAILY_CAP = 90;
export const DEFAULT_MAIL_PRIORITY_RESERVE = 15;
/** Horní mez pro zadání v adminu (Resend Pro má 50 000 e-mailů měsíčně). */
export const MAIL_LIMIT_MAX = 100_000;

/** Uložené hodnoty z adminu; `null` = nenastaveno (platí env / výchozí hodnota). */
export type MailSettings = {
  dailyCap: number | null;
  priorityReserve: number | null;
  unlimited: boolean;
};

export type MailEnv = {
  MAIL_DAILY_CAP?: string | null;
  MAIL_PRIORITY_RESERVE?: string | null;
};

/** Celé nezáporné číslo do MAIL_LIMIT_MAX, jinak null. */
function parseCount(raw: string | null | undefined, min: number): number | null {
  const value = (raw ?? "").trim();
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= MAIL_LIMIT_MAX ? number : null;
}

export function mailSettingsFromRows(rows: { key: string; text: string }[]): MailSettings {
  const map = new Map(rows.map((row) => [row.key, row.text]));
  return {
    dailyCap: parseCount(map.get(MAIL_DAILY_CAP_KEY), 1),
    priorityReserve: parseCount(map.get(MAIL_PRIORITY_RESERVE_KEY), 0),
    unlimited: parseFlag(map.get(MAIL_UNLIMITED_KEY)),
  };
}

/** Výchozí hodnoty z env (stejně jako dřív `mailPolicy()`). */
export function envMailPolicy(env: MailEnv): { cap: number; reserve: number } {
  return {
    cap: Number(env.MAIL_DAILY_CAP ?? DEFAULT_MAIL_DAILY_CAP),
    reserve: Number(env.MAIL_PRIORITY_RESERVE ?? DEFAULT_MAIL_PRIORITY_RESERVE),
  };
}

/** Výsledná politika fronty: nastavení v adminu má přednost, env je fallback. */
export function resolveMailPolicy(settings: MailSettings | null, env: MailEnv): MailPolicy {
  const fallback = envMailPolicy(env);
  const policy: MailPolicy = {
    cap: settings?.dailyCap ?? fallback.cap,
    reserve: settings?.priorityReserve ?? fallback.reserve,
  };
  return settings?.unlimited ? { ...policy, unlimited: true } : policy;
}

export type MailSettingsInput =
  { ok: true; value: MailSettings } | { ok: false; error: "mailCap" | "mailReserve" };

/**
 * Formulář adminu: prázdné pole = nenastaveno (env). Limit 1–100 000, rezerva 0–100 000
 * a zároveň menší než výsledný limit (jinak by e-maily priority 1 nešly vůbec).
 */
export function parseMailSettingsInput(
  input: { dailyCap: string; priorityReserve: string; unlimited: boolean },
  env: MailEnv,
): MailSettingsInput {
  const capRaw = input.dailyCap.trim();
  const reserveRaw = input.priorityReserve.trim();
  const dailyCap = capRaw ? parseCount(capRaw, 1) : null;
  if (capRaw && dailyCap === null) return { ok: false, error: "mailCap" };
  const priorityReserve = reserveRaw ? parseCount(reserveRaw, 0) : null;
  if (reserveRaw && priorityReserve === null) return { ok: false, error: "mailReserve" };
  const fallback = envMailPolicy(env);
  if (
    (dailyCap !== null || priorityReserve !== null) &&
    (priorityReserve ?? fallback.reserve) >= (dailyCap ?? fallback.cap)
  ) {
    return { ok: false, error: "mailReserve" };
  }
  return { ok: true, value: { dailyCap, priorityReserve, unlimited: input.unlimited } };
}

export function sameMailSettings(a: MailSettings, b: MailSettings): boolean {
  return (
    a.dailyCap === b.dailyCap &&
    a.priorityReserve === b.priorityReserve &&
    a.unlimited === b.unlimited
  );
}
