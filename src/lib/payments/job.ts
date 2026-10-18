import { Prisma } from "@prisma/client";

import { toPaymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { confirmRegistrationCore } from "@/lib/entries/confirm";
import { paidAmount } from "@/lib/entries/fee";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
import { currentRaceYear } from "@/lib/entries/year";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/queue";
import { utcDayStart } from "@/lib/mail/queue-core";

import {
  chooseRequest,
  fetchFio,
  FIO_MIN_INTERVAL_MS,
  healStrongAuth,
  isoDate,
  redact,
  type FioRequest,
  type FioTransaction,
} from "./fio";
import { autoConfirmAllowed, matchTransaction, type RegistrationSnapshot } from "./match";
import { pragueClock, renderDailySummary, summaryDue } from "./summary";

const JOB = "payments";
const LOCK_TTL_MS = 10 * 60 * 1000;
const STALE_PROCESSING_MS = 10 * 60 * 1000;

const STATE = {
  lock: "payments_lock",
  lastRequestAt: "fio_last_request_at",
  lastRunOk: "payments_last_ok",
  lastPeriodsDay: "fio_last_periods_day",
  lastId: "fio_last_id",
  summaryDay: "payments_summary_day",
} as const;

export function paymentsDryRun(): boolean {
  if (env.PAYMENTS_DRY_RUN) return env.PAYMENTS_DRY_RUN === "true";
  const appEnv = (env.APP_ENV ?? "").toLowerCase();
  return !(appEnv === "prod" || appEnv === "production");
}

export function fioMode(): "last" | "periods" {
  if (env.FIO_MODE) return env.FIO_MODE;
  return paymentsDryRun() ? "periods" : "last";
}

function origin(): string {
  return (env.AUTH_ORIGIN ?? "https://www.mcvv.org").replace(/\/$/, "");
}

async function getState(name: string): Promise<string | null> {
  return (await prisma.jobState.findUnique({ where: { name } }))?.value ?? null;
}

async function setState(name: string, value: string): Promise<void> {
  await prisma.jobState.upsert({ where: { name }, create: { name, value }, update: { value } });
}

/** Zámek přes řádek v DB (funguje i s poolem spojení). Vrací false, když běží jiný běh. */
async function acquireLock(now: Date): Promise<boolean> {
  await prisma.jobState.createMany({
    data: [{ name: STATE.lock, value: "" }],
    skipDuplicates: true,
  });
  const result = await prisma.jobState.updateMany({
    where: {
      name: STATE.lock,
      OR: [{ value: "" }, { value: { lt: new Date(now.getTime() - LOCK_TTL_MS).toISOString() } }],
    },
    data: { value: now.toISOString() },
  });
  return result.count === 1;
}

async function releaseLock(): Promise<void> {
  await setState(STATE.lock, "");
}

/** Alert na ALERT_TO, max. jednou za UTC den pro daný druh. */
export async function alertPayments(kind: string, message: string, now = new Date()) {
  const day = isoDate(utcDayStart(now));
  await sendMail({
    kind: "alert",
    to: env.ALERT_TO,
    dedupeKey: `alert:payments:${kind}:${day}`,
    subject: `MCVV platby: chyba (${kind})`,
    text: `${message}\n\nPřehled: ${origin()}/cs/admin/platby`,
    html: `<p>${message.replace(/[<>&]/g, "")}</p><p><a href="${origin()}/cs/admin/platby">Přehled plateb</a></p>`,
  });
}

async function snapshot(year: number, id: number): Promise<RegistrationSnapshot> {
  const reg = await prisma.registration.findUnique({
    where: { year_id: { year, id } },
    select: { status: true, lines: { select: { entryFee: true } } },
  });
  if (!reg) return null;
  return {
    status: reg.status,
    fee: reg.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0),
    paid: await paidAmount(year, id),
  };
}

export type TxOutcome = "skipped" | "duplicate" | "matched" | "unmatched" | "dry_run";

