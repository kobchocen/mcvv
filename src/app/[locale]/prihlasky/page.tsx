import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Trash2 } from "lucide-react";

import { McvvPublicNavbar } from "@/components/organisms";
import { McvvEntryHeaderForm } from "@/components/organisms/mcvv-entry-header-form";
import { McvvLineClubSelect } from "@/components/organisms/mcvv-line-club-select";
import { McvvNewRunnerForm } from "@/components/organisms/mcvv-new-runner-form";
import { McvvQuickAdd } from "@/components/organisms/mcvv-quick-add";
import { removeRunner } from "@/lib/entries/actions";
import { computeLineFee } from "@/lib/entries/fee";
import { loadMyEntry } from "@/lib/entries/load";
import { BANK_ACCOUNT, BANK_BIC, BANK_IBAN, spdQrSvg, variableSymbol } from "@/lib/entries/spd";
import { dateInputValue } from "@/lib/admin/parse";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Entries" });
  return { title: t("title") };
}

export default async function EntriesPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Entries" });
  const auth = await getTranslations({ locale, namespace: "Auth" });
  const session = await getSession();
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
          {session ? (
            <EntryBody email={session.email} name={session.name} copy={copy} />
          ) : (
            <div className="mt-8 grid max-w-md gap-4">
              <p className="text-base leading-7 text-race-muted">{copy("needAccount")}</p>
              <Button
                asChild
                className="h-11 bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
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
  copy,
}: {
  email: string;
  name: string;
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
  const defaultClubName = registration?.lines.at(-1)?.club.name ?? "";
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
  const fee =
    registration?.lines.reduce(
      (sum, line) => sum + (line.entryFee ?? line.category.entryFee ?? 0),
      0,
    ) ?? 0;
  const paid = payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
  const due = fee - paid;
  const qr = registration && due > 0 ? await spdQrSvg(year, registration.id, due) : null;
  const vs = registration ? variableSymbol(year, registration.id) : "";

  if (!registration) {
    return (
      <p className="mt-8 text-base leading-7 text-race-muted">
        {copy("closedRead")}
        {deadline ? ` (${dateInputValue(deadline)})` : ""}
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-12">
      {deadline ? (
        <p className="text-sm text-race-muted">
          {copy("deadline")}: {dateInputValue(deadline)}
          {open ? "" : ` — ${copy("readOnly")}`}
        </p>
      ) : null}

      <section>
        <McvvEntryHeaderForm
          key={`${registration.name ?? ""}:${registration.note ?? ""}:${registration.promotion ?? ""}`}
          year={year}
          id={registration.id}
          name={registration.name ?? ""}
          note={registration.note ?? ""}
          noMail={registration.promotion === "N"}
          email={email}
          open={open}
          copy={{
            name: copy("name"),
            email: copy("email"),
            note: copy("note"),
            noMail: copy("noMail"),
            save: copy("save"),
            saved: copy("saved"),
          }}
        />
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">{copy("runners")}</h2>
        <table className="mt-4 w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
              <th className="py-2 pr-3">{copy("runnerName")}</th>
              <th className="py-2 pr-3">{copy("birthCol")}</th>
              <th className="py-2 pr-3">{copy("club")}</th>
              <th className="py-2 pr-3">{copy("category")}</th>
              <th className="py-2 pr-3">{copy("fee")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {registration.lines.map((line) => (
              <tr key={line.runnerId} className="border-b border-race-line/40">
                <td className="py-2.5 pr-3">{line.runner.name}</td>
                <td className="py-2.5 pr-3">{line.runnerId.slice(0, 4)}</td>
                <td className="py-2.5 pr-3">
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
                <td className="py-2.5 pr-3">{line.category.name}</td>
                <td className="py-2.5 pr-3">
                  {line.entryFee ?? line.category.entryFee}
                  {feeReasons.get(line.runnerId) ? (
                    <span className="ml-2 text-xs text-race-muted">
                      {feeReasons.get(line.runnerId)}
                    </span>
                  ) : null}
                </td>
                <td className="py-2.5">
                  {open ? (
                    <form action={removeRunner}>
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="registrationId" value={registration.id} />
                      <input type="hidden" name="runnerId" value={line.runnerId} />
                      <button
                        type="submit"
                        aria-label={copy("remove")}
                        className="inline-flex size-9 items-center justify-center text-race-muted hover:text-foreground"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {open && quick.length > 0 ? (
          <McvvQuickAdd
            year={year}
            registrationId={registration.id}
            runners={quick}
            clubs={clubOptions}
            defaultClubName={defaultClubName}
            copy={{ club: copy("club"), quickAdd: copy("quickAdd") }}
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
                male: copy("male"),
                female: copy("female"),
                category: copy("category"),
                club: copy("club"),
                add: copy("add"),
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
        ) : (
          <p className="mt-3 text-sm text-race-muted">{copy("paidInFull")}</p>
        )}
        <ul className="mt-4 text-sm text-race-muted">
          {payments.map((payment) => (
            <li key={payment.id}>
              {dateInputValue(payment.date)} — {payment.amount ?? 0} Kč
            </li>
          ))}
        </ul>
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl font-semibold">{copy("past")}</h2>
          <ul className="mt-3 text-sm text-race-muted">
            {past.map((row) => (
              <li key={`${row.year}-${row.id}`}>
                {row.year} · {row.name} · {row.lines.length}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
