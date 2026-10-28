import {
  firstSundayOfDecember,
  pragueCalendarYear,
  zonedCivilToUtc,
} from "@/lib/date/race-schedule";
import { isoWithOffset } from "@/lib/ofeed/iof-xml";

import { parsePragueLocal } from "./admin-core";

/**
 * Testovací běh nad produkcí (#186) – čistá logika bez DB.
 *
 * Admin v `/admin/den-zavodu/zive` spustí test a zvolí nulu (za 5 minut, přesný čas, dnes
 * 10:15 / 20:15). Po dobu testu je nula závodu přepsaná (zkušební nula), splitmakeři, Start,
 * obd-klient i OFeed (jen testovací profil) fungují jako v den závodu. Test se sám ukončí po
 * 3 h (`expiresAt`), nejpozději ale v den závodu 00:00 (Q70). Úklid je automatický (Q71).
 */

export const TEST_RUN_KEY = "live_test_run";
/** Délka testu od nuly (nebo od spuštění, je-li nula v minulosti). */
export const TEST_RUN_DURATION_MS = 3 * 60 * 60 * 1000;
/** Nula smí být nejvýš tolik v minulosti (např. předvolba 10:15 kliknutá v 10:16). */
export const TEST_ZERO_PAST_TOLERANCE_MS = 10 * 60 * 1000;
/** Nula smí být nejvýš tolik dopředu. */
export const TEST_ZERO_MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

export const TEST_ZERO_CHOICES = ["in5", "at1015", "at2015", "custom"] as const;
export type TestZeroChoice = (typeof TEST_ZERO_CHOICES)[number];

export type TestRun = {
  id: string;
  startedAt: Date;
  zero: Date;
  expiresAt: Date;
  /** Admin, který test spustil (null = neznámý). */
  startedBy: number | null;
  /** Klíče zařízení vytvořené během testu – při úklidu se zneplatní. */
  tokenIds: number[];
};

const ID_PATTERN = /^[a-z0-9]{4,32}$/;

export function serializeTestRun(run: TestRun): string {
  return JSON.stringify({
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    zero: run.zero.toISOString(),
    expiresAt: run.expiresAt.toISOString(),
    startedBy: run.startedBy,
    tokenIds: run.tokenIds,
  });
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Stav z tabulky Setting; poškozený nebo cizí obsah = žádný test. */
export function parseTestRun(raw: string | null | undefined): TestRun | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== "string" || !ID_PATTERN.test(obj.id)) return null;
  const startedAt = parseDate(obj.startedAt);
  const zero = parseDate(obj.zero);
  const expiresAt = parseDate(obj.expiresAt);
  if (!startedAt || !zero || !expiresAt) return null;
  const startedBy =
    typeof obj.startedBy === "number" && Number.isInteger(obj.startedBy) ? obj.startedBy : null;
  const tokenIds = Array.isArray(obj.tokenIds)
    ? [
        ...new Set(
          obj.tokenIds.filter((id): id is number => typeof id === "number" && Number.isInteger(id)),
        ),
      ].sort((a, b) => a - b)
    : [];
  return { id: obj.id, startedAt, zero, expiresAt, startedBy, tokenIds };
}

/** Den závodu 00:00 Europe/Prague: datum ročníku, jinak první neděle v prosinci. */
export function raceDayCutoff(raceDate: Date | null | undefined, year: number): Date {
  if (raceDate) {
    return zonedCivilToUtc(
      raceDate.getUTCFullYear(),
      raceDate.getUTCMonth() + 1,
      raceDate.getUTCDate(),
      0,
      0,
    );
  }
  return zonedCivilToUtc(year, 12, firstSundayOfDecember(year), 0, 0);
}

/**
 * Hranice pro testy: den závodu 00:00. Když nastavený ročník už proběhl (nový ještě není
 * založený), platí první neděle v prosinci aktuálního roku, po ní příštího.
 */
