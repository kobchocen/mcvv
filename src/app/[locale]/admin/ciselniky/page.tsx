import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { saveCategory, saveClub } from "@/lib/admin/dictionaries";
import { prisma } from "@/lib/db/client";
import { type Locale } from "@/i18n/routing";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ rok?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("dictsTitle") };
}

export default async function AdminDictionariesPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const { rok } = await searchParams;

  const [categories, yearsRaw, latestEdition] = await Promise.all([
    prisma.category.findMany({ orderBy: { sort: "asc" } }),
    prisma.club.findMany({ select: { year: true }, distinct: ["year"], orderBy: { year: "desc" } }),
    prisma.edition.findFirst({ orderBy: { id: "desc" }, select: { id: true } }),
  ]);
  const years = yearsRaw.map((row) => row.year);
  const selectedYear =
    Number.parseInt(rok ?? "", 10) || years[0] || latestEdition?.id || new Date().getFullYear();
  const clubs = await prisma.club.findMany({
    where: { year: selectedYear },
    orderBy: { id: "asc" },
  });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-16">
        <section>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {copy("dictsTitle")}
          </h1>
          <h2 className="mt-8 font-display text-xl font-semibold">{copy("dictsCategories")}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-2">{copy("dictsCode")}</th>
                  <th className="py-2 pr-2">{copy("dictsName")}</th>
                  <th className="py-2 pr-2">{copy("dictsAge")}</th>
                  <th className="py-2 pr-2">{copy("dictsSort")}</th>
                  <th className="py-2 pr-2">{copy("dictsSex")}</th>
                  <th className="py-2 pr-2">{copy("dictsBibFrom")}</th>
                  <th className="py-2 pr-2">{copy("dictsBibTo")}</th>
                  <th className="py-2 pr-2">{copy("dictsFee")}</th>
                  <th className="py-2 pr-2">{copy("dictsRecord")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {categories.map((row) => (
                  <tr key={row.id} className="border-b border-race-line/40 align-top">
                    <td className="py-2 pr-2" colSpan={10}>
                      <form
                        action={saveCategory}
                        className="grid grid-cols-[2rem_8rem_4rem_4rem_3rem_5rem_5rem_5rem_5rem_auto] items-end gap-2"
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <span className="pb-2 font-medium">{row.id}</span>
                        <input
                          name="name"
                          defaultValue={row.name}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="age"
                          type="number"
                          defaultValue={row.age}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="sort"
                          type="number"
                          defaultValue={row.sort}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="sex"
                          defaultValue={row.sex}
                          maxLength={1}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="bibFrom"
                          type="number"
                          defaultValue={row.bibFrom}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="bibTo"
                          type="number"
                          defaultValue={row.bibTo}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="entryFee"
                          type="number"
                          defaultValue={row.entryFee}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="record"
                          type="number"
                          defaultValue={row.record}
                          className="h-9 border border-race-line bg-race-surface px-2"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          className="h-9 border-race-line bg-race-surface"
                        >
                          {copy("save")}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">{copy("dictsClubs")}</h2>
          <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
            <AdminField
              name="rok"
              label={copy("dictsYear")}
              type="number"
              defaultValue={selectedYear}
            />
            <Button
              type="submit"
              variant="outline"
              className="h-10 border-race-line bg-race-surface"
            >
              {copy("dictsYear")}
            </Button>
          </form>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-4">{copy("dictsCode")}</th>
                  <th className="py-2 pr-4">{copy("dictsName")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {clubs.map((row) => (
                  <tr key={`${row.id}-${row.year}`} className="border-b border-race-line/40">
                    <td className="py-2 pr-4" colSpan={3}>
                      <form action={saveClub} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="year" value={row.year} />
                        <input
                          name="id"
                          defaultValue={row.id}
                          maxLength={3}
                          className="h-9 w-16 border border-race-line bg-race-surface px-2"
                        />
                        <input
                          name="name"
                          defaultValue={row.name}
                          className="h-9 min-w-[12rem] flex-1 border border-race-line bg-race-surface px-2"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          className="h-9 border-race-line bg-race-surface"
                        >
                          {copy("save")}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={saveClub} className="mt-6 flex max-w-xl flex-wrap items-end gap-3">
            <input type="hidden" name="year" value={selectedYear} />
            <AdminField name="id" label={copy("dictsCode")} />
            <AdminField name="name" label={copy("dictsName")} />
            <Button
              type="submit"
              className="h-10 bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
            >
              {copy("create")}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
