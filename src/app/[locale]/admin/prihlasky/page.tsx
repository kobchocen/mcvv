import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Check, MailX, Zap } from "lucide-react";

import { paymentRegistrationId } from "@/lib/admin/parse";
import {
  entryStatusTone,
  formatListAmount,
  paymentDiffTone,
  type EntryStatusTone,
} from "@/lib/admin/registration-list";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { AutoSubmitSelect } from "@/components/molecules/auto-submit-select";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import { confirmRegistration } from "@/lib/admin/registrations";
import { ENTRY_STATUS } from "@/lib/entries/status";
import { freeAutoConfirmedIds, showFreeAutoBadge } from "@/lib/entries/auto-confirm";
import { isPromotionOptOut } from "@/lib/entries/promotion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { McvvMessageBubble } from "@/components/organisms/mcvv-message-thread";
import { registrationThreadSummaries, summaryKey } from "@/lib/messages/store";
import { requireSection } from "@/lib/admin/access";
import { loadRegistrationTimeline } from "@/lib/admin/registration-timeline-data";
import { McvvAdminRegistrationTimeline } from "@/components/organisms/mcvv-admin-registration-timeline";
import { McvvAdminSpecialStartBadge } from "@/components/organisms/mcvv-admin-special-start-badge";
import type { SpecialStartKind } from "@/lib/race/special-start";
import { McvvAdminLateTimer } from "@/components/organisms/mcvv-admin-late-timer";
import { SLOT_TYPES, type SlotType } from "@/lib/slots/core";
import { entrySlot, lateAdminState, parseSlotFilter } from "@/lib/slots/admin-overview";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    rok?: string;
    stav?: string;
    zrusene?: string;
    prazdne?: string;
    spec?: string;
    termin?: string;
  }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("regsTitle") };
}

const statusBadge: Record<EntryStatusTone, string> = {
  cancelled: "border-race-line text-race-dim",
  empty: "border-race-line text-race-muted",
  unpaid: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300",
  paid: "border-race-accent/50 bg-race-accent/10 text-race-accent",
  overpaid: "border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  confirmed: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
  unknown: "border-race-line text-race-muted",
};

