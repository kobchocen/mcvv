import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import { McvvLineClubSelect } from "@/components/organisms/mcvv-line-club-select";
import { McvvNewRunnerForm } from "@/components/organisms/mcvv-new-runner-form";
import { addExistingRunner, removeRunner, saveEntryHeader } from "@/lib/entries/actions";
import { loadMyEntry } from "@/lib/entries/load";
import { BANK_ACCOUNT, BANK_BIC, BANK_IBAN, spdQrSvg, variableSymbol } from "@/lib/entries/spd";
import { dateInputValue } from "@/lib/admin/parse";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  const defaultClubId =
    clubOptions.find((club) => club.name.trim() === (registration?.name ?? name).trim())?.id ??
    clubOptions[0]?.id ??
    "";
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
        <form action={saveEntryHeader} className="grid max-w-xl gap-4">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="id" value={registration.id} />
          <div className="grid gap-1.5">
            <Label htmlFor="entry-name">{copy("name")}</Label>
            <Input
              id="entry-name"
              name="name"
              defaultValue={registration.name ?? ""}
              disabled={!open}
              className="h-10 bg-race-surface"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{copy("email")}</Label>
            <Input value={email} disabled className="h-10 bg-race-surface" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="note">{copy("note")}</Label>
            <Textarea
              id="note"
              name="note"
              defaultValue={registration.note ?? ""}
              disabled={!open}
              className="min-h-24 bg-race-surface"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="noMail"
              value="N"
              defaultChecked={registration.promotion === "N"}
              disabled={!open}
            />
            {copy("noMail")}
          </label>
          {open ? (
            <Button
              type="submit"
              className="h-10 w-fit bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
            >
              {copy("save")}
            </Button>
          ) : null}
        </form>
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
                      clubId={line.clubId}
                      clubs={clubOptions}
                    />
                  ) : (
                    line.club.name
                  )}
                </td>
                <td className="py-2.5 pr-3">{line.category.name}</td>
                <td className="py-2.5 pr-3">{line.entryFee ?? line.category.entryFee}</td>
                <td className="py-2.5">
                  {open ? (
                    <form action={removeRunner}>
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="registrationId" value={registration.id} />
                      <input type="hidden" name="runnerId" value={line.runnerId} />
                      <button type="submit" className="text-sm text-race-muted hover:underline">
                        {copy("remove")}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {open && quick.length > 0 ? (
          <div className="mt-6">
            <h3 className="font-display text-lg font-semibold">{copy("quickAdd")}</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {quick.map((runner) => (
                <li key={runner.id}>
                  <form action={addExistingRunner}>
                    <input type="hidden" name="year" value={year} />
                    <input type="hidden" name="registrationId" value={registration.id} />
                    <input type="hidden" name="runnerId" value={runner.id} />
                    {defaultClubId ? (
                      <input type="hidden" name="clubId" value={defaultClubId} />
                    ) : null}
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-9 border-race-line bg-race-surface"
                    >
                      {runner.name}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {open ? (
          <div className="mt-8">
            <h3 className="font-display text-lg font-semibold">{copy("newRunner")}</h3>
            <McvvNewRunnerForm
              year={year}
              registrationId={registration.id}
              categories={categories}
              clubs={clubOptions}
              defaultClubId={defaultClubId}
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