/** Zpracuje jeden pohyb; idempotentní díky unikátnímu fio_id. */
export async function processTransaction(
  tx: FioTransaction,
  year: number,
  options: { dryRun: boolean },
): Promise<TxOutcome> {
  // Snapshot jen pro přihlášku z VS; matchTransaction si ho vyžádá synchronně.
  const pre = matchTransaction(tx, year, () => ({ status: null, fee: 1, paid: 0 }));
  if (pre.kind === "skip") return "skipped";
  const regId = pre.registrationId;
  const reg = regId ? await snapshot(year, regId) : null;
  const decision = matchTransaction(tx, year, () => reg);
  if (decision.kind === "skip") return "skipped";

  let bankTxId: number;
  try {
    const row = await prisma.bankTx.create({
      data: {
        fioId: tx.fioId,
        date: new Date(`${tx.date}T00:00:00Z`),
        amount: new Prisma.Decimal(tx.amount),
        currency: tx.currency.slice(0, 3),
        vs: tx.vs?.slice(0, 20) ?? null,
        counterAccount: tx.counterAccount?.slice(0, 64) ?? null,
        counterName: tx.counterName?.slice(0, 255) ?? null,
        message: tx.message?.slice(0, 255) ?? null,
        raw: tx.raw as Prisma.InputJsonValue,
        year,
        registrationId: decision.registrationId,
      },
      select: { id: true },
    });
    bankTxId = row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return "duplicate";
    throw error;
  }

  if (options.dryRun) {
    await prisma.bankTx.update({
      where: { id: bankTxId },
      data: {
        status: "dry_run",
        reason: decision.kind === "unmatched" ? decision.reason : "would_match",
        overpaid: decision.kind === "matched" ? decision.overpaid : 0,
      },
    });
    return "dry_run";
  }

  if (decision.kind === "unmatched") {
    await prisma.bankTx.update({
      where: { id: bankTxId },
      data: { status: "unmatched", reason: decision.reason },
    });
    return "unmatched";
  }

  const payment = await prisma.payment.create({
    data: {
      year,
      registrationId: toPaymentRegistrationId(decision.registrationId),
      date: new Date(`${tx.date}T00:00:00Z`),
      amount: decision.amount,
      author: "fio",
    },
    select: { id: true },
  });
  await prisma.bankTx.update({
    where: { id: bankTxId },
    data: {
      status: "matched",
      paymentId: payment.id,
      overpaid: decision.overpaid,
      reason: decision.alreadyConfirmed
        ? "already_confirmed"
        : !autoConfirmAllowed(tx.date, year)
          ? "late"
          : decision.remaining > 0
            ? "partial"
            : null,
    },
  });
  await recalculateRegistrationStatus(year, decision.registrationId);
  // Auto-potvrzení, jakmile součet plateb pokryje startovné (stav 3/4); jinak zůstává 2.
  if (!decision.alreadyConfirmed && autoConfirmAllowed(tx.date, year)) {
    const result = await confirmRegistrationCore(year, decision.registrationId, { site: origin() });
    if (result !== "not_confirmable") {
      await prisma.bankTx.update({
        where: { id: bankTxId },
        data: {
          autoConfirmed: true,
          note:
            result === "confirmed_mail_failed" ? "potvrzovací e-mail se nepodařilo odeslat" : null,
        },
      });
    }
  }
  return "matched";
}

/** Denní souhrn (nespárované + přeplatky) na ALERT_TO, jen když je co hlásit. */
export async function maybeSendDailySummary(now = new Date()): Promise<boolean> {
  const { day } = pragueClock(now);
  if ((await getState(STATE.summaryDay)) === day) return false;
  const rows = await prisma.bankTx.findMany({
    where: {
      summarizedAt: null,
      OR: [
        { status: "unmatched" },
        { status: "matched", overpaid: { gt: 0 } },
        { status: "matched", reason: "late" },
      ],
    },
    orderBy: { id: "asc" },
  });
  if (!summaryDue(now, rows.length)) return false;
  const openUnmatched = await prisma.bankTx.count({ where: { status: "unmatched" } });
  const mail = renderDailySummary({
    rows: rows.map((r) => ({
      date: isoDate(r.date),
      amount: Number(r.amount),
      vs: r.vs,
      counterName: r.counterName,
      reason: r.reason,
      registrationId: r.registrationId,
      overpaid: r.overpaid,
      status: r.status === "matched" ? "matched" : "unmatched",
    })),
    openUnmatched,
    adminUrl: `${origin()}/cs/admin/platby`,
  });
  await sendMail({
    ...mail,
    kind: "summary",
    to: env.ALERT_TO,
    dedupeKey: `summary:payments:${day}`,
  });
  await prisma.bankTx.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { summarizedAt: now },
  });
  await setState(STATE.summaryDay, day);
  return true;
}

export type PaymentsJobResult =
  | { status: "skipped"; reason: "not_configured" | "locked" | "rate_limit" }
  | {
      status: "ok" | "failed";
      mode: FioRequest["mode"];
      dryRun: boolean;
      fetched: number;
      matched: number;
      unmatched: number;
      error?: string;
      summarySent?: boolean;
    };

