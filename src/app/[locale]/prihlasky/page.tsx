import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FileDown, PlayCircle, Trash2 } from "lucide-react";

import { McvvPublicNavbar } from "@/components/organisms";
import { McvvEntryHeaderForm } from "@/components/organisms/mcvv-entry-header-form";
import { McvvLineClubSelect } from "@/components/organisms/mcvv-line-club-select";
import { McvvNewRunnerForm } from "@/components/organisms/mcvv-new-runner-form";
import { McvvQuickAdd } from "@/components/organisms/mcvv-quick-add";
import { userThreadCopy } from "@/components/organisms/mcvv-message-copy";
import { McvvMessageBubble, McvvMessageThread } from "@/components/organisms/mcvv-message-thread";
import { markReadByUser, postUserMessage } from "@/lib/messages/actions";
import { countUnreadMessages } from "@/lib/messages/core";
import {
  loadRegistrationThread,
  registrationThreadSummaries,
  summaryKey,
} from "@/lib/messages/store";
import { getMessageSettings } from "@/lib/settings/messages";
import { removeRunner } from "@/lib/entries/actions";
import { computeLineFee } from "@/lib/entries/fee";
import { registrationFee, sumPayments } from "@/lib/entries/fee-total";
import { loadMyEntry } from "@/lib/entries/load";
import { isNewbie } from "@/lib/entries/newbie";
import { countPastStarts } from "@/lib/entries/starts";
import { BANK_ACCOUNT, BANK_BIC, BANK_IBAN, spdQrSvg, variableSymbol } from "@/lib/entries/spd";
import { formatDate } from "@/lib/format/date";
import { getSession } from "@/lib/auth/session";
import { isReceiptEligible, receiptHref } from "@/lib/receipts/receipt-core";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ overeno?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Entries" });
  return { title: t("title") };
}

