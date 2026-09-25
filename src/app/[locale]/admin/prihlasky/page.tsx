import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { dateInputValue, paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ rok?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("regsTitle") };
}

function rowClass(lineCount: number, fee: number, paid: number): string {
  if (lineCount === 0) {
    return "bg-race-muted/10";
  }
  if (paid < fee) {
    return "bg-red-500/15";
  }
  if (paid > fee) {
    return "bg-amber-500/15";
  }
  return "";
}

export default async function AdminRegistrationsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const { rok } = await searchParams;

  const [latest, yearRows] = await Promise.all([
    prisma.edition.findFirst({ orderBy: { id: "desc" }, select: { date: true, id: true } }),
    prisma.registration.findMany({ select: { year: true }, distinct: ["year"] }),
  ]);
  const defaultYear = latest?.date.getUTCFullYear() ?? latest?.id ?? 2026;
  const years = [...new Set([...yearRows.map((row) => row.year), defaultYear, 2025])].sort(
    (a, b) => b - a,
  );
  const selectedYear = Number.parseInt(rok ?? "", 10) || defaultYear;

  const [registrations, payments] = await Promise.all([
    prisma.registration.findMany({
      where: { year: selectedYear },
      include: { lines: { select: { entryFee: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.payment.findMany({
      where: { year: selectedYear },
      select: { registrationId: true, amount: true },
    }),
  ]);

  const paidById = new Map<number, number>();
  for (const payment of payments) {
    const id = paymentRegistrationId(payment.registrationId);
    if (!Number.isFinite(id)) {
      continue;
    }
    paidById.set(id, (paidById.get(id) ?? 0) + (payment.amount ?? 0));
  }

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("regsTitle")}
        </h1>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <AdminField
            name="rok"
            label={copy("regsYear")}
            type="number"
            defaultValue={selectedYear}
          />
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
            {copy("regsYear")}
          </Button>
        </form>
        {years.length > 1 ? (
          <p className="mt-3 flex flex-wrap gap-3 text-sm">
            {years.map((year) => (
              <Link
                key={year}
                href={{ pathname: "/admin/prihlasky", query: { rok: String(year) } }}
                className={
                  year === selectedYear
                    ? "font-semibold text-race-accent"
                    : "text-race-muted hover:text-foreground"
                }
              >
                {year}
              </Link>
            ))}
          </p>
        ) : null}
        {registrations.length === 0 ? (
          <p className="mt-8 text-sm text-race-muted">{copy("regsEmpty")}</p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-3">{copy("regsId")}</th>
                  <th className="py-2 pr-3">{copy("regsName")}</th>
                  <th className="py-2 pr-3">{copy("regsEmail")}</th>
                  <th className="py-2 pr-3">{copy("regsCreated")}</th>
                  <th className="py-2 pr-3">{copy("regsCount")}</th>
                  <th className="py-2 pr-3">{copy("regsFee")}</th>
                  <th className="py-2 pr-3">{copy("regsPaid")}</th>
                  <th className="py-2 pr-3">{copy("regsDiff")}</th>
                  <th className="py-2 pr-3">{copy("regsStatus")}</th>
                  <th className="py-2 pr-3">{copy("regsPromotion")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {registrations.map((row) => {
                  const fee = row.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
                  const paid = paidById.get(row.id) ?? 0;
                  const diff = paid - fee;
                  return (
                    <tr
                      key={`${row.year}-${row.id}`}
                      className={cn(
                        "border-b border-race-line/40",
                        rowClass(row.lines.length, fee, paid),
                      )}
                    >
                      <td className="py-2.5 pr-3 font-medium">{row.id}</td>
                      <td className="py-2.5 pr-3">{row.name}</td>
                      <td className="py-2.5 pr-3">{row.email}</td>
                      <td className="py-2.5 pr-3">{dateInputValue(row.created)}</td>
                      <td className="py-2.5 pr-3">{row.lines.length}</td>
                      <td className="py-2.5 pr-3">{fee}</td>
                      <td className="py-2.5 pr-3">{paid}</td>
                      <td className="py-2.5 pr-3">{diff}</td>
                      <td className="py-2.5 pr-3">{row.status ?? ""}</td>
                      <td className="py-2.5 pr-3">{row.promotion ?? ""}</td>
                      <td className="py-2.5">
                        <Link
                          href={{
                            pathname: "/admin/prihlasky/[rok]/[id]",
                            params: { rok: String(row.year), id: String(row.id) },
                          }}
                          className="font-semibold text-race-accent hover:underline"
                        >
                          {copy("edit")}
                        </Link>
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
