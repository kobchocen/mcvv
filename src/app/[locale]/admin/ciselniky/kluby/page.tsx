import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ClubLink } from "@/components/molecules";
import { McvvAdminHomeLink } from "@/components/organisms";
import { saveClub } from "@/lib/admin/dictionaries";
import { prisma } from "@/lib/db/client";
import { Link, type Locale } from "@/i18n/routing";
import { AdminField } from "@/components/organisms/mcvv-admin-field";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/admin/staff";
import { canMergeClubs } from "@/lib/auth/roles";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ rok?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("dictsClubs") };
}

export default async function AdminClubsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await requireStaff();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const cleanup = await getTranslations({ locale, namespace: "ClubCleanup" });
  const { rok } = await searchParams;

  const [yearsRaw, latestEdition] = await Promise.all([
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
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("dictsClubs")}
        </h1>
        <Link
          href="/admin/ciselniky/kluby/slouceni"
          className="mt-2 inline-block text-sm font-semibold text-race-accent hover:underline"
        >
          {copy("clubMergeTitle")} →
        </Link>
        {/* Úklid sirotků (#193) smí jen admin – stejně jako sloučení. */}
        {canMergeClubs(session.role) ? (
          <Link
            href="/admin/ciselniky/kluby/sirotci"
            className="ml-4 mt-2 inline-block text-sm font-semibold text-race-accent hover:underline"
          >
            {cleanup("title")} →
          </Link>
        ) : null}
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <AdminField
            name="rok"
            label={copy("dictsYear")}
            type="number"
            defaultValue={selectedYear}
          />
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
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
                        maxLength={8}
                        className="h-9 w-24 border border-race-line bg-race-surface px-2"
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
                      <ClubLink
                        id={row.id}
                        name={row.name}
                        className="inline-flex h-9 items-center text-sm font-medium text-race-accent hover:underline"
                      >
                        {copy("dictsClubProfile")} →
                      </ClubLink>
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
            className="h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
          >
            {copy("create")}
          </Button>
        </form>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
