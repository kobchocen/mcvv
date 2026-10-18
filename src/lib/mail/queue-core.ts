/**
 * E-mailová fronta – čistá logika (bez DB a sítě), testovatelná přes injektovaný store/transport.
 *
 * Resend Free: 100 e-mailů/den (reset v UTC). Fronta drží vlastní strop `cap` (výchozí 90)
 * a rezervu `reserve` pro prioritu 0 (potvrzení přihlášek, ověřovací e-maily, alerty).
 * Newsletter má nejnižší prioritu a čerpá jen to, co zbude po frontě.
 */

export type MailKind =
  | "auth"
  | "confirmation"
  | "alert"
  | "contact"
  | "reminder"
  | "summary"
  | "other";

export const KIND_PRIORITY: Record<MailKind, 0 | 1> = {
  auth: 0,
  confirmation: 0,
  alert: 0,
  contact: 1,
  reminder: 1,
  summary: 1,
  other: 1,
};

/** Tvrdý limit Resend Free; alerty smí jít nad `cap`, ale nikdy nad tento limit. */
export const PROVIDER_DAILY_LIMIT = 100;
export const MAX_ATTEMPTS = 5;
export const RETRY_DELAY_MS = 15 * 60 * 1000;
export const STALE_CLAIM_MS = 15 * 60 * 1000;

export type MailPolicy = { cap: number; reserve: number };

export type DayState = {
  sentToday: number;
  /** Resend vrátil 429 kvóty – do konce UTC dne už nic neposílat. */
  quotaExceeded: boolean;
};

/** Kolik e-mailů dané priority lze dnes ještě odeslat. */
export function remainingBudget(
  priority: 0 | 1 | 2,
  day: DayState,
  policy: MailPolicy,
  kind?: MailKind,
): number {
  if (day.quotaExceeded) return 0;
  const ceiling =
    kind === "alert"
      ? Math.max(policy.cap, PROVIDER_DAILY_LIMIT - 2)
      : priority === 0
        ? policy.cap
        : Math.max(0, policy.cap - policy.reserve);
  return Math.max(0, ceiling - day.sentToday);
}