export function testCutoff(raceDate: Date | null | undefined, year: number, now: Date): Date {
  const DAY = 24 * 60 * 60 * 1000;
  const configured = raceDayCutoff(raceDate, year);
  if (now.getTime() < configured.getTime() + DAY) return configured;
  const pragueYear = pragueCalendarYear(now);
  const thisYear = raceDayCutoff(null, pragueYear);
  if (now.getTime() < thisYear.getTime() + DAY) return thisYear;
  return raceDayCutoff(null, pragueYear + 1);
}

/** Od dne závodu 00:00 (celý den závodu) test spustit nelze (Q70). */
export function testRunBlocked(now: Date, cutoff: Date): boolean {
  return now.getTime() >= cutoff.getTime();
}

/** Volba nuly z formuláře → instant. Neplatná volba / čas = null. */
export function resolveTestZero(choice: string, custom: string, now: Date): Date | null {
  switch (choice) {
    case "in5": {
      const zero = new Date(now.getTime() + 5 * 60 * 1000);
      zero.setUTCMilliseconds(0);
      return zero;
    }
    case "at1015":
    case "at2015": {
      const day = isoWithOffset(now).slice(0, 10);
      return parsePragueLocal(`${day}T${choice === "at1015" ? "10:15" : "20:15"}`);
    }
    case "custom":
      return parsePragueLocal(custom);
    default:
      return null;
  }
}

export type TestStartError =
  "zero" | "zeroPast" | "zeroFar" | "raceDay" | "active" | "ofeedProfile" | "ofeedTestMissing";

/** Konec testu: 3 h od nuly (nebo od spuštění), nejpozději den závodu 00:00. */
export function testRunExpiry(startedAt: Date, zero: Date, cutoff: Date): Date {
  const base = Math.max(startedAt.getTime(), zero.getTime());
  return new Date(Math.min(base + TEST_RUN_DURATION_MS, cutoff.getTime()));
}

export function testRunExpired(run: TestRun, now: Date): boolean {
  return now.getTime() >= run.expiresAt.getTime();
}

export function validateTestStart(input: {
  now: Date;
  zero: Date | null;
  cutoff: Date;
  active: TestRun | null;
  ofeedProfile: "live" | "test";
  ofeedTestEventId: string | null | undefined;
}): TestStartError | null {
  const { now, zero, cutoff, active } = input;
  if (testRunBlocked(now, cutoff)) return "raceDay";
  if (active && !testRunExpired(active, now)) return "active";
  // Pojistka OFeed: test jen s testovací akcí, ostrá akce nesmí dostat testovací data.
  if (!input.ofeedTestEventId) return "ofeedTestMissing";
  if (input.ofeedProfile !== "test") return "ofeedProfile";
  if (!zero) return "zero";
  if (zero.getTime() < now.getTime() - TEST_ZERO_PAST_TOLERANCE_MS) return "zeroPast";
  if (zero.getTime() > now.getTime() + TEST_ZERO_MAX_AHEAD_MS) return "zeroFar";
  if (zero.getTime() >= cutoff.getTime()) return "raceDay";
  return null;
}

/**
 * Okno testovacích dat pro úklid: od spuštění do teď, nikdy přes den závodu 00:00 – ostrá
 * data dne závodu se nesmažou ani při pozdním úklidu.
 */
export function testDataWindow(run: TestRun, now: Date, cutoff: Date): { from: Date; until: Date } {
  const until = Math.max(Math.min(now.getTime(), cutoff.getTime()), run.startedAt.getTime());
  return { from: run.startedAt, until: new Date(until) };
}

/**
 * Identita datové sady pro obd-klient (Q72): změní se s novým testem i s novou nulou;
 * klient pak sám vynuluje state.json a pošle soubor znovu.
 */
export function dataEpoch(run: TestRun | null, zero: Date): string {
  return `${run ? `test-${run.id}` : "live"}@${zero.toISOString()}`;
}
