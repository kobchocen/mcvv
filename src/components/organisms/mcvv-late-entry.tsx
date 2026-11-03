import type { ReactNode } from "react";
import type { getTranslations } from "next-intl/server";

import { AlertTriangle, CheckCircle2, Clock, XCircle, Zap } from "lucide-react";

import { Link, type Locale } from "@/i18n/routing";
import { McvvLateCountdown } from "@/components/organisms/mcvv-late-countdown";
import { McvvLateSubmitForm } from "@/components/organisms/mcvv-late-submit-form";
import { Button } from "@/components/ui/button";
import { registrationFee, sumPayments } from "@/lib/entries/fee-total";
import { BANK_ACCOUNT, BANK_IBAN, spdQrSvg, variableSymbol } from "@/lib/entries/spd";
import { slotOf, type Slot } from "@/lib/slots/core";
import { LATE_PAY_MINUTES } from "@/lib/slots/late-core";
import {
  clockLabel,
  dateTimeLabel,
  dayLabel,
  samePragueDay,
  termEndLabel,
} from "@/lib/slots/term-end";

/** Překladač jmenného prostoru Entries (s `rich`). */
type Copy = Awaited<ReturnType<typeof getTranslations>>;

const b = (chunks: ReactNode) => (
  <b className="font-semibold text-foreground dark:text-white">{chunks}</b>
);

type Line = {
  runnerId: string;
  entryFee: number | null;
  runner: { name: string };
  category: { name: string; entryFee: number | null };
};

/** „dnes 14:32“, jinak „v sobotu 5. 12. v 0:15“. */
function untilLabel(d: Date, now: Date, locale: Locale, copy: Copy): string {
  return samePragueDay(d, now)
    ? copy("todayAt", { time: clockLabel(d) })
    : dateTimeLabel(d, locale);
}

/** Výrazné varování pozdních přihlášek (mockup dohlaska a/b). */
export function McvvLateAlert({
  slots,
  locale,
  copy,
}: {
  slots: readonly Slot[];
  locale: Locale;
  copy: Copy;
}) {
  const late = slotOf(slots, "late");
  if (!late) return null;
  const end = termEndLabel(late, locale, true);
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-[12px] border border-amber-600/60 bg-amber-500/10 p-4 text-sm leading-6"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="grid gap-2">
        <p className="font-display text-base font-semibold text-foreground dark:text-white">
          {copy("lateAlertTitle")}
        </p>
        <p>
          {copy.rich("lateAlertBody", {
            adult: late.feeAdult,
            youth: late.feeYouth,
            minutes: LATE_PAY_MINUTES,
            b,
          })}
        </p>
        {end ? <p className="text-race-muted">{copy("lateAlertEnd", { end })}</p> : null}
      </div>
    </div>
  );
}

/** Celkem k úhradě + souhlas „Zaplatím ihned“ + odeslání (rozpracovaná pozdní přihláška). */
export function McvvLateTotal({
  year,
  id,
  lines,
  copy,
}: {
  year: number;
  id: number;
  lines: Line[];
  copy: Copy;
}) {
  const total = registrationFee(lines);
  const fees = lines.map((line) => line.entryFee ?? line.category.entryFee ?? 0).join(" + ");
  return (
    <section className="rounded-[12px] border border-race-line/60 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{copy("lateTotalTitle")}</h2>
        <span className="font-display text-3xl font-bold">{total} Kč</span>
      </div>
      {lines.length > 0 ? (
        <p className="mt-1 text-xs text-race-muted">
          {copy("lateTotalRunners", { count: lines.length, fees })}
        </p>
      ) : null}
      <McvvLateSubmitForm
        year={year}
        registrationId={id}
        copy={{
          payNow: copy.rich("latePayNow", { minutes: LATE_PAY_MINUTES, b }),
          submit: copy("lateSubmit", { total }),
          hint: copy("lateSubmitHint", { minutes: LATE_PAY_MINUTES }),
          confirm: copy("lateSubmitConfirm"),
          empty: copy("lateSubmitEmpty"),
          invalid: copy("lateSubmitInvalid"),
        }}
      />
    </section>
  );
}

export type AwaitingLateEntry = {
  year: number;
  id: number;
  submittedAt: Date;
  payUntil: Date;
  lines: Line[];
  payments: { amount: number | null }[];
};