/** Rozpočet newsletteru = zbytek pro prioritu 1 po odečtení čekajících e-mailů priority 1. */
export function newsletterBudget(day: DayState, policy: MailPolicy, pendingPriority1: number) {
  return Math.max(0, remainingBudget(2, day, policy) - pendingPriority1);
}

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcDay(now: Date): Date {
  const start = utcDayStart(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type SendResult =
  | { ok: true; providerId: string | null }
  | { ok: false; kind: "quota" | "retryable" | "permanent"; error: string };

/**
 * Rozliší odpověď Resend. 429 s `daily_quota_exceeded`/`monthly_quota_exceeded` = kvóta
 * (čekat do dalšího dne), jiný 429 = krátký rate limit (zkusit při dalším běhu).
 */
export function classifyResendFailure(status: number, body: string): SendResult {
  const detail = body.slice(0, 300);
  if (status === 429) {
    if (/quota/i.test(body))
      return { ok: false, kind: "quota", error: `Resend 429 (kvóta): ${detail}` };
    return { ok: false, kind: "retryable", error: `Resend 429: ${detail}` };
  }
  if (status >= 500) return { ok: false, kind: "retryable", error: `Resend ${status}: ${detail}` };
  return { ok: false, kind: "permanent", error: `Resend ${status}: ${detail}` };
}

export type QueuedMail = {
  id: number;
  kind: MailKind;
  priority: number;
  toEmail: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  attempts: number;
};

export interface MailQueueStore {
  dayState(now: Date): Promise<DayState>;
  /** Uvolní záznamy zaseknuté ve `sending` (pád uprostřed) – vrátí je do fronty. */
  releaseStale(olderThan: Date): Promise<number>;
  /** Atomicky zabere až `limit` čekajících záznamů s prioritou <= maxPriority (nejdřív nižší priorita, pak nejstarší). */
  claim(input: {
    limit: number;
    maxPriority: number;
    ids?: number[];
    claimToken: string;
    now: Date;
  }): Promise<QueuedMail[]>;
  markSent(id: number, providerId: string | null, now: Date): Promise<void>;
  /** Vrátí do fronty s odkladem; při překročení pokusů označí jako failed. */
  defer(
    id: number,
    input: { notBefore: Date; error: string; countAttempt: boolean },
  ): Promise<void>;
  markFailed(id: number, error: string): Promise<void>;
  markQuotaExceeded(now: Date): Promise<void>;
  /** Vrátí true jen poprvé za den (atomicky), aby alert o limitu odešel jednou. */
  claimCapAlert(now: Date): Promise<boolean>;
  pendingCount(maxPriority: number, now: Date): Promise<number>;
}

export type DrainOutcome = {
  sent: number;
  deferred: number;
  failed: number;
  capReached: boolean;
  quotaExceeded: boolean;
};

/**
 * Odešle čekající e-maily v rámci dnešního rozpočtu. `ids` omezí běh na konkrétní záznamy
 * (okamžité odeslání hned po zařazení).
 */
export async function drainQueue(input: {
  store: MailQueueStore;
  send: (mail: QueuedMail) => Promise<SendResult>;
  policy: MailPolicy;
  claimToken: string;
  limit: number;
  ids?: number[];
  now?: Date;
}): Promise<DrainOutcome> {
  const now = input.now ?? new Date();
  const { store, policy } = input;
  const outcome: DrainOutcome = {
    sent: 0,
    deferred: 0,
    failed: 0,
    capReached: false,
    quotaExceeded: false,
  };
  await store.releaseStale(new Date(now.getTime() - STALE_CLAIM_MS));
  const day = await store.dayState(now);
  if (day.quotaExceeded) {
    outcome.quotaExceeded = true;
    return outcome;
  }
  // Zabíráme max. tolik, kolik dovolí rozpočet priority 0 (alerty řešíme zvlášť níže).
  const budget0 = Math.max(
    remainingBudget(0, day, policy),
    remainingBudget(0, day, policy, "alert"),
  );
  const limit = Math.min(input.limit, budget0);
  if (limit <= 0) {
    outcome.capReached = (await store.pendingCount(1, now)) > 0;
    return outcome;
  }
  const claimed = await store.claim({
    limit,
    maxPriority: 1,
    ids: input.ids,
    claimToken: input.claimToken,
    now,
  });
  let sentToday = day.sentToday;
  for (const mail of claimed) {
    const allowed = remainingBudget(
      mail.priority === 0 ? 0 : 1,
      { sentToday, quotaExceeded: outcome.quotaExceeded },
      policy,
      mail.kind,
    );
    if (outcome.quotaExceeded || allowed <= 0) {
      // Limit: počkat do dalšího dne (bez započtení pokusu).
      await store.defer(mail.id, {
        notBefore: nextUtcDay(now),
        error: outcome.quotaExceeded ? "kvóta Resend vyčerpána" : "denní limit fronty",
        countAttempt: false,
      });
      outcome.deferred += 1;
      if (!outcome.quotaExceeded) outcome.capReached = true;
      continue;
    }
    const result = await input.send(mail);
    if (result.ok) {
      await store.markSent(mail.id, result.providerId, now);
      sentToday += 1;
      outcome.sent += 1;
    } else if (result.kind === "quota") {
      await store.markQuotaExceeded(now);
      await store.defer(mail.id, {
        notBefore: nextUtcDay(now),
        error: result.error,
        countAttempt: false,
      });
      outcome.quotaExceeded = true;
      outcome.deferred += 1;
    } else if (result.kind === "retryable" && mail.attempts + 1 < MAX_ATTEMPTS) {
      await store.defer(mail.id, {
        notBefore: new Date(now.getTime() + RETRY_DELAY_MS),
        error: result.error,
        countAttempt: true,
      });
      outcome.deferred += 1;
    } else {
      await store.markFailed(mail.id, result.error);
      outcome.failed += 1;
    }
  }
  if (!outcome.capReached && !input.ids) {
    // Zbyly čekající e-maily, na které dnes nevyšel rozpočet?
    const left = remainingBudget(1, { sentToday, quotaExceeded: false }, policy);
    if (left <= 0 && (await store.pendingCount(1, now)) > 0) outcome.capReached = true;
  }
  return outcome;
}

/** Text alertu při dosažení denního limitu. */
export function capAlertMail(input: {
  cap: number;
  sentToday: number;
  quota: boolean;
  adminUrl: string;
}) {
  const reason = input.quota
    ? "Resend vrátil chybu kvóty (429)."
    : `Byl dosažen denní limit fronty (${input.cap}).`;
  const text = `${reason}\nDnes odesláno: ${input.sentToday}.\nČekající e-maily se odešlou automaticky další den (UTC).\n\nPřehled: ${input.adminUrl}`;
  return {
    subject: "MCVV: denní limit e-mailů dosažen",
    text,
    html: `<p>${reason}</p><p>Dnes odesláno: ${input.sentToday}.<br>Čekající e-maily se odešlou automaticky další den (UTC).</p><p><a href="${input.adminUrl}">Přehled v administraci</a></p>`,
  };
}
