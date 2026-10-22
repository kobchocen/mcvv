import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ClubNameLink, PaginationLinks } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import type { McvvHomepageContent } from "@/components/templates";
import { Link, type Locale } from "@/i18n/routing";
import {
  filterClubDirectory,
  isClubDirectorySort,
  sortClubDirectory,
  type ClubDirectorySort,
} from "@/lib/clubs";
import { getClubDirectory } from "@/lib/clubs/cached";
import { paginate } from "@/lib/site/pagination";
import { cn } from "@/lib/utils";

type SearchParams = {
  q?: string | string[];
  razeni?: string | string[];
  strana?: string | string[];
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

const CLUBS_PER_PAGE = 50;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Clubs" });
  return { title: t("metaTitle"), description: t("intro") };
}

/**
 * Public club list (#105 follow-up): every club with a result – main ids only, merged ids
 * folded in – linking to the club profiles. Search, sorting and paging are plain GET
 * parameters (q, razeni, strana) over the cached list.
 */
export default async function ClubsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const query = await searchParams;
  const q = first(query.q).trim().slice(0, 80);
  const sortRaw = first(query.razeni);
  const sort: ClubDirectorySort = isClubDirectorySort(sortRaw) ? sortRaw : "starty";

  const [home, copy, directory] = await Promise.all([
    getTranslations({ locale, namespace: "Home" }),
    getTranslations({ locale, namespace: "Clubs" }),
    getClubDirectory(),
  ]);
  const rows = sortClubDirectory(filterClubDirectory(directory, q), sort);
  const slice = paginate(rows, first(query.strana), CLUBS_PER_PAGE);
  const totalStarts = directory.reduce((sum, row) => sum + row.starts, 0);

  const href = (next: { sort?: ClubDirectorySort; page?: number }) => {
    const params: Record<string, string> = {};
    if (q) params.q = q;
    const nextSort = next.sort ?? sort;
    if (nextSort !== "starty") params.razeni = nextSort;
    if (next.page && next.page > 1) params.strana = String(next.page);
    return { pathname: "/kluby" as const, query: params };
  };
  const years = (row: { firstYear: number; lastYear: number }) =>
    row.firstYear === row.lastYear ? `${row.firstYear}` : `${row.firstYear}–${row.lastYear}`;
  const sortLink = (value: ClubDirectorySort, label: string) => (
    <Link
      href={href({ sort: value })}
      aria-current={sort === value ? "true" : undefined}
      className={cn(
        "hover:text-race-accent hover:underline",
        sort === value && "text-race-accent underline underline-offset-4",
      )}
    >
      {label}
    </Link>
  );

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar
        content={{
          brand: home.raw("brand") as McvvHomepageContent["brand"],
          nav: home.raw("nav") as McvvHomepageContent["nav"],
        }}
        variant="solid"
      />
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
          <p className="mt-4 max-w-2xl text-race-muted">
            {copy("lead", { clubs: directory.length, starts: totalStarts })}
          </p>

          <form method="get" role="search" className="mt-8 flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
              {copy("searchLabel")}
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={copy("searchPlaceholder")}
                maxLength={80}
                className="h-10 rounded-md border border-race-line bg-race-surface px-3 font-normal text-foreground"
              />
            </label>
            {sort !== "starty" ? <input type="hidden" name="razeni" value={sort} /> : null}
            <button
              type="submit"
              className="h-10 rounded-full bg-race-accent-solid px-5 font-display text-sm font-semibold text-white"
            >
              {copy("search")}
            </button>
            {q ? (
              <Link
                href={{ pathname: "/kluby", query: sort !== "starty" ? { razeni: sort } : {} }}
                className="h-10 content-center text-sm font-semibold text-race-accent hover:underline"
              >
                {copy("reset")}
              </Link>
            ) : null}
          </form>

          <p className="mt-6 text-sm text-race-muted" aria-live="polite">
            {slice.total === 0
              ? copy("empty")
              : copy("shown", { from: slice.from, to: slice.to, total: slice.total })}
          </p>

          {slice.total > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                    <th className="py-2 pr-4">{sortLink("nazev", copy("club"))}</th>
                    <th className="py-2 pr-4 text-right">{sortLink("starty", copy("starts"))}</th>
                    <th className="py-2 pr-4 text-right">{copy("runners")}</th>
                    <th className="py-2 pr-4 text-right">
                      {sortLink("rocniky", copy("editions"))}
                    </th>
                    <th className="py-2">{sortLink("posledni", copy("years"))}</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.items.map((row) => (
                    <tr key={row.id} className="border-b border-race-line/40">
                      <td className="py-2 pr-4">
                        <ClubNameLink
                          slug={row.slug}
                          name={row.name}
                          className="font-semibold text-race-accent underline-offset-2 hover:underline"
                        />
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.starts}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.runners}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.editions}</td>
                      <td className="py-2 tabular-nums text-race-muted">{years(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <PaginationLinks
            page={slice.page}
            pageCount={slice.pageCount}
            hrefFor={(page) => href({ page })}
            labels={{
              nav: copy("pages"),
              previous: copy("previous"),
              next: copy("next"),
              page: (page) => copy("page", { page }),
            }}
          />
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
