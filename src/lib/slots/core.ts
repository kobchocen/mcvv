/**
 * Termíny přihlášek ročníku (sloty early / standard / late / onsite) – čisté funkce bez DB.
 *
 * Sloty (`mcvv_prihl_slot`) jsou zdroj termínů a startovného. Když ročník sloty nemá
 * (starší ročníky, nový ročník před nastavením), platí dosavadní chování: přihlášky otevřené
 * do konce dne uzávěrky `prihl_datum`, cena z číselníku kategorií.
 *
 * Veřejně se nikdy neříká „slot“: standardní / pozdní přihlášky (dohlášky) / přihlášky na místě.
 */
import { zonedCivilToUtc, RACE_TIME_ZONE } from "@/lib/date/race-schedule";

export const SLOT_TYPES = ["early", "standard", "late", "onsite"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];
export type FeeGroup = "dospeli" | "mladez";

export type Slot = {
  type: SlotType;
  /** Začátek (UTC, včetně). */
  from: Date;
  /** Konec (UTC, exkluzivní). */
  to: Date;
  active: boolean;
  feeAdult: number;
  feeYouth: number;
  /** Lhůta na zaplacení v minutách (late = 60); null = bez lhůty. */
  payWithinMinutes: number | null;
};

/** Nastavení ročníku k termínům (časy v sekundách od půlnoci, Europe/Prague). */
export type SlotSettings = {
  regDeadline: Date | null;
  standardPayUntil: Date | null;
  standardPayMailS: number;
  officeOpensS: number;
  onsiteUntilS: number;
};

export const DEFAULT_STANDARD_PAY_MAIL_S = 7 * 3600;
export const DEFAULT_STANDARD_PAY_UNTIL_S = 12 * 3600;
export const DEFAULT_OFFICE_OPENS_S = 9 * 3600;
export const DEFAULT_ONSITE_UNTIL_S = 9 * 3600 + 45 * 60;

/**
 * Termíny, ve kterých vznikají a mění se přihlášky z webu. Pozdní přihláška (late) se mění jen
 * do odeslání a hned se platí (`late-core.ts`); na místě jen v závodní kanceláři.
 */
export const WRITABLE_SLOT_TYPES: readonly SlotType[] = ["early", "standard", "late"];

export function slotOf(slots: readonly Slot[], type: SlotType): Slot | null {
  return slots.find((slot) => slot.type === type) ?? null;
}

export function slotRunning(slot: Slot | null, now: Date): boolean {
  return Boolean(
    slot?.active && slot.from.getTime() <= now.getTime() && now.getTime() < slot.to.getTime(),
  );
}

/** Aktivní termín, do kterého spadá `now` (z daných druhů); mezi termíny null. */
export function activeSlot(
  slots: readonly Slot[],
  now: Date,
  types: readonly SlotType[] = WRITABLE_SLOT_TYPES,
): Slot | null {
  return slots.find((slot) => types.includes(slot.type) && slotRunning(slot, now)) ?? null;
}

/** Pražské civilní datum a čas okamžiku. */
export function pragueCivil(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RACE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Okamžik `seconds` od půlnoci (Praha) v pražský den okamžiku `day`. */
export function atPragueTime(day: Date, seconds: number): Date {
  const c = pragueCivil(day);
  return zonedCivilToUtc(
    c.year,
    c.month,
    c.day,
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  );
}

/** Okamžik `seconds` od půlnoci (Praha) v kalendářní den DATE sloupce (uložen jako UTC půlnoc). */
export function atDateTime(date: Date, seconds: number): Date {
  return zonedCivilToUtc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  );
}

/** Exkluzivní konec standardu z uzávěrky: den po `prihl_datum` 00:00 Praha. */
export function standardEndFromDeadline(deadline: Date): Date {
  const next = new Date(deadline.getTime() + 24 * 3600 * 1000);
  return atDateTime(next, 0);
}

/** Uzávěrka (`prihl_datum`, DATE) z konce standardu: pražský den posledního okamžiku standardu. */
export function deadlineFromStandardEnd(to: Date): Date {
  const c = pragueCivil(new Date(to.getTime() - 1000));
  return new Date(Date.UTC(c.year, c.month - 1, c.day));
}

/**
 * Jsou přihlášky otevřené (lze přidávat / měnit z webu)? Se sloty: běží aktivní early,
 * standard nebo pozdní přihlášky. Bez slotů: dosavadní chování – do konce dne uzávěrky
 * (bez uzávěrky vždy).
 */
export function registrationOpen(
  slots: readonly Slot[],
  regDeadline: Date | null,
  now: Date,
): boolean {
  if (slots.length > 0) {
    return activeSlot(slots, now) !== null;
  }
  if (!regDeadline) return true;
  return now.getTime() < standardEndFromDeadline(regDeadline).getTime();
}

/** Konec standardních přihlášek (exkluzivní): ze slotu, jinak z uzávěrky. */
export function standardEnd(slots: readonly Slot[], regDeadline: Date | null): Date | null {
  const standard = slotOf(slots, "standard");
  if (standard) return standard.to;
  return regDeadline ? standardEndFromDeadline(regDeadline) : null;
}