export default async function EntriesPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Entries" });
  const auth = await getTranslations({ locale, namespace: "Auth" });
  const session = await getSession();
  const { overeno } = await searchParams;
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow")}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {copy("title")}
          </h1>
          <Link
            href="/navod"
            className="mt-3 inline-flex items-center gap-2 font-display text-sm font-semibold text-race-accent underline-offset-4 hover:underline"
          >
            <PlayCircle className="size-5" aria-hidden="true" />
            {copy("guideLink")}
          </Link>
          {overeno === "1" && session ? (
            <p
              role="status"
              className="mt-6 rounded-md border border-race-accent/40 bg-race-accent/10 p-4 text-sm leading-6 text-foreground dark:text-white"
            >
              {auth("verifySuccess")}
            </p>
          ) : null}
          {session ? (
            <EntryBody email={session.email} name={session.name} locale={locale} copy={copy} />
          ) : (
            <div className="mt-8 grid max-w-md gap-4">
              <p className="text-base leading-7 text-race-muted">{copy("needAccount")}</p>
              <Button
                asChild
                className="h-11 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
              >
                <Link href="/prihlaseni">{auth("title")}</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 border-race-line bg-race-surface">
                <Link href="/registrace">{auth("registerTitle")}</Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

async function EntryBody({
  email,
  name,
  locale,
  copy,
}: {
  email: string;
  name: string;
  locale: Locale;
  copy: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const { year, open, deadline, registration, past, quick, payments } = await loadMyEntry(
    email,
    name,
  );
  const categories = await prisma.category.findMany({ orderBy: { sort: "asc" } });
  const yearClubs = await prisma.club.findMany({
    where: { year },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const clubOptions = [...yearClubs];
  if (registration) {
    for (const line of registration.lines) {
      if (!clubOptions.some((club) => club.id === line.clubId)) {
        clubOptions.push({ id: line.clubId, name: line.club.name });
      }
    }
  }
  const defaultClubName = (registration?.name ?? "").trim();
  const lineRunnerIds = registration ? registration.lines.map((line) => line.runnerId) : [];
  const startsById = await countPastStarts(lineRunnerIds, year);
  const startsCopy = await getTranslations({ locale, namespace: "Entrants" });
  const feeReasons = new Map<string, string | null>();
  if (registration) {
    for (const line of registration.lines) {
      const stored = line.entryFee ?? line.category.entryFee ?? 0;
      if (stored !== 0) {
        continue;
      }
      const { reason } = await computeLineFee(email, line.runnerId, line.category.entryFee);
      feeReasons.set(
        line.runnerId,
        reason === "organizer"
          ? copy("feeReasonOrganizer")
          : reason === "winner"
            ? copy("feeReasonWinner")
            : reason === "veteran"
              ? copy("feeReasonVeteran")
              : null,
      );
    }
  }
  const fee = registration ? registrationFee(registration.lines) : 0;
  const paid = sumPayments(payments);
  const due = fee - paid;
  const receiptReady =
    !!registration &&
    isReceiptEligible({
      status: registration.status,
      lineCount: registration.lines.length,
      fee,
      paid,
    });
  const hasLines = (registration?.lines.length ?? 0) > 0;
  const qr =
    registration && hasLines && due > 0 ? await spdQrSvg(year, registration.id, due) : null;
  const vs = registration ? variableSymbol(year, registration.id) : "";
  const messagesEnabled = (await getMessageSettings()).enabled;
  const msg = await getTranslations({ locale, namespace: "Messages" });
  const thread =
    messagesEnabled && registration ? await loadRegistrationThread(year, registration.id) : null;
  const threadUnread = thread
    ? countUnreadMessages(thread.messages, thread.lastReadByUser, "user")
    : 0;
  const pastSummaries = messagesEnabled
    ? await registrationThreadSummaries(
        past.map((row) => ({ year: row.year, id: row.id })),
        "user",
      )
    : new Map();

  if (!registration) {
    return (
      <p className="mt-8 text-base leading-7 text-race-muted">
        {copy("closedRead")}
        {deadline ? ` (${formatDate(deadline, locale)})` : ""}
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-12">
      {deadline ? (
        <p className="text-sm text-race-muted">
          {copy("deadline")}: {formatDate(deadline, locale)}
          {open ? "" : ` — ${copy("readOnly")}`}
        </p>
      ) : null}

      {messagesEnabled ? (
        <p className="-mt-6 flex flex-wrap items-center gap-2 text-sm">
          <a
            href="#zpravy"
            className="inline-flex items-center gap-2 font-medium text-race-accent hover:underline"
          >
            <McvvMessageBubble
              count={thread?.messages.length ?? 0}
              unread={threadUnread}
              label={msg("sectionTitle")}
            />
            {msg("sectionTitle")}
          </a>
          <span className="text-race-muted">
            {thread && thread.messages.length > 0
              ? copy("messagesCount", { count: thread.messages.length })
              : copy("messagesNone")}
            {threadUnread > 0 ? ` · ${copy("messagesUnread", { count: threadUnread })}` : ""}
          </span>
        </p>
      ) : null}

      <section>
        <McvvEntryHeaderForm
          key={`${registration.name ?? ""}:${registration.promotion ?? ""}`}
          year={year}
          id={registration.id}
          name={registration.name ?? ""}
          noMail={registration.promotion === "N"}
          email={email}
          open={open}
          copy={{
            name: copy("name"),
            email: copy("email"),
            noMail: copy("noMail"),
            save: copy("save"),
            saved: copy("saved"),
          }}
        />
      </section>

      {messagesEnabled ? (
        <section id="zpravy" className="scroll-mt-28">
          <h2 className="font-display text-2xl font-semibold">{msg("sectionTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-race-muted">{msg("sectionIntro")}</p>
          <div className="mt-4">
            <McvvMessageThread
              viewer="user"
              messages={(thread?.messages ?? []).map((message) => ({
                id: message.id,
                side: message.side,
                body: message.body,
                createdAt: message.createdAt,
                authorName: message.author?.name ?? "",
              }))}
              lastRead={thread?.lastReadByUser ?? null}
              status={thread?.status ?? null}
              threadId={thread?.id ?? null}
              createFields={{ year, registrationId: registration.id }}
              locale={locale}
              copy={await userThreadCopy(locale)}
              replyAction={postUserMessage}
              markReadAction={markReadByUser}
            />
          </div>
          <p className="mt-3 text-sm">
            <Link href="/zpravy" className="font-medium text-race-accent hover:underline">
              {msg("backToList")}
            </Link>
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-2xl font-semibold">{copy("runners")}</h2>
        <div className="mt-4 md:overflow-x-auto">
          <table className="block w-full border-collapse text-left text-sm md:table md:min-w-[40rem]">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className="py-2 pr-3">{copy("runnerName")}</th>
                <th className="py-2 pr-3">{copy("birthCol")}</th>
                <th className="py-2 pr-3">{copy("club")}</th>
                <th className="py-2 pr-3">{copy("category")}</th>
                <th className="py-2 pr-3">{copy("fee")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="grid gap-3 md:table-row-group">
              {registration.lines.map((line) => {
                const starts = startsById.get(line.runnerId) ?? 0;
                return (
                  <tr
                    key={line.runnerId}
                    className="grid grid-cols-[1fr_auto] gap-x-3 rounded-[12px] border border-race-line/60 p-4 md:table-row md:rounded-none md:border-0 md:border-b md:border-race-line/40 md:p-0"
                  >
                    <td className="col-start-1 row-start-1 pb-2 md:py-2.5 md:pr-3">
                      <span className="font-semibold md:font-medium">{line.runner.name}</span>
                      <span className="mt-0.5 block text-xs text-race-muted sm:ml-2 sm:mt-0 sm:inline">
                        {isNewbie(starts)
                          ? startsCopy("newbie")
                          : startsCopy("starts", { count: starts })}
                      </span>
                    </td>
                    <td className="col-span-2 flex items-center justify-between gap-3 border-t border-race-line/40 py-2 md:table-cell md:border-0 md:py-2.5 md:pr-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-race-dim md:hidden">
                        {copy("birthCol")}
                      </span>
                      {line.runnerId.slice(0, 4)}
                    </td>
                    <td className="col-span-2 grid gap-1.5 border-t border-race-line/40 py-2 md:table-cell md:border-0 md:py-2.5 md:pr-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-race-dim md:hidden">
                        {copy("club")}
                      </span>
                      {open ? (
                        <McvvLineClubSelect
                          year={year}
                          registrationId={registration.id}
                          runnerId={line.runnerId}
                          clubName={line.club.name}
                          clubs={clubOptions}
                        />
                      ) : (
                        line.club.name
                      )}
                    </td>
                    <td className="col-span-2 flex items-center justify-between gap-3 border-t border-race-line/40 py-2 md:table-cell md:border-0 md:py-2.5 md:pr-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-race-dim md:hidden">
                        {copy("category")}
                      </span>
                      {line.category.name}
                    </td>
                    <td className="col-span-2 flex items-center justify-between gap-3 border-t border-race-line/40 pt-2 md:table-cell md:border-0 md:py-2.5 md:pr-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-race-dim md:hidden">
                        {copy("fee")}
                      </span>
                      <span>
                        {line.entryFee ?? line.category.entryFee}
                        {feeReasons.get(line.runnerId) ? (
                          <span className="ml-2 text-xs text-race-muted">
                            {feeReasons.get(line.runnerId)}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="col-start-2 row-start-1 -mr-2 -mt-2 md:m-0 md:table-cell md:py-2.5">
                      {open ? (
                        <form action={removeRunner}>
                          <input type="hidden" name="year" value={year} />
                          <input type="hidden" name="registrationId" value={registration.id} />
                          <input type="hidden" name="runnerId" value={line.runnerId} />
                          <button
                            type="submit"
                            aria-label={copy("remove")}
                            className="inline-flex size-11 items-center md:size-9 justify-center text-race-muted hover:text-foreground"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {open && quick.length > 0 ? (
          <McvvQuickAdd
            year={year}
            registrationId={registration.id}
            runners={quick}
            clubName={defaultClubName}
            copy={{ quickAdd: copy("quickAdd"), runnerTitle: copy.raw("quickAddTitle") as string }}
          />
        ) : null}

        {open ? (
          <div className="mt-8">
            <h3 className="font-display text-lg font-semibold">{copy("newRunner")}</h3>
            <McvvNewRunnerForm
              year={year}
              registrationId={registration.id}
              categories={categories}
              clubs={clubOptions}
              defaultClubName={defaultClubName}
              copy={{
                firstName: copy("firstName"),
                lastName: copy("lastName"),
                birthYear: copy("birthYear"),
                sex: copy("sex"),
                sexPlaceholder: copy("sexPlaceholder"),
                sexRequired: copy("sexRequired"),
                categoryPlaceholder: copy("categoryPlaceholder"),
                male: copy("male"),
                female: copy("female"),
                category: copy("category"),
                club: copy("club"),
                add: copy("add"),
                ambiguous: copy("ambiguous"),
                taken: copy("taken"),
                invalid: copy("invalidRunner"),
              }}
            />
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">{copy("payment")}</h2>
        <p className="mt-2 text-sm text-race-muted">
          {copy("feeTotal")}: {fee} Kč · {copy("paid")}: {paid} Kč · {copy("due")}:{" "}
          {Math.max(0, due)} Kč
        </p>
        {qr ? (
          <div className="mt-4 max-w-sm">
            <div
              className="aspect-square max-w-[16rem] bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <dl className="mt-4 grid gap-1 text-sm">
              <div>
                {copy("account")}: {BANK_ACCOUNT} (Fio)
              </div>
              <div>IBAN: {BANK_IBAN}</div>
              <div>BIC: {BANK_BIC}</div>
              <div>
                {copy("vs")}: {vs}
              </div>
              <div>
                {copy("due")}: {due} Kč
              </div>
            </dl>
          </div>
        ) : !hasLines ? (
          <p className="mt-3 text-sm text-race-muted">{copy("addRunnersFirst")}</p>
        ) : fee > 0 && paid >= fee ? (
          <div className="mt-3 grid gap-3">
            <p className="text-sm text-race-muted">{copy("paidInFull")}</p>
            {receiptReady ? (
              <Button
                asChild
                variant="outline"
                className="h-10 w-fit border-race-line bg-race-surface"
              >
                <a href={receiptHref(year, registration.id, locale)} download>
                  <FileDown className="size-4" aria-hidden="true" />
                  {copy("receiptDownload")}
                </a>
              </Button>
            ) : null}
          </div>
        ) : fee === 0 ? (
          <p className="mt-3 text-sm text-race-muted">{copy("noFeeDue")}</p>
        ) : null}
        <ul className="mt-4 text-sm text-race-muted">
          {payments.map((payment) => (
            <li key={payment.id}>
              {payment.date ? formatDate(payment.date, locale) : "—"} — {payment.amount ?? 0} Kč
            </li>
          ))}
        </ul>
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl font-semibold">{copy("past")}</h2>
          <ul className="mt-3 text-sm text-race-muted">
            {past.map((row) => {
              const summary = pastSummaries.get(summaryKey(row.year, row.id));
              return (
                <li key={`${row.year}-${row.id}`} className="flex flex-wrap items-center gap-2">
                  <span>
                    {row.year} · {row.name} · {row.lines.length}
                  </span>
                  {summary ? (
                    <Link
                      href={{ pathname: "/zpravy/[id]", params: { id: String(summary.threadId) } }}
                      aria-label={msg("sectionTitle")}
                    >
                      <McvvMessageBubble
                        count={summary.count}
                        unread={summary.unread}
                        label={msg("sectionTitle")}
                      />
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