export async function runPaymentsJob(
  options: {
    now?: Date;
    fetchImpl?: typeof fetch;
    request?: FioRequest;
    sleep?: (ms: number) => Promise<void>;
    selfHealWaitBudgetMs?: number;
  } = {},
): Promise<PaymentsJobResult> {
  const now = options.now ?? new Date();
  const token = env.FIO_API_TOKEN;
  if (!token) return { status: "skipped", reason: "not_configured" };
  if (!(await acquireLock(now))) return { status: "skipped", reason: "locked" };
  const dryRun = paymentsDryRun();
  let run: { id: number } | null = null;
  try {
    const lastRequest = await getState(STATE.lastRequestAt);
    if (lastRequest && now.getTime() - Date.parse(lastRequest) < FIO_MIN_INTERVAL_MS) {
      return { status: "skipped", reason: "rate_limit" };
    }
    let request: FioRequest =
      options.request ??
      chooseRequest({
        mode: fioMode(),
        now,
        lastRunOk: (await getState(STATE.lastRunOk)) === "1",
        lastPeriodsDay: await getState(STATE.lastPeriodsDay),
      });
    run = await prisma.jobRun.create({
      data: { job: JOB, mode: request.mode },
      select: { id: true },
    });
    // Před stažením přes /last/ označit běh jako nedokončený → při pádu příště `periods`.
    await setState(STATE.lastRunOk, "0");
    await setState(STATE.lastRequestAt, now.toISOString());
    let result = await fetchFio(token, request, options.fetchImpl);
    if (!result.ok && result.kind === "strong_auth") {
      console.warn("[payments] Fio 422 (silná autorizace) – nastavuji set-last-date", result.error);
      const heal = await healStrongAuth({
        token,
        now,
        fetchImpl: options.fetchImpl,
        sleep: options.sleep,
        waitBudgetMs: options.selfHealWaitBudgetMs,
        onRequest: (at) => setState(STATE.lastRequestAt, at.toISOString()),
      });
      if (heal.status === "failed") {
        result = { ok: false, kind: "error", error: `${result.error}; ${heal.error}` };
      } else if (heal.status === "cursor_set") {
        console.warn(`[payments] Fio zarážka nastavena na ${heal.date}, dožene příští běh`);
        await prisma.jobRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            ok: false,
            error: `strong_auth: zarážka nastavena na ${heal.date}`,
          },
        });
        // Bez alertu; lastRunOk zůstává 0 → příští běh `periods`.
        return {
          status: "failed",
          mode: request.mode,
          dryRun,
          fetched: 0,
          matched: 0,
          unmatched: 0,
          error: `strong_auth: zarážka nastavena na ${heal.date}`,
        };
      } else {
        console.warn("[payments] Fio samooprava: zarážka nastavena, stahuji periods");
        request = heal.request;
        result = heal.result;
      }
    }
    if (!result.ok) {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: false, error: result.error.slice(0, 500) },
      });
      if (result.kind === "auth")
        await alertPayments("token", `Fio API odmítlo token: ${result.error}`, now);
      else if (result.kind === "error" || result.kind === "strong_auth")
        await alertPayments("fio", `Chyba Fio API: ${result.error}`, now);
      // 409 (limit) jen zaznamenat – další běh to dožene.
      return {
        status: "failed",
        mode: request.mode,
        dryRun,
        fetched: 0,
        matched: 0,
        unmatched: 0,
        error: result.error,
      };
    }
    const { year } = await currentRaceYear();
    let matched = 0;
    let unmatched = 0;
    for (const tx of result.transactions) {
      const outcome = await processTransaction(tx, year, { dryRun });
      if (outcome === "matched") matched += 1;
      if (outcome === "unmatched") unmatched += 1;
    }
    // Pohyby zaseknuté ve stavu processing (pád uprostřed) → ruční kontrola.
    await prisma.bankTx.updateMany({
      where: {
        status: "processing",
        createdAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) },
      },
      data: { status: "unmatched", reason: "interrupted" },
    });
    if (result.lastId !== null) await setState(STATE.lastId, result.lastId.toString());
    if (request.mode === "periods") await setState(STATE.lastPeriodsDay, isoDate(now));
    await setState(STATE.lastRunOk, "1");
    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: true,
        fetched: result.transactions.length,
        matched,
        unmatched,
      },
    });
    const summarySent = dryRun ? false : await maybeSendDailySummary(now);
    return {
      status: "ok",
      mode: request.mode,
      dryRun,
      fetched: result.transactions.length,
      matched,
      unmatched,
      summarySent,
    };
  } catch (error) {
    const message = redact(String(error).slice(0, 400), token);
    console.error("[payments] job failed", message);
    if (run) {
      await prisma.jobRun
        .update({
          where: { id: run.id },
          data: { finishedAt: new Date(), ok: false, error: message },
        })
        .catch(() => undefined);
    }
    await alertPayments("job", `Job párování plateb selhal: ${message}`, now).catch(
      () => undefined,
    );
    throw new Error("payments job failed");
  } finally {
    await releaseLock().catch(() => undefined);
  }
}
