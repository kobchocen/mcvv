import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, type Locale } from "@/i18n/routing";
import { RUNNER_SEARCH_LIMIT, RUNNER_SEARCH_MIN } from "@/lib/admin/runner-directory-core";
import { searchRunners } from "@/lib/admin/runner-directory";
import { birthYearOf, runnerSexOf } from "@/lib/admin/runner-sex-core";
import { requireAdmin } from "@/lib/admin/staff";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AdminRunners" });
  return { title: t("title") };
}

/** Číselník běžců (#198): hledání podle jména, id nebo dřívějšího jména. Jen admin. */
export default async function AdminRunnersPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const [admin, copy] = await Promise.all([
    getTranslations({ locale, namespace: "Admin" }),
    getTranslations({ locale, namespace: "AdminRunners" }),
  ]);
  const query = ((await searchParams).q ?? "").trim();
  const found = query ? await searchRunners(query) : null;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={admin("title")} />
        <Link
          href="/admin/ciselniky"
          className="text-sm font-semibold text-race-accent hover:underline"
        >
          ← {admin("dictsTitle")}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>

        <form
          method="get"
          className="mt-6 flex flex-wrap items-end gap-3"
          data-testid="runner-search"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="runner-q">{copy("searchLabel")}</Label>
            <Input
              id="runner-q"
              name="q"
              type="search"
              defaultValue={query}
              minLength={RUNNER_SEARCH_MIN}
              placeholder={copy("searchPlaceholder")}
              className="h-10 w-80 max-w-full bg-race-surface"
              autoFocus
            />
          </div>
          <Button type="submit" className="h-10">
            {copy("search")}
          </Button>
        </form>

        {query && !found ? (
          <p className="mt-4 text-sm text-race-muted">
            {copy("searchTooShort", { min: RUNNER_SEARCH_MIN })}
          </p>
        ) : null}
        {found && found.hits.length === 0 ? (
          <p className="mt-4 text-sm text-race-muted" data-testid="runner-search-empty">
            {copy("searchEmpty")}
          </p>
        ) : null}
        {found && found.hits.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table
              className="w-full min-w-[40rem] border-collapse text-left text-sm"
              data-testid="runner-search-results"
            >
              <thead>
                <tr className="border-b border-race-line text-xs uppercase tracking-wide text-race-muted">
                  <th className="py-2 pr-3">{copy("colName")}</th>
                  <th className="py-2 pr-3">{copy("colId")}</th>
                  <th className="py-2 pr-3">{copy("colBirthYear")}</th>
                  <th className="py-2 pr-3">{copy("colSex")}</th>
                  <th className="py-2 pr-3">{copy("colYears")}</th>
                  <th className="py-2 pr-3">{copy("colPrevious")}</th>
                </tr>
              </thead>
              <tbody>
                {found.hits.map((hit) => (
                  <tr key={hit.id} className="border-b border-race-line/40">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={{ pathname: "/admin/ciselniky/bezci/[id]", params: { id: hit.id } }}
                        className="font-semibold text-race-accent hover:underline"
                      >
                        {hit.name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{hit.id}</td>
                    <td className="py-2.5 pr-3">{birthYearOf(hit.id)}</td>
                    <td className="py-2.5 pr-3">
                      {runnerSexOf(hit.id) === "F" ? copy("sexF") : copy("sexM")}
                    </td>
                    <td className="py-2.5 pr-3 text-race-muted">
                      {hit.years.length
                        ? copy("yearsSummary", {
                            count: hit.years.length,
                            last: hit.years[0],
                          })
                        : copy("yearsNone")}
                    </td>
                    <td className="py-2.5 pr-3 text-race-muted">{hit.previousNames.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {found.more ? (
              <p className="mt-3 text-sm text-race-muted">
                {copy("searchMore", { limit: RUNNER_SEARCH_LIMIT })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
