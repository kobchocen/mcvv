/**
 * Nastavení zpráv a pořadatelského e-mailu (mcvv_setting). Čisté funkce, bez DB.
 */
import { parseFlag } from "./site-core";

export const MESSAGES_ENABLED_KEY = "messages.enabled";
export const MESSAGES_NOTIFY_ORGANIZER_KEY = "messages.notify_organizer";
export const MESSAGES_NOTIFY_USER_KEY = "messages.notify_user";
export const ORGANIZER_EMAIL_KEY = "organizer.email";
/** Sekce „Změny přihlášek“ v denním souhrnu pořadateli (#130). */
export const ENTRY_CHANGES_NOTIFY_KEY = "entries.notify_changes";

export const MESSAGE_SETTING_KEYS = [
  MESSAGES_ENABLED_KEY,
  MESSAGES_NOTIFY_ORGANIZER_KEY,
  MESSAGES_NOTIFY_USER_KEY,
  ORGANIZER_EMAIL_KEY,
  ENTRY_CHANGES_NOTIFY_KEY,
] as const;

/** Poslední záchrana, když není nastavení ani env CONTACT_TO. */
export const DEFAULT_ORGANIZER_EMAIL = "mcvv@mcvv.org";

export type MessageSettings = {
  /** Kill-switch celé funkce (výchozí zapnuto). */
  enabled: boolean;
  /** Denní souhrn pořadateli (výchozí vypnuto). */
  notifyOrganizer: boolean;
  /** Upozornění přihlašujícím (výchozí vypnuto). */
  notifyUser: boolean;
  /**
   * Změny přihlášek v denním souhrnu pořadateli (výchozí vypnuto). Nezávisí na `enabled`
   * (vypínač zpráv), souhrn s nimi odejde i bez zpráv.
   */
  notifyChanges: boolean;
  /** Uložená hodnota „Pořadatelský e-mail“ (prázdná = fallback). */
  organizerEmail: string;
};

const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]+$/;

/** Platný jednoduchý e-mail (bez CR/LF, čárek apod.) nebo null. */
export function parseEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || value.length > 254 || !EMAIL_RE.test(value)) return null;
  return value;
}

export function messageSettingsFromRows(rows: { key: string; text: string }[]): MessageSettings {
  const map = new Map(rows.map((row) => [row.key, row.text]));
  const enabledRaw = map.get(MESSAGES_ENABLED_KEY);
  return {
    enabled: enabledRaw === undefined || enabledRaw.trim() === "" ? true : parseFlag(enabledRaw),
    notifyOrganizer: parseFlag(map.get(MESSAGES_NOTIFY_ORGANIZER_KEY)),
    notifyUser: parseFlag(map.get(MESSAGES_NOTIFY_USER_KEY)),
    notifyChanges: parseFlag(map.get(ENTRY_CHANGES_NOTIFY_KEY)),
    organizerEmail: parseEmail(map.get(ORGANIZER_EMAIL_KEY)) ?? "",
  };
}

/** Pořadatelský e-mail: nastavení → env CONTACT_TO → mcvv@mcvv.org. */
export function resolveOrganizerEmail(
  setting: string | null | undefined,
  envContactTo: string | null | undefined,
): string {
  return parseEmail(setting) ?? parseEmail(envContactTo) ?? DEFAULT_ORGANIZER_EMAIL;
}
