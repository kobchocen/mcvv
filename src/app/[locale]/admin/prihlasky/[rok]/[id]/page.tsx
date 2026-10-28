import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FileDown } from "lucide-react";

import { ClubLink, ConfirmSubmitButton } from "@/components/molecules";
import {
  cancelRegistration,
  confirmRegistration,
  deletePayment,
  savePayment,
  saveRegistrationHeader,
} from "@/lib/admin/registrations";
import { canCancelRegistration } from "@/lib/entries/empty-registrations";
import { ENTRY_STATUS } from "@/lib/entries/status";
import { freeAutoConfirmedIds, showFreeAutoBadge } from "@/lib/entries/auto-confirm";
import { registrationFee } from "@/lib/entries/fee-total";
import { isPromotionOptOut } from "@/lib/entries/promotion";
import { isReceiptEligible, receiptHref } from "@/lib/receipts/receipt-core";
import { dateInputValue, paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { type Locale } from "@/i18n/routing";
import { McvvAdminHomeLink } from "@/components/organisms";
import {
  McvvAdminSexChange,
  type McvvAdminSexChangeCopy,
} from "@/components/organisms/mcvv-admin-sex-change";
import { runnerSexOf } from "@/lib/admin/runner-sex-core";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { staffThreadCopy } from "@/components/organisms/mcvv-message-copy";
import { McvvMessageThread } from "@/components/organisms/mcvv-message-thread";
import { markReadByStaff, postStaffMessage, setThreadStatus } from "@/lib/messages/actions";
import { showInternalNote } from "@/lib/messages/core";
import { loadRegistrationThread } from "@/lib/messages/store";
import { getMessageSettings } from "@/lib/settings/messages";
import { Link } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";

type PageProps = Readonly<{
  params: Promise<{ locale: string; rok: string; id: string }>;
  searchParams: Promise<{ mail?: string; sex?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("regsTitle") };
}

export default async function AdminRegistrationDetailPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale, rok, id: rawId } = await params;
  const { mail, sex: sexChanged } = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const year = Number.parseInt(rok, 10);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(year) || !Number.isFinite(id)) {
    notFound();
  }

  const [registration, payments] = await Promise.all([
    prisma.registration.findUnique({
      where: { year_id: { year, id } },
      include: {
        lines: {
          include: {
            runner: { select: { name: true } },
            club: { select: { name: true } },
            category: { select: { name: true, entryFee: true } },
          },
          orderBy: { runnerId: "asc" },
        },
      },
    }),
    prisma.payment.findMany({
      where: { year },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);
  if (!registration) {
    notFound();
  }

  const copy = await getTranslations({ locale, namespace: "Admin" });
  const relatedPayments = payments.filter(
    (payment) => paymentRegistrationId(payment.registrationId) === id,
  );
  const sexChange = /^(\d{8})-(\d{8})$/.exec(sexChanged ?? "");
  const sexCopy: McvvAdminSexChangeCopy = {
    trigger: copy("sexChangeTrigger"),
    title: copy("sexChangeTitle"),
    description: copy("sexChangeDescription"),
    loading: copy("sexChangeLoading"),
    ids: copy("sexChangeIds"),
    sex: copy("sexChangeSex"),
    male: copy("sexMale"),
    female: copy("sexFemale"),
    categories: copy("sexChangeCategories"),
    line: copy.raw("sexChangeLine") as string,
    lines: copy.raw("sexChangeLines") as string,
    start: copy.raw("sexChangeStart") as string,
    noCategory: copy("sexChangeNoCategory"),
    fee: copy("sexChangeFee"),
    feeUnchanged: copy("sexChangeFeeUnchanged"),
    references: copy.raw("sexChangeReferences") as string,
    locked: copy("sexChangeLocked"),
    cancel: copy("sexChangeCancel"),
    confirm: copy.raw("sexChangeConfirm") as string,
    errors: {
      not_found: copy("sexChangeErrorNotFound"),
      invalid_id: copy("sexChangeErrorInvalid"),
      collision: copy("sexChangeErrorCollision"),
      has_results: copy("sexChangeLocked"),
      failed: copy("sexChangeErrorFailed"),
    },
  };
  // Sex change is for newcomers only (no row in mcvv_time).
  const runnersWithResults = new Set(
    (
      await prisma.result.findMany({
        where: { runnerId: { in: registration.lines.map((line) => line.runnerId) } },
        select: { runnerId: true },
        distinct: ["runnerId"],
      })
    ).map((row) => row.runnerId),
  );
  const [thread, messageSettings, autoConfirmed] = await Promise.all([
    loadRegistrationThread(year, id),
    getMessageSettings(),
    freeAutoConfirmedIds(year),
  ]);
  // Letošní poznámky převedla migrace do vlákna; starší (nebo nepřevedené) zůstávají
  // jen ke čtení jako interní poznámka.
  const internalNote = showInternalNote(registration.note, year, !!thread);
  const fee = registration.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
  const paid = relatedPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
  const receiptReady = isReceiptEligible({
    status: registration.status,
    lineCount: registration.lines.length,
    fee: registrationFee(registration.lines),
    paid,
  });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-12">
        <div>
          <McvvAdminHomeLink label={copy("title")} />
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {copy("regsTitle")} {year}/{id}
          </h1>
          <p className="mt-2 text-sm text-race-muted">
            {copy("regsFee")} {fee} · {copy("regsPaid")} {paid} · {copy("regsDiff")} {paid - fee} ·{" "}
            {copy("regsStatus")}{" "}
            {registration.status === 0
              ? copy("status0")
              : registration.status === 1
                ? copy("status1")
                : registration.status === 2
                  ? copy("status2")
                  : registration.status === 3
                    ? copy("status3")
                    : registration.status === 4
                      ? copy("status4")
                      : registration.status === 5
                        ? copy("status5")
                        : "—"}
            {showFreeAutoBadge({
              status: registration.status,
              fee,
              autoConfirmed: autoConfirmed.has(id),
            }) ? (
              <span className="ml-2 inline-block rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {copy("freeAutoConfirmed")}
              </span>
            ) : null}
          </p>
          {sexChange ? (
            <p role="status" className="mt-3 text-sm font-medium text-race-accent">
              {copy("sexChangeDone", { oldId: sexChange[1], newId: sexChange[2] })}
            </p>
          ) : null}
          {mail === "0" ? (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{copy("confirmMailFail")}</p>
          ) : null}
          {canCancelRegistration({
            status: registration.status,
            lineCount: registration.lines.length,
          }) ? (
            <form action={cancelRegistration} className="mt-4">
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="id" value={id} />
              <Button
                type="submit"
                variant="outline"
                className="h-10 border-race-line bg-race-surface"
              >
                {copy("cancelEntry")}
              </Button>
              <p className="mt-2 max-w-md text-xs text-race-muted">
                {copy("cancelEntryHint", { count: registration.lines.length, paid })}
              </p>
            </form>
          ) : null}
          {receiptReady ? (
            <Button
              asChild
              variant="outline"
              className="mt-4 h-10 border-race-line bg-race-surface"
            >
              <a href={receiptHref(year, id, locale)} download>
                <FileDown className="size-4" aria-hidden="true" />
                {copy("regsReceipt")}
              </a>
            </Button>
          ) : null}
          {registration.status === ENTRY_STATUS.paid ||
          registration.status === ENTRY_STATUS.overpaid ? (
            <form action={confirmRegistration} className="mt-4">
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="id" value={id} />
              <Button
                type="submit"
                className="h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
              >
                {copy("confirmEntry")}
              </Button>
            </form>
          ) : null}
        </div>

        <section>
          <form action={saveRegistrationHeader} className="grid max-w-2xl gap-4">
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="id" value={id} />
            <AdminField
              name="name"
              label={copy("regsName")}
              defaultValue={registration.name ?? ""}
            />
            <AdminField
              name="email"
              label={copy("regsEmail")}
              type="email"
              defaultValue={registration.email ?? ""}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="noNewsletter"
                value="N"
                defaultChecked={isPromotionOptOut(registration.promotion)}
              />
              {copy("regsNoNewsletter")}
            </label>
            <Button
              type="submit"
              className="h-11 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
            >
              {copy("save")}
            </Button>
          </form>
        </section>

        <section id="zpravy" className="scroll-mt-28">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">{copy("msgThread")}</h2>
            {thread ? (
              <Link
                href={{ pathname: "/admin/zpravy/[id]", params: { id: String(thread.id) } }}
                className="text-sm font-medium text-race-accent hover:underline"
              >
                {copy("msgTitle")}
              </Link>
            ) : null}
          </div>
          {!messageSettings.enabled ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{copy("msgDisabled")}</p>
          ) : null}
          {!thread ? <p className="mt-2 text-sm text-race-muted">{copy("msgStartHint")}</p> : null}
          <div className="mt-4 max-w-3xl">
            <McvvMessageThread
              viewer="staff"
              messages={(thread?.messages ?? []).map((message) => ({
                id: message.id,
                side: message.side,
                body: message.body,
                createdAt: message.createdAt,
                authorName: message.author?.name ?? "",
                readAt: message.readAt,
              }))}
              lastRead={thread?.lastReadByStaff ?? null}
              status={thread?.status ?? null}
              threadId={thread?.id ?? null}
              createFields={{ year, registrationId: id }}
              locale={locale}
              copy={await staffThreadCopy(locale)}
              replyAction={postStaffMessage}
              markReadAction={markReadByStaff}
              statusAction={setThreadStatus}
              showAuthorNames
              showReadReceipts
            />
          </div>
          {internalNote ? (
            <div className="mt-6 max-w-3xl rounded-[12px] border border-dashed border-race-line p-4">
              <p className="text-sm font-semibold">{copy("msgInternalNote")}</p>
              <p className="mt-1 text-xs text-race-muted">{copy("msgInternalNoteHint")}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{internalNote}</p>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">{copy("regsRunners")}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-3">{copy("regsName")}</th>
                  <th className="py-2 pr-3">{copy("regsBirth")}</th>
                  <th className="py-2 pr-3">{copy("regsClub")}</th>
                  <th className="py-2 pr-3">{copy("regsCategory")}</th>
                  <th className="py-2 pr-3">{copy("regsFee")}</th>
                  <th className="py-2 pr-3">{copy("regsBib")}</th>
                  <th className="py-2 pr-3">{copy("sexChangeSex")}</th>
                </tr>
              </thead>
              <tbody>
                {registration.lines.map((line) => (
                  <tr key={line.runnerId} className="border-b border-race-line/40">
                    <td className="py-2.5 pr-3">{line.runner.name}</td>
                    <td className="py-2.5 pr-3">{line.runnerId.slice(0, 4)}</td>
                    <td className="py-2.5 pr-3">
                      <ClubLink id={line.clubId} name={line.club.name} />
                    </td>
                    <td className="py-2.5 pr-3">{line.category.name}</td>
                    <td className="py-2.5 pr-3">{line.entryFee ?? ""}</td>
                    <td className="py-2.5 pr-3">{line.bib ?? ""}</td>
                    <td className="py-2.5 pr-3">
                      <span className="mr-2">
                        {runnerSexOf(line.runnerId) === "F" ? copy("sexFemale") : copy("sexMale")}
                      </span>
                      <McvvAdminSexChange
                        runnerId={line.runnerId}
                        runnerName={line.runner.name}
                        year={year}
                        registrationId={id}
                        hasResults={runnersWithResults.has(line.runnerId)}
                        copy={sexCopy}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">{copy("regsPayments")}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-3">{copy("regsDate")}</th>
                  <th className="py-2 pr-3">{copy("regsAmount")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {relatedPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-race-line/40">
                    <td className="py-2 pr-3" colSpan={3}>
                      <div className="flex flex-wrap items-end gap-2">
                        <form action={savePayment} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="year" value={year} />
                          <input type="hidden" name="registrationId" value={id} />
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input
                            name="date"
                            type="date"
                            defaultValue={dateInputValue(payment.date)}
                            className="h-9 border border-race-line bg-race-surface px-2"
                          />
                          <input
                            name="amount"
                            type="number"
                            defaultValue={payment.amount ?? 0}
                            className="h-9 w-28 border border-race-line bg-race-surface px-2"
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            className="h-9 border-race-line bg-race-surface"
                          >
                            {copy("save")}
                          </Button>
                        </form>
                        <form action={deletePayment}>
                          <input type="hidden" name="year" value={year} />
                          <input type="hidden" name="registrationId" value={id} />
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <ConfirmSubmitButton
                            variant="link"
                            destructive
                            title={copy("regsDeletePaymentTitle")}
                            description={copy("regsDeletePaymentConfirm", {
                              amount: payment.amount ?? 0,
                              date: dateInputValue(payment.date) || "—",
                            })}
                            confirmLabel={copy("regsDeletePayment")}
                            className="h-9 px-0 text-sm font-normal text-race-muted"
                          >
                            {copy("regsDeletePayment")}
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={savePayment} className="mt-6 flex max-w-xl flex-wrap items-end gap-3">
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="registrationId" value={id} />
            <AdminField name="date" label={copy("regsDate")} type="date" />
            <AdminField name="amount" label={copy("regsAmount")} type="number" />
            <Button
              type="submit"
              className="h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
            >
              {copy("regsNewPayment")}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
