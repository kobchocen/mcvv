/**
 * Automatické potvrzení přihlášek se startovným 0 Kč (čisté funkce, bez DB).
 *
 * Přihlášky, kde nikdo nic neplatí (e-maily se startovným zdarma, absolutní vítězové,
 * veteráni), mají po přepočtu stav 3 (zaplaceno, `nextStatus` při fee 0). Plánovaný job je
 * potvrdí (stav 5), až se přihláška `FREE_AUTO_CONFIRM_QUIET_MS` nezměnila, a pošle
 * jeden potvrzovací e-mail. Přidá-li se později placený běžec, přepočet stavu vrátí
 * přihlášku na 2 (nezaplaceno) – viz `nextStatus`.
 */
import { createHash } from "node:crypto";

import { ENTRY_STATUS } from "./status-codes";

/** Jak dlouho musí být přihláška beze změny (dohoda s Pavlem: 30–60 min). */
export const FREE_AUTO_CONFIRM_QUIET_MS = 45 * 60 * 1000;

/** Auditní akce automatického potvrzení (podle ní admin ukazuje odznak). */
export const FREE_AUTO_CONFIRM_ACTION = "entry.auto_confirmed_free";

export type FreeCandidate = {
  status: number | null;
  lineCount: number;
  /** Součet uloženého startovného řádků (stejně jako `recalculateRegistrationStatus`). */
  fee: number;
  paid: number;
  email: string | null;
  /** Poslední změna přihlášky (meta, založení, řádky); null = neznámá. */
  lastModified: Date | null;
};

export function isFreeAutoConfirmDue(candidate: FreeCandidate, now: Date): boolean {
  return (
    candidate.status === ENTRY_STATUS.paid &&
    candidate.lineCount > 0 &&
    candidate.fee === 0 &&
    candidate.paid === 0 &&
    !!candidate.email?.trim() &&
    candidate.lastModified !== null &&
    now.getTime() - candidate.lastModified.getTime() >= FREE_AUTO_CONFIRM_QUIET_MS
  );
}

/** Poslední známá změna: max z meta.updated_at, založení přihlášky a založení řádků. */
export function lastModifiedOf(times: (Date | null | undefined)[]): Date | null {
  const max = Math.max(0, ...times.map((time) => time?.getTime() ?? 0));
  return max > 0 ? new Date(max) : null;
}

/**
 * Klíč e-mailu proti dvojímu odeslání: stejná přihláška se stejnými běžci dostane
 * potvrzení jen jednou (i když se mezitím vrátila do stavu 2 a zpět).
 */
export function freeConfirmDedupeKey(year: number, id: number, runnerIds: string[]): string {
  const runners = [...runnerIds].sort().join(",");
  const hash = createHash("sha256").update(runners).digest("hex").slice(0, 16);
  return `confirm-free:${year}:${id}:${hash}`;
}

/** Odznak v administraci: potvrzeno (5), 0 Kč a potvrdil to job. */
export function showFreeAutoBadge(input: {
  status: number | null;
  fee: number;
  autoConfirmed: boolean;
}): boolean {
  return input.status === ENTRY_STATUS.confirmed && input.fee === 0 && input.autoConfirmed;
}