/** Lhůta doplatku standardu: nastavení, jinak den konce standardu 12:00 (Praha). */
export function standardPayUntil(
  slots: readonly Slot[],
  settings: Pick<SlotSettings, "regDeadline" | "standardPayUntil">,
): Date | null {
  if (settings.standardPayUntil) return settings.standardPayUntil;
  const end = standardEnd(slots, settings.regDeadline);
  return end ? atPragueTime(end, DEFAULT_STANDARD_PAY_UNTIL_S) : null;
}

/** Odeslání e-mailu „zaplaťte dnes do …“: den lhůty doplatku v čase `doplatek_std_mail`. */
export function standardPayMailAt(payUntil: Date, mailSeconds: number): Date {
  return atPragueTime(payUntil, mailSeconds);
}

/** Startovné kategorie v termínu: cena skupiny; bez termínu nebo skupiny cena z číselníku. */
export function slotFee(slot: Slot | null, group: FeeGroup | null, categoryFee: number): number {
  if (!slot || !group) return categoryFee;
  return group === "mladez" ? slot.feeYouth : slot.feeAdult;
}

/** Startovné přihlášky (dospělí / mládež). */
export type EntryPrices = { feeAdult: number; feeYouth: number };

/**
 * Ceny přihlášky (Q342): uložené u přihlášky, jinak (starší záznam bez ceny) dnešní cena
 * termínu, ve kterém vznikla (bez termínu = standard); ročník bez termínů → null.
 */
export function entryPrices(
  meta: { slot: SlotType | null; feeAdult: number | null; feeYouth: number | null } | null,
  slots: readonly Slot[],
): EntryPrices | null {
  if (meta && meta.feeAdult != null && meta.feeYouth != null) {
    return { feeAdult: meta.feeAdult, feeYouth: meta.feeYouth };
  }
  const slot = slotOf(slots, meta?.slot ?? "standard");
  return slot ? { feeAdult: slot.feeAdult, feeYouth: slot.feeYouth } : null;
}

/** Startovné kategorie v přihlášce: cena skupiny z cen přihlášky, jinak cena z číselníku. */
export function entryFee(
  prices: EntryPrices | null,
  group: FeeGroup | null,
  categoryFee: number,
): number {
  if (!prices || !group) return categoryFee;
  return group === "mladez" ? prices.feeYouth : prices.feeAdult;
}

export type SlotIssue = "order" | "overlap" | "standard_missing" | "pay_until" | "fee" | "onsite";

/** Kontrola nastavení termínů před uložením. */
export function validateSlots(
  slots: readonly Slot[],
  input: { payUntil: Date | null; officeOpensS: number; onsiteUntilS: number },
): SlotIssue[] {
  const issues = new Set<SlotIssue>();
  for (const slot of slots) {
    if (slot.feeAdult < 0 || slot.feeYouth < 0 || slot.feeAdult > 9999 || slot.feeYouth > 9999)
      issues.add("fee");
    if (slot.active && slot.type !== "onsite" && slot.from.getTime() >= slot.to.getTime())
      issues.add("order");
  }
  const online = slots
    .filter((s) => s.active && s.type !== "onsite")
    .sort((a, b) => a.from.getTime() - b.from.getTime());
  for (let i = 1; i < online.length; i += 1) {
    if (online[i]!.from.getTime() < online[i - 1]!.to.getTime()) issues.add("overlap");
  }
  const standard = slotOf(slots, "standard");
  if (!standard?.active) issues.add("standard_missing");
  if (standard && input.payUntil && input.payUntil.getTime() < standard.to.getTime())
    issues.add("pay_until");
  if (input.officeOpensS >= input.onsiteUntilS) issues.add("onsite");
  return [...issues];
}

/** Hodnota pro `<input type="datetime-local">` v pražském čase. */
export function pragueLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  const c = pragueCivil(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${c.year}-${p(c.month)}-${p(c.day)}T${p(c.hour)}:${p(c.minute)}`;
}

/** `YYYY-MM-DDTHH:MM` (pražský čas) → okamžik; null pro neplatný vstup. */
export function parsePragueLocalInput(raw: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((raw ?? "").trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return zonedCivilToUtc(y, mo, d, h, mi);
}

/**
 * Poslední den (pražské datum YYYY-MM-DD), kdy se platba přihlášky ještě automaticky potvrdí:
 * pozdější z lhůty doplatku standardu a konce zapnutých pozdních přihlášek. Bez termínů null
 * (platí dosavadní 3. 12.).
 */
export function autoConfirmLastDay(slots: readonly Slot[], payUntil: Date | null): string | null {
  if (slots.length === 0) return null;
  const late = slotOf(slots, "late");
  const candidates = [payUntil, late?.active ? new Date(late.to.getTime() - 1000) : null].filter(
    (d): d is Date => d !== null,
  );
  if (candidates.length === 0) return null;
  const last = new Date(Math.max(...candidates.map((d) => d.getTime())));
  const c = pragueCivil(last);
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}
