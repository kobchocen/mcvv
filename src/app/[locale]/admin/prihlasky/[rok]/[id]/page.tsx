import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { deletePayment, savePayment, saveRegistrationHeader } from "@/lib/admin/registrations";
import { dateInputValue, paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PageProps = Readonly<{
  params: Promise<{ locale: string; rok: string; id: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("regsTitle") };
}

export default async function AdminRegistrationDetailPage({ params }: PageProps) {
  const { locale: requestedLocale, rok, id: rawId } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
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
            category: { select: { name: true } },
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
  const fee = registration.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
  const paid = relatedPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-12">
        <div>
          <p className="mb-4">
            <Link
              href={{ pathname: "/admin/prihlasky", query: { rok: String(year) } }}
              className="text-sm font-medium text-race-accent hover:underline"
            >
              {copy("regsBack")}
            </Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {copy("regsTitle")} {year}/{id}
          </h1>
          <p className="mt-2 text-sm text-race-muted">
            {copy("regsFee")} {fee} · {copy("regsPaid")} {paid} · {copy("regsDiff")} {paid - fee} ·{" "}
            {copy("regsStatus")} {registration.status ?? "—"}
          </p>
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
            <AdminField
              name="promotion"
              label={copy("regsPromotion")}
              defaultValue={registration.promotion ?? ""}
            />
            <AdminField name="note" label={copy("regsNote")}>
              <Textarea
                id="note"
                name="note"
                defaultValue={registration.note ?? ""}
                className="min-h-24 bg-race-surface"
              />
            </AdminField>
            <Button
              type="submit"
              className="h-11 w-fit bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
            >
              {copy("save")}
            </Button>
          </form>
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
                </tr>
              </thead>
              <tbody>
                {registration.lines.map((line) => (
                  <tr key={line.runnerId} className="border-b border-race-line/40">
                    <td className="py-2.5 pr-3">{line.runner.name}</td>
                    <td className="py-2.5 pr-3">{line.runnerId.slice(0, 4)}</td>
                    <td className="py-2.5 pr-3">{line.club.name}</td>
                    <td className="py-2.5 pr-3">{line.category.name}</td>
                    <td className="py-2.5 pr-3">{line.entryFee ?? ""}</td>
                    <td className="py-2.5 pr-3">{line.bib ?? ""}</td>
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
                          <button
                            type="submit"
                            className="h-9 text-sm text-race-muted hover:underline"
                          >
                            {copy("regsDeletePayment")}
                          </button>
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
              className="h-10 bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
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
