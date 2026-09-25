import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { saveCategory } from "@/lib/admin/dictionaries";
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
  return { title: t("dictsCategories") };
}

export default async function AdminCategoriesPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const categories = await prisma.category.findMany({ orderBy: { sort: "asc" } });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="mb-4">
          <Link
            href="/admin/ciselniky"
            className="text-sm font-medium text-race-accent hover:underline"
          >
            {copy("dictsBack")}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("dictsCategories")}
        </h1>
        <div className="mt-8 overflow-x-auto">
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
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