const pragueShort = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "cs-CZ", {
    timeZone: "Europe/Prague",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

const lateBadge: Record<string, string> = {
  draft: "border-race-line text-race-muted",
  awaiting: "border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  overdue: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300",
  paid: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
  autoCancelled: "border-race-line text-race-dim",
  cancelled: "border-race-line text-race-dim",
};

function statusKey(
  status: number | null | undefined,
): "status0" | "status1" | "status2" | "status3" | "status4" | "status5" | "statusUnknown" {
  if (status === 0) return "status0";
  if (status === 1) return "status1";
  if (status === 2) return "status2";
  if (status === 3) return "status3";
  if (status === 4) return "status4";
  if (status === 5) return "status5";
  return "statusUnknown";
}

export default async function AdminRegistrationsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("entries.list", "read");
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const specialT = await getTranslations({ locale, namespace: "SpecialStart" });
  const { rok, stav, zrusene, prazdne, spec, termin } = await searchParams;
  const slotFilter = parseSlotFilter(termin);

  const [latest, yearRows] = await Promise.all([
    prisma.edition.findFirst({ orderBy: { id: "desc" }, select: { date: true, id: true } }),
    prisma.registration.findMany({ select: { year: true }, distinct: ["year"] }),
  ]);
  const defaultYear = latest?.date.getUTCFullYear() ?? latest?.id ?? 2026;
  const years = [...new Set([...yearRows.map((row) => row.year), defaultYear, 2025])].sort(
    (a, b) => b - a,
  );
  const selectedYear = Number.parseInt(rok ?? "", 10) || defaultYear;
  const statusFilter = Number.parseInt(stav ?? "", 10);
  const includeCancelled = zrusene === "1" || statusFilter === 0;
  const statusWhere = Number.isFinite(statusFilter)
    ? { status: statusFilter }
    : includeCancelled
      ? {}
      : { OR: [{ status: { not: 0 } }, { status: null }] };
  // Prázdné přihlášky (bez běžců) jsou ve výchozím stavu skryté – filtr „s běžci“.
  // Při výběru stavu 1 („prázdná“) se zobrazí vždy; přihláška pořadatelů č. 1 také.
  const includeEmpty = prazdne === "1" || statusFilter === ENTRY_STATUS.empty;
  const emptyWhere = includeEmpty ? {} : { OR: [{ lines: { some: {} } }, { id: 1 }] };
  // Spec. starty ročníku podle přihlášky (seznam ukazuje jen odznak, detail je v dialogu).
  const specialRows = await prisma.specialStart.findMany({
    where: { year: selectedYear },
    select: { runnerId: true, kind: true },
  });
  const specialLines = await prisma.registrationLine.findMany({
    where: { year: selectedYear, runnerId: { in: specialRows.map((row) => row.runnerId) } },
    select: { runnerId: true, registrationId: true },
  });
  const registrationOfRunner = new Map(
    specialLines.map((line) => [line.runnerId, line.registrationId]),
  );
  const specialByRegistration = new Map<number, SpecialStartKind[]>();
  for (const row of specialRows) {
    const registrationId = registrationOfRunner.get(row.runnerId);
    if (registrationId == null) {
      continue;
    }
    specialByRegistration.set(registrationId, [
      ...(specialByRegistration.get(registrationId) ?? []),
      row.kind,
    ]);
  }
  const onlySpecial = spec === "1";
  const specialWhere = onlySpecial ? { id: { in: [...specialByRegistration.keys()] } } : {};
  const hiddenEmpty = includeEmpty
    ? 0
    : await prisma.registration.count({
        where: { year: selectedYear, ...statusWhere, lines: { none: {} }, id: { not: 1 } },
      });

  const [allRegistrations, payments, autoConfirmed, timeline, metaRows] = await Promise.all([
    prisma.registration.findMany({
      where: { year: selectedYear, AND: [statusWhere, emptyWhere, specialWhere] },
      include: { lines: { select: { entryFee: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.payment.findMany({
      where: { year: selectedYear },
      select: { registrationId: true, amount: true },
    }),
    freeAutoConfirmedIds(selectedYear),
    loadRegistrationTimeline(selectedYear),
    // Termín a lhůta pozdní přihlášky (část 8); bez záznamu = standardní přihláška.
    prisma.registrationMeta.findMany({
      where: { year: selectedYear },
      select: { id: true, slot: true, submittedAt: true, payUntil: true, autoCancelledAt: true },
    }),
  ]);
  const metaById = new Map(metaRows.map((row) => [row.id, row]));
  const slotOfRow = (id: number): SlotType => entrySlot(metaById.get(id)?.slot);
  const registrations = slotFilter
    ? allRegistrations.filter((row) => slotOfRow(row.id) === slotFilter)
    : allRegistrations;
  const now = new Date();
  const lateAwaiting = allRegistrations.filter((row) => {
    const meta = metaById.get(row.id);
    return (
      meta?.slot === "late" &&
      lateAdminState({ status: row.status, ...meta }, now).kind === "awaiting"
    );
  }).length;

  const threadSummaries = await registrationThreadSummaries(
    registrations.map((row) => ({ year: row.year, id: row.id })),
    "staff",
  );

  const paidById = new Map<number, number>();
  for (const payment of payments) {
    const id = paymentRegistrationId(payment.registrationId);
    if (!Number.isFinite(id)) {
      continue;
    }
    paidById.set(id, (paidById.get(id) ?? 0) + (payment.amount ?? 0));
  }

  const totals = registrations.reduce(
    (sum, row) => ({
      runners: sum.runners + row.lines.length,
      fee: sum.fee + row.lines.reduce((acc, line) => acc + (line.entryFee ?? 0), 0),
      paid: sum.paid + (paidById.get(row.id) ?? 0),
    }),
    { runners: 0, fee: 0, paid: 0 },
  );
  const money = (value: number, signed = false) => formatListAmount(value, locale, { signed });
  const selectClass =
    "h-9 rounded-md border border-race-line bg-race-surface px-2 text-sm text-foreground focus-visible:border-race-accent focus-visible:outline-none";
  const detailHref = (row: { year: number; id: number }) => ({
    pathname: "/admin/prihlasky/[rok]/[id]" as const,
    params: { rok: String(row.year), id: String(row.id) },
  });

  return (
    <main className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("regsTitle")} {selectedYear}
        </h1>
        <form
          className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-3 rounded-lg border border-race-line/60 bg-race-surface/60 p-3"
          method="get"
          data-testid="regs-filters"
        >
          {years.length > 1 ? (
            <label className="grid gap-1 text-xs font-medium text-race-muted">
              {copy("regsYear")}
              <AutoSubmitSelect
                name="rok"
                defaultValue={String(selectedYear)}
                className={cn(selectClass, "tabular-nums")}
                data-testid="regs-year"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </AutoSubmitSelect>
            </label>
          ) : (
            <input type="hidden" name="rok" value={selectedYear} />
          )}
          <label className="grid gap-1 text-xs font-medium text-race-muted">
            {copy("regsStatus")}
            <select
              name="stav"
              defaultValue={Number.isFinite(statusFilter) ? String(statusFilter) : ""}
              className={selectClass}
            >
              <option value="">{copy("statusAll")}</option>
              <option value="1">{copy("status1")}</option>
              <option value="2">{copy("status2")}</option>
              <option value="3">{copy("status3")}</option>
              <option value="4">{copy("status4")}</option>
              <option value="5">{copy("status5")}</option>
              <option value="0">{copy("status0")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-race-muted">
            {copy("regsTerm")}
            <select
              name="termin"
              defaultValue={slotFilter ?? ""}
              className={selectClass}
              data-testid="regs-slot-filter"
            >
              <option value="">{copy("regsTermAll")}</option>
              {SLOT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {copy(`regsTerm_${type}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="zrusene"
                value="1"
                defaultChecked={includeCancelled}
                className="size-4 accent-race-accent"
              />
              {copy("includeCancelled")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="prazdne"
                value="1"
                defaultChecked={includeEmpty}
                className="size-4 accent-race-accent"
              />
              {copy("includeEmpty")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="spec"
                value="1"
                defaultChecked={onlySpecial}
                className="size-4 accent-race-accent"
              />
              {specialT("regsFilter")}
            </label>
          </fieldset>
          <Button
            type="submit"
            variant="outline"
            className="h-9 border-race-line bg-race-surface sm:ml-auto"
          >
            {copy("filter")}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <Link
            href={{
              pathname: "/admin/prihlasky/spec-starty",
              query: { rok: String(selectedYear) },
            }}
            className="font-medium text-race-accent hover:underline"
            data-testid="spec-start-overview-link"
          >
            {specialT("overviewLink", { count: specialRows.length })}
          </Link>
          {lateAwaiting > 0 ? (
            <span
              className="font-medium text-amber-800 dark:text-amber-300"
              data-testid="late-awaiting"
            >
              {copy("lateAwaitingSummary", { count: lateAwaiting })}{" "}
              <Link
                href={{
                  pathname: "/admin/prihlasky",
                  query: { rok: String(selectedYear), termin: "late" },
                }}
                className="text-race-accent hover:underline"
              >
                {copy("lateAwaitingShow")}
              </Link>
            </span>
          ) : null}
          {hiddenEmpty > 0 ? (
            <span className="text-race-muted">
              {copy("hiddenEmpty", { count: hiddenEmpty })}{" "}
              <Link
                href={{
                  pathname: "/admin/prihlasky",
                  query: {
                    rok: String(selectedYear),
                    prazdne: "1",
                    ...(Number.isFinite(statusFilter) ? { stav: String(statusFilter) } : {}),
                    ...(zrusene === "1" ? { zrusene: "1" } : {}),
                    ...(slotFilter ? { termin: slotFilter } : {}),
                  },
                }}
                className="font-medium text-race-accent hover:underline"
              >
                {copy("showEmpty")}
              </Link>
            </span>
          ) : null}
        </div>
        <McvvAdminRegistrationTimeline data={timeline} />
        {registrations.length === 0 ? (
          <p className="mt-8 text-sm text-race-muted">{copy("regsEmpty")}</p>
        ) : (
          <div className="@container mt-8">
            <p className="mb-2 text-sm text-race-muted tabular-nums" data-testid="regs-summary">
              {copy("regsSummary", {
                count: registrations.length,
                runners: totals.runners,
                fee: money(totals.fee),
                paid: money(totals.paid),
              })}
            </p>
            <table className="block w-full border-collapse text-left text-sm @2xl:table @2xl:table-fixed">
              <colgroup className="hidden @2xl:table-column-group">
                <col />
                <col className="w-[6.25rem]" />
                <col className="w-[3.5rem]" />
                <col className="w-[5.75rem]" />
                <col className="w-[6.25rem]" />
                <col className="w-[7.25rem]" />
              </colgroup>
              <thead className="hidden @2xl:table-header-group">
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th scope="col" className="py-2 pr-3">
                    {copy("regsEntry")}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {copy("regsCreated")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {copy("regsRunners")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {copy("regsFee")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {copy("regsPaid")}
                  </th>
                  <th scope="col" className="py-2 pl-4">
                    {copy("regsStatus")}
                  </th>
                </tr>
              </thead>
              <tbody className="grid gap-2 @2xl:table-row-group">
                {registrations.map((row) => {
                  const fee = row.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
                  const paid = paidById.get(row.id) ?? 0;
                  const diff = paid - fee;
                  const diffTone = paymentDiffTone(diff);
                  const summary = threadSummaries.get(summaryKey(row.year, row.id));
                  const specialKinds = specialByRegistration.get(row.id) ?? [];
                  const meta = metaById.get(row.id);
                  const slot = slotOfRow(row.id);
                  const late =
                    meta && slot === "late"
                      ? lateAdminState({ status: row.status, ...meta }, now)
                      : null;
                  const lateTitle =
                    late?.kind === "draft"
                      ? copy("lateState_draftTitle")
                      : late?.kind === "awaiting" && meta?.payUntil
                        ? copy("lateState_awaitingTitle", {
                            at: pragueShort(meta.payUntil, locale),
                          })
                        : late?.kind === "overdue" && meta?.payUntil
                          ? copy("lateState_overdueTitle", {
                              at: pragueShort(meta.payUntil, locale),
                            })
                          : late?.kind === "autoCancelled" && meta?.autoCancelledAt
                            ? copy(
                                meta.submittedAt
                                  ? "lateState_autoCancelledTitle"
                                  : "lateState_draftCancelledTitle",
                                {
                                  at: pragueShort(meta.autoCancelledAt, locale),
                                },
                              )
                            : undefined;
                  const cancelled = row.status === ENTRY_STATUS.cancelled;
                  const canConfirm =
                    row.status === ENTRY_STATUS.paid || row.status === ENTRY_STATUS.overpaid;
                  const label = row.name?.trim() || row.email || `#${row.id}`;
                  return (
                    <tr
                      key={`${row.year}-${row.id}`}
                      className={cn(
                        "relative grid grid-cols-4 gap-x-3 gap-y-2 rounded-lg border border-race-line/60 bg-race-surface p-3",
                        "transition-colors hover:bg-race-accent/[0.06] focus-within:ring-2 focus-within:ring-race-accent/60",
                        "@2xl:table-row @2xl:rounded-none @2xl:border-0 @2xl:border-b @2xl:border-race-line/40 @2xl:bg-transparent @2xl:p-0",
                        cancelled && "text-race-dim",
                      )}
                      data-testid={`regs-row-${row.id}`}
                    >
                      <td className="col-span-3 row-start-1 min-w-0 @2xl:py-2.5 @2xl:pr-3">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Link
                            href={detailHref(row)}
                            className={cn(
                              "min-w-0 truncate font-semibold text-foreground outline-none",
                              "after:absolute after:inset-0 after:content-['']",
                              "hover:text-race-accent focus-visible:text-race-accent",
                              cancelled && "text-race-dim line-through decoration-race-dim/60",
                            )}
                            title={label}
                            data-testid="regs-row-link"
                          >
                            {label}
                          </Link>
                        </div>
                        <div
                          className="mt-0.5 flex min-w-0 items-center gap-1.5"
                          data-testid="regs-entry-meta"
                        >
                          <span className="shrink-0 text-xs text-race-dim tabular-nums">
                            #{row.id}
                          </span>
                          {row.email ? (
                            <span
                              className="min-w-0 flex-1 truncate text-xs text-race-muted"
                              title={row.email}
                            >
                              {row.email}
                            </span>
                          ) : null}
                          {summary ? (
                            <Link
                              href={detailHref(row)}
                              className="relative z-10 shrink-0"
                              title={
                                summary.open && summary.unread > 0
                                  ? `${copy("msgUnread")}: ${summary.unread}`
                                  : copy("msgCount", { count: summary.count })
                              }
                            >
                              <McvvMessageBubble
                                count={summary.count}
                                unread={summary.open ? summary.unread : 0}
                                label={
                                  summary.open && summary.unread > 0
                                    ? `${copy("msgUnread")}: ${summary.unread}`
                                    : copy("msgCount", { count: summary.count })
                                }
                              />
                            </Link>
                          ) : null}
                          {specialKinds.length > 0 ? (
                            <Link
                              href={detailHref(row)}
                              className="relative z-10 shrink-0"
                              title={[...new Set(specialKinds)]
                                .map((kind) => specialT(`kind_${kind}`))
                                .join(", ")}
                            >
                              <McvvAdminSpecialStartBadge
                                label={
                                  specialKinds.length === 1
                                    ? specialT(`kind_${specialKinds[0]}`)
                                    : specialT("regsCount", { count: specialKinds.length })
                                }
                              />
                            </Link>
                          ) : null}
                          {isPromotionOptOut(row.promotion) ? (
                            <span
                              className="relative z-10 shrink-0 text-race-dim"
                              title={copy("regsNoNewsletter")}
                            >
                              <MailX className="size-3.5" aria-hidden="true" />
                              <span className="sr-only">{copy("regsNoNewsletter")}</span>
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className="col-span-1 @2xl:py-2.5 @2xl:pr-3"
                        data-testid={`regs-slot-${row.id}`}
                      >
                        <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-race-dim @2xl:hidden">
                          {copy("regsCreated")}
                        </span>
                        <span
                          className="block whitespace-nowrap tabular-nums"
                          title={row.created ? formatDateTime(row.created, locale) : undefined}
                        >
                          {row.created ? formatDate(row.created, locale) : "—"}
                        </span>
                        <span
                          className={cn(
                            "block whitespace-nowrap text-xs",
                            slot === "standard" ? "text-race-dim" : "font-medium text-race-muted",
                          )}
                        >
                          {copy(`regsTerm_${slot}`)}
                        </span>
                        {late ? (
                          <span
                            title={lateTitle}
                            className={cn(
                              "mt-1 block w-fit whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                              lateBadge[late.kind],
                            )}
                          >
                            {late.kind === "awaiting" && meta?.payUntil ? (
                              <McvvAdminLateTimer
                                payUntil={meta.payUntil.toISOString()}
                                template={copy.raw("lateState_awaiting") as string}
                                overdueLabel={copy("lateState_overdue")}
                              />
                            ) : (
                              copy(`lateState_${late.kind}`)
                            )}
                          </span>
                        ) : null}
                      </td>
                      <td className="col-span-1 text-right tabular-nums @2xl:py-2.5 @2xl:pr-3">
                        <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-race-dim @2xl:hidden">
                          {copy("regsRunners")}
                        </span>
                        {row.lines.length}
                      </td>
                      <td className="col-span-1 text-right tabular-nums @2xl:py-2.5 @2xl:pr-3">
                        <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-race-dim @2xl:hidden">
                          {copy("regsFee")}
                        </span>
                        <span className="whitespace-nowrap">{money(fee)}</span>
                      </td>
                      <td className="col-span-1 text-right tabular-nums @2xl:py-2.5 @2xl:pr-3">
                        <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-race-dim @2xl:hidden">
                          {copy("regsPaid")}
                        </span>
                        <span className="block whitespace-nowrap">{money(paid)}</span>
                        {diffTone !== "even" ? (
                          <span
                            className={cn(
                              "block whitespace-nowrap text-xs font-semibold",
                              diffTone === "short"
                                ? "text-red-600 dark:text-red-400"
                                : "text-amber-700 dark:text-amber-400",
                            )}
                            title={copy("regsDiff")}
                          >
                            <span className="sr-only">{copy("regsDiff")} </span>
                            {money(diff, true)}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="col-start-4 row-start-1 justify-self-end text-right @2xl:py-2.5 @2xl:pl-4 @2xl:text-left"
                        data-testid={`regs-status-${row.id}`}
                      >
                        <div className="flex flex-col items-end gap-1.5 @2xl:items-start">
                          <span
                            className={cn(
                              "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
                              statusBadge[entryStatusTone(row.status)],
                            )}
                          >
                            {row.status === ENTRY_STATUS.confirmed ? (
                              <Check className="size-3" aria-hidden="true" />
                            ) : null}
                            {copy(statusKey(row.status))}
                          </span>
                          {showFreeAutoBadge({
                            status: row.status,
                            fee,
                            autoConfirmed: autoConfirmed.has(row.id),
                          }) ? (
                            <span
                              title={copy("freeAutoConfirmed")}
                              aria-label={copy("freeAutoConfirmed")}
                              data-testid="regs-free-auto-badge"
                              className="relative z-10 inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-[0.6875rem] font-medium text-emerald-700 dark:text-emerald-300"
                            >
                              <Zap className="size-3" aria-hidden="true" />
                              {copy("freeAutoConfirmedShort")}
                            </span>
                          ) : null}
                          {canConfirm ? (
                            <form action={confirmRegistration} className="relative z-10">
                              <input type="hidden" name="year" value={row.year} />
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="from" value="list" />
                              <button
                                type="submit"
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-race-accent/50 px-2 text-xs font-semibold text-race-accent hover:bg-race-accent/10"
                              >
                                <Check className="size-3.5" aria-hidden="true" />
                                {copy("confirmEntry")}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