/** Platební obrazovka odeslané pozdní přihlášky (mockup dohlaska c). */
export async function McvvLatePayment({
  entry,
  locale,
  copy,
}: {
  entry: AwaitingLateEntry;
  locale: Locale;
  copy: Copy;
}) {
  const now = new Date();
  const fee = registrationFee(entry.lines);
  const due = Math.max(0, fee - sumPayments(entry.payments));
  const qr = due > 0 ? await spdQrSvg(entry.year, entry.id, due) : null;
  const vs = variableSymbol(entry.year, entry.id);
  const expired = now.getTime() >= entry.payUntil.getTime();
  const qrHref = qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}` : null;
  return (
    <div id={`p${entry.id}`} className="grid scroll-mt-28 gap-8">
      <h2 className="font-display text-2xl font-semibold sm:text-3xl">
        {copy("latePayTitle", { id: entry.id })}
      </h2>
      <section className="grid gap-6">
        <div className="grid gap-4 rounded-[12px] border border-amber-600/60 bg-amber-500/10 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
          <McvvLateCountdown
            submittedAt={entry.submittedAt.toISOString()}
            payUntil={entry.payUntil.toISOString()}
            label={copy("latePayLeft")}
          />
          <p className="text-sm leading-6">
            {expired
              ? copy("latePayExpired")
              : copy.rich("latePayUntil", {
                  until: untilLabel(entry.payUntil, now, locale, copy),
                  b,
                })}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          {qr ? (
            <div className="grid content-start gap-2">
              <div
                className="aspect-square w-56 bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className="text-xs text-race-muted">{copy("latePayScan")}</p>
              {qrHref ? (
                <a
                  href={qrHref}
                  download={`qr-${vs}.svg`}
                  className="text-sm font-medium text-race-accent hover:underline sm:hidden"
                >
                  {copy("latePaySaveQr")}
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="grid content-start gap-4">
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-race-dim">{copy("due")}</dt>
                <dd className="font-display text-2xl font-bold">{due} Kč</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-race-dim">{copy("vs")}</dt>
                <dd className="font-medium">{vs}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-race-dim">{copy("account")}</dt>
                <dd>{BANK_ACCOUNT} (Fio)</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-race-dim">IBAN</dt>
                <dd className="break-all">{BANK_IBAN}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-race-dim">
                  {copy("latePayMessage")}
                </dt>
                <dd className="break-all">{copy("latePayMessageValue", { id: entry.id })}</dd>
              </div>
            </dl>
            <p className="flex gap-2 rounded-md border border-race-line/60 p-3 text-sm leading-6">
              <Zap className="mt-1 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>{copy.rich("latePayInstant", { b })}</span>
            </p>
          </div>
        </div>
      </section>
      <section>
        <h3 className="font-display text-xl font-semibold">{copy("latePayStatusTitle")}</h3>
        <div className="mt-3 grid gap-3 rounded-[12px] border border-race-line/60 p-4">
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-600/40 bg-amber-600/10 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <Clock className="size-3.5" aria-hidden="true" />
            {copy("latePayWaiting")}
          </span>
          <ol className="grid gap-1.5 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
              {copy("latePayStepSent", { time: clockLabel(entry.submittedAt) })}
            </li>
            <li className="flex items-center gap-2 font-medium">
              <Clock className="size-4 text-amber-600" aria-hidden="true" />
              {copy("latePayStepWaiting")}
            </li>
            <li className="flex items-center gap-2 text-race-muted">
              <span className="inline-block size-4 rounded-full border border-race-line" />
              {copy("latePayStepDone")}
            </li>
          </ol>
          <p className="text-xs text-race-muted">{copy("latePayAutoRefresh")}</p>
        </div>
      </section>
      <section>
        <h3 className="font-display text-lg font-semibold">{copy("latePayRunners")}</h3>
        <p className="mt-2 text-sm text-race-muted">
          {entry.lines
            .map(
              (line) =>
                `${line.runner.name} (${line.category.name}, ${line.entryFee ?? line.category.entryFee ?? 0} Kč)`,
            )
            .join(" · ")}
        </p>
      </section>
    </div>
  );
}

/** Pozdní přihláška zrušená po lhůtě na zaplacení (mockup dohlaska e). */
export function McvvLateCancelled({
  entry,
  slots,
  locale,
  copy,
}: {
  entry: { year: number; id: number; payUntil: Date };
  slots: readonly Slot[];
  locale: Locale;
  copy: Copy;
}) {
  const now = new Date();
  const late = slotOf(slots, "late");
  const lateRunning =
    late?.active && late.from.getTime() <= now.getTime() && now.getTime() < late.to.getTime();
  const onsite = slotOf(slots, "onsite");
  return (
    <section
      id={`p${entry.id}`}
      className="grid scroll-mt-28 gap-3 rounded-[12px] border border-race-line p-4"
    >
      <h2 className="flex items-start gap-2 font-display text-lg font-semibold">
        <XCircle className="mt-1 size-5 shrink-0 text-destructive" aria-hidden="true" />
        {copy("lateCancelledTitle", { id: entry.id })}
      </h2>
      <p className="text-sm leading-6">
        {copy("lateCancelledBody", {
          when: untilLabel(entry.payUntil, now, locale, copy),
          vs: variableSymbol(entry.year, entry.id),
        })}
      </p>
      <ul className="grid list-disc gap-1.5 pl-5 text-sm leading-6">
        <li>{copy.rich("lateCancelledRefund", { b })}</li>
        {lateRunning && late ? (
          <li>
            {copy.rich("lateCancelledNew", {
              end: termEndLabel(late, locale, true) ?? "",
              minutes: LATE_PAY_MINUTES,
              b,
            })}
          </li>
        ) : null}
        {onsite && now.getTime() < onsite.to.getTime() ? (
          <li>
            {copy.rich("lateCancelledOnsite", {
              day: dayLabel(onsite.from, locale),
              from: clockLabel(onsite.from),
              to: clockLabel(onsite.to),
              adult: onsite.feeAdult,
              youth: onsite.feeYouth,
              b,
            })}
          </li>
        ) : null}
      </ul>
      <p className="text-sm">
        <Button asChild variant="outline" className="h-10 border-race-line bg-race-surface">
          <Link href="/kontakt">{copy("lateWriteMessage")}</Link>
        </Button>
      </p>
    </section>
  );
}
