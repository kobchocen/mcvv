/**
 * Prázdné přihlášky (bez běžců) – čistá pravidla pro administraci a jednorázový úklid.
 *
 * Dřív vznikala prázdná přihláška (stav 1) automaticky při každé návštěvě /prihlasky.
 * Teď vzniká až s prvním běžcem, takže staré prázdné přihlášky aktuálního ročníku lze
 * uklidit (`scripts/cleanup-empty-registrations.ts`) a v administraci je skrýt.
 */
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

/** Přihláška pořadatelů (č. 1) – zakládá se záměrně s ročníkem, nikdy se neuklízí. */
export const ORGANIZER_REGISTRATION_NUMBER = 1;

/**
 * Zrušit lze jen přihlášku s běžci ve stavu prázdná/nezaplacená. Zrušení prázdné přihlášky
 * nemá smysl (nic neblokuje) a dřív přihlašujícího „zasekl“ na zrušené přihlášce.
 */
export function canCancelRegistration(entry: {
  status: number | null | undefined;
  lineCount: number;
}): boolean {
  return (
    entry.lineCount > 0 &&
    (entry.status === ENTRY_STATUS.empty || entry.status === ENTRY_STATUS.unpaid)
  );
}

export type CleanupCandidate = {
  year: number;
  id: number;
  status: number | null;
  lines: number;
  payments: number;
  threads: number;
  bankTxs: number;
  hasMeta: boolean;
};

export type CleanupVerdict =
  | "delete"
  | "other_year"
  | "organizer"
  | "status"
  | "lines"
  | "payments"
  | "threads"
  | "bank_tx"
  | "meta";

/**
 * Smí úklid přihlášku smazat? Jen aktuální ročník, stav 1, ne č. 1 a bez řádků, plateb,
 * vláken zpráv, bankovních transakcí a záznamu v mcvv_prihlaska_meta (= nikdo s ní nic nedělal).
 */
export function cleanupVerdict(candidate: CleanupCandidate, currentYear: number): CleanupVerdict {
  if (candidate.year !== currentYear) return "other_year";
  if (candidate.id === ORGANIZER_REGISTRATION_NUMBER) return "organizer";
  if (candidate.status !== ENTRY_STATUS.empty) return "status";
  if (candidate.lines > 0) return "lines";
  if (candidate.payments > 0) return "payments";
  if (candidate.threads > 0) return "threads";
  if (candidate.bankTxs > 0) return "bank_tx";
  if (candidate.hasMeta) return "meta";
  return "delete";
}

/** Parametry skriptu: výchozí je jen výpis (dry-run), mazání až s `--apply`. */
export function parseCleanupArgs(argv: readonly string[]): {
  apply: boolean;
  allowRemote: boolean;
  year: number | null;
} {
  const yearArg = argv.find((arg) => arg.startsWith("--year="));
  const year = yearArg ? Number.parseInt(yearArg.slice("--year=".length), 10) : null;
  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    year: year !== null && Number.isFinite(year) ? year : null,
  };
}
