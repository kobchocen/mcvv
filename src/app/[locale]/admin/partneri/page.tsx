import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { deactivatePartner } from "@/lib/admin/partners";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("partnersTitle") };
}

export default async function AdminPartnersPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const rows = await prisma.sponsor.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }, { id: "asc" }],
  });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {copy("partnersTitle")}
          </h1>
          <Button
            asChild
            className="h-10 bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
          >
            <Link href="/admin/partneri/novy">{copy("new")}</Link>
          </Button>
        </div>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className="py-2 pr-4">{copy("partnersCategory")}</th>
                <th className="py-2 pr-4">{copy("partnersOrder")}</th>
                <th className="py-2 pr-4">{copy("partnersName")}</th>
                <th className="py-2 pr-4">{copy("active")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-race-line/40">
                  <td className="py-2.5 pr-4">{row.category}</td>
                  <td className="py-2.5 pr-4">{row.order}</td>
                  <td className="py-2.5 pr-4 font-medium">{row.name}</td>
                  <td className="py-2.5 pr-4">{row.active === false ? "—" : "✓"}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={{ pathname: "/admin/partneri/[id]", params: { id: String(row.id) } }}
                        className="font-semibold text-race-accent hover:underline"
                      >
                        {copy("edit")}
                      </Link>
                      {row.active !== false ? (
                        <form action={deactivatePartner}>
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="text-sm text-race-muted hover:underline">
                            {copy("deactivate")}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
