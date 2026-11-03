import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { type Locale } from "@/i18n/routing";
import {
  assignBankTx,
  ignoreBankTx,
  markEntryRefunded,
  markRefunded,
  refundCancelledBankTx,
} from "@/lib/payments/actions";
import { latePaymentPending } from "@/lib/cron/cadence";
import { nextBankCheck } from "@/lib/cron/cadence-core";
import { fioMode, paymentsDryRun } from "@/lib/payments/job";
import { REASON_LABELS, type BankTxReason } from "@/lib/payments/match";
import { loadCancelledEntryRefunds } from "@/lib/payments/refunds";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export const metadata: Metadata = { title: "Platby" };
export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : "–";
const stateDate = (value: string | null | undefined) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const fmtWhen = (d: Date | null) =>
  d
    ? d.toLocaleString("cs-CZ", {
        timeZone: "Europe/Prague",
        weekday: "short",
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "–";
const fmtClock = (d: Date) =>
  d.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
const reasonLabel = (r: string | null) => (r ? (REASON_LABELS[r as BankTxReason] ?? r) : "");

const th = "py-2 pr-4";
const td = "py-2 pr-4 align-top";

export default async function AdminPaymentsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireStaff();
  const [unmatchedAll, overpaid, recent, lastRuns, dryRunRows, entryRefunds] = await Promise.all([
    prisma.bankTx.findMany({ where: { status: "unmatched" }, orderBy: { date: "desc" } }),
    prisma.bankTx.findMany({
      where: { status: "matched", overpaid: { gt: 0 }, refundedAt: null },
      orderBy: { date: "desc" },
    }),
    prisma.bankTx.findMany({
      where: { status: { in: ["matched", "ignored"] } },
      orderBy: { id: "desc" },
      take: 30,
    }),
    prisma.jobRun.findMany({ where: { job: "payments" }, orderBy: { id: "desc" }, take: 5 }),
    prisma.bankTx.count({ where: { status: "dry_run" } }),
    loadCancelledEntryRefunds(),
  ]);
  // Poslední / další kontrola banky (část 8): dotaz na Fio a adaptivní interval cronu (část 6).
  const now = new Date();
  const [stateRows, latePending] = await Promise.all([
    prisma.jobState.findMany({
      where: { name: { in: ["fio_last_request_at", "cron_slow_payments"] } },
    }),
    latePaymentPending(now),
  ]);
  const state = new Map(stateRows.map((row) => [row.name, row.value]));
  const lastRequest = stateDate(state.get("fio_last_request_at"));
  const next = nextBankCheck(now, stateDate(state.get("cron_slow_payments")), latePending);
  // Platby na zrušené přihlášky mají vlastní sekci (k vrácení); zrušenou přihlášku nelze obnovit.
  const cancelledTx = unmatchedAll.filter((tx) => tx.reason === "cancelled");
  const unmatched = unmatchedAll.filter((tx) => tx.reason !== "cancelled");
  const lastOk = lastRuns.find((r) => r.ok);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label="Administrace" />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          Platby (Fio)
        </h1>
        <p className="mt-3 text-sm text-race-muted">
          Režim: {paymentsDryRun() ? "dry-run (jen záznam, bez párování)" : "párování"}, dotaz{" "}
          {fioMode() === "last" ? "/last/ + denní kontrola /periods/" : "/periods/"}. Poslední
          úspěšný běh: {fmtTime(lastOk?.finishedAt)}.
          {lastRuns[0] && lastRuns[0].ok === false
            ? ` Poslední běh selhal: ${lastRuns[0].error ?? ""}`
            : ""}
          {dryRunRows ? ` Záznamů v dry-run: ${dryRunRows}.` : ""}
        </p>
        <p className="mt-2 text-sm" data-testid="bank-check">
          Poslední kontrola banky (dotaz na Fio): <strong>{fmtWhen(lastRequest)}</strong>. Další
          kontrola: <strong>kolem {fmtClock(next.at)}</strong>{" "}
          {next.fast
            ? "– pozdní přihláška čeká na platbu, banka se kontroluje každou minutu."
            : "– běžně každých 15 min; každou minutu, jen když pozdní přihláška čeká na platbu."}
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold">
          Nespárované ({unmatched.length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className={th}>Datum</th>
                <th className={th}>Částka</th>
                <th className={th}>VS</th>
                <th className={th}>Protistrana / zpráva</th>
                <th className={th}>Důvod</th>
                <th className={th}>Akce</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-race-muted">
                    Žádné nespárované platby.
                  </td>
                </tr>
              ) : (
                unmatched.map((tx) => (
                  <tr key={tx.id} className="border-b border-race-line/50">
                    <td className={td}>{fmtDate(tx.date)}</td>
                    <td className={td}>
                      {Number(tx.amount)} {tx.currency}
                    </td>
                    <td className={td}>{tx.vs ?? "–"}</td>
                    <td className={td}>
                      {tx.counterName ?? ""} {tx.counterAccount ? `(${tx.counterAccount})` : ""}
                      {tx.message ? <div className="text-race-muted">{tx.message}</div> : null}
                    </td>
                    <td className={td}>
                      {reasonLabel(tx.reason)}
                      {tx.registrationId ? ` (přihláška ${tx.registrationId})` : ""}
                    </td>
                    <td className={td}>
                      <form action={assignBankTx} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={tx.id} />
                        <input type="hidden" name="year" value={tx.year ?? ""} />
                        <input
                          name="registrationId"
                          inputMode="numeric"
                          placeholder="č. přihlášky"
                          defaultValue={tx.registrationId ?? ""}
                          className="h-8 w-24 rounded border border-race-line bg-transparent px-2"
                          aria-label="Číslo přihlášky"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Přiřadit
                        </Button>
                      </form>
                      <form
                        action={ignoreBankTx}
                        className="mt-2 flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="id" value={tx.id} />
                        <input
                          name="note"
                          placeholder="poznámka"
                          className="h-8 w-32 rounded border border-race-line bg-transparent px-2"
                          aria-label="Poznámka"
                        />
                        <Button type="submit" size="sm" variant="ghost">
                          Vyřízeno
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 font-display text-2xl font-semibold">
          Přeplatky k vrácení ({overpaid.length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className={th}>Datum</th>
                <th className={th}>Přihláška</th>
                <th className={th}>Zaplaceno</th>
                <th className={th}>Přeplatek</th>
                <th className={th}>Protiúčet</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {overpaid.map((tx) => (
                <tr key={tx.id} className="border-b border-race-line/50">
                  <td className={td}>{fmtDate(tx.date)}</td>
                  <td className={td}>
                    {tx.year}/{tx.registrationId}
                  </td>
                  <td className={td}>{Number(tx.amount)} Kč</td>
                  <td className={td}>{tx.overpaid} Kč</td>
                  <td className={td}>
                    {tx.counterName ?? ""} {tx.counterAccount ?? ""}
                  </td>
                  <td className={td}>
                    <form action={markRefunded}>
                      <input type="hidden" name="id" value={tx.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Vráceno
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 font-display text-2xl font-semibold">
          Platby na zrušené přihlášky – k vrácení ({cancelledTx.length + entryRefunds.length})
        </h2>
        <p className="mt-2 text-sm text-race-muted">
          Zrušená přihláška se neobnovuje. Peníze vraťte na protiúčet a označte „Vráceno“. Pokud
          plátce jen zadal špatný VS, přiřaďte platbu ke správné přihlášce.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className={th}>Datum</th>
                <th className={th}>Přihláška</th>
                <th className={th}>Částka</th>
                <th className={th}>Protistrana / e-mail</th>
                <th className={th}>Akce</th>
              </tr>
            </thead>
            <tbody>
              {cancelledTx.length + entryRefunds.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-race-muted">
                    Nic k vrácení.
                  </td>
                </tr>
              ) : null}
              {cancelledTx.map((tx) => (
                <tr key={`tx-${tx.id}`} className="border-b border-race-line/50">
                  <td className={td}>{fmtDate(tx.date)}</td>
                  <td className={td}>
                    {tx.year}/{tx.registrationId ?? "–"} (platba po zrušení)
                  </td>
                  <td className={td}>
                    {Number(tx.amount)} {tx.currency}
                  </td>
                  <td className={td}>
                    {tx.counterName ?? ""} {tx.counterAccount ? `(${tx.counterAccount})` : ""}
                    {tx.message ? <div className="text-race-muted">{tx.message}</div> : null}
                  </td>
                  <td className={td}>
                    <form action={refundCancelledBankTx}>
                      <input type="hidden" name="id" value={tx.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Vráceno
                      </Button>
                    </form>
                    <form action={assignBankTx} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={tx.id} />
                      <input type="hidden" name="year" value={tx.year ?? ""} />
                      <input
                        name="registrationId"
                        inputMode="numeric"
                        placeholder="jiná přihláška"
                        className="h-8 w-28 rounded border border-race-line bg-transparent px-2"
                        aria-label="Číslo jiné přihlášky"
                      />
                      <Button type="submit" size="sm" variant="ghost">
                        Přiřadit
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
              {entryRefunds.map((r) => (
                <tr
                  key={`reg-${r.year}-${r.registrationId}`}
                  className="border-b border-race-line/50"
                >
                  <td className={td}>{fmtTime(r.autoCancelledAt)}</td>
                  <td className={td}>
                    {r.year}/{r.registrationId} (zaplaceno jen částečně, zrušeno automaticky)
                  </td>
                  <td className={td}>{r.paid} Kč</td>
                  <td className={td}>{r.email ?? "–"}</td>
                  <td className={td}>
                    <form action={markEntryRefunded}>
                      <input type="hidden" name="year" value={r.year} />
                      <input type="hidden" name="registrationId" value={r.registrationId} />
                      <input type="hidden" name="amount" value={r.paid} />
                      <Button type="submit" size="sm" variant="outline">
                        Vráceno
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 font-display text-2xl font-semibold">Poslední spárované</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className={th}>Datum</th>
                <th className={th}>Částka</th>
                <th className={th}>VS</th>
                <th className={th}>Stav</th>
                <th className={th}>Poznámka</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((tx) => (
                <tr key={tx.id} className="border-b border-race-line/50">
                  <td className={td}>{fmtDate(tx.date)}</td>
                  <td className={td}>{Number(tx.amount)} Kč</td>
                  <td className={td}>{tx.vs ?? "–"}</td>
                  <td className={td}>
                    {tx.status === "ignored"
                      ? "vyřízeno bez platby"
                      : tx.autoConfirmed
                        ? "spárováno, potvrzeno"
                        : tx.reason
                          ? `spárováno – ${reasonLabel(tx.reason)}`
                          : "spárováno"}
                    {tx.resolvedBy ? ` (${tx.resolvedBy})` : ""}
                  </td>
                  <td className={td}>{tx.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
