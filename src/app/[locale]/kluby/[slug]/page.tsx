import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";

import { PaginationLinks, RunnerNameLink } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import type { McvvHomepageContent } from "@/components/templates";
import { Link, redirect, type Locale } from "@/i18n/routing";
import {
  createClubResolver,
  resolveClubSlug,
  type ClubPerformance,
  type ClubProfile,
} from "@/lib/clubs";
import {
  getClubIndex,
  getClubProfile,
  loadClubProfile,
  loadFreshClubIndex,
} from "@/lib/clubs/cached";
import { paginate } from "@/lib/site/pagination";
import { formatRaceTime } from "@/lib/utils";

type PageProps = Readonly<{
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ strana?: string | string[] }>;
}>;

/** Runners of the club per page: long histories (hundreds of runners) are paged. */
const MEMBERS_PER_PAGE = 50;

/**
 * Club profile (#105). The club is its id (#104, Q34): the slug is "<id>-<newest name>".
 * A merged id, a stale name part or an old name-only slug (#167) redirects to the profile
 * of the main id. Reads only the club's own results and caches the profile (tag "stats");
 * `cache` shares one load between generateMetadata and the page.
 */
const loadProfile = cache(
  async (slug: string): Promise<{ profile: ClubProfile | null; redirectTo?: string }> => {
    const index = await getClubIndex();
    const cached = resolveClubSlug(slug, index.names, createClubResolver(index));
    if (cached) {
      if (cached.canonical !== slug) return { profile: null, redirectTo: cached.canonical };
      return { profile: await getClubProfile(cached.mainId) };
    }
    // An id added since the cache was filled (e.g. a new club in this year's entries).
    const fresh = await loadFreshClubIndex();
    const found = resolveClubSlug(slug, fresh.names, createClubResolver(fresh));
    if (!found) return { profile: null };
    if (found.canonical !== slug) return { profile: null, redirectTo: found.canonical };
    return { profile: await loadClubProfile(found.mainId, fresh) };
  },
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { profile } = await loadProfile(decodeURIComponent(slug));
  return { title: profile?.name ?? slug };
}

function BestTable({
  title,
  rows,
  copy,
}: {
  title: string;
  rows: ClubPerformance[];
  copy: { year: string; name: string; time: string };
}) {
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0">
      <h3 className="font-display text-lg font-semibold text-foreground dark:text-white">
        {title}
      </h3>
      <table className="mt-3 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">{copy.name}</th>
            <th className="py-2 pr-3">{copy.year}</th>
            <th className="py-2">{copy.time}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.runnerId} className="border-b border-race-line/40">
              <td className="py-2 pr-3 text-race-dim">{index + 1}</td>
              <td className="py-2 pr-3">
                <RunnerNameLink id={row.runnerId} name={row.name} />
              </td>
              <td className="py-2 pr-3">
                <Link
                  href={`/results/${row.year}#${row.runnerId}` as never}
                  className="text-race-accent hover:underline"
                >
                  {row.year}
                </Link>
              </td>
              <td className="py-2 font-display font-semibold text-race-accent">
                {formatRaceTime(row.time)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ClubPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale, slug: rawSlug } = await params;
  const { strana } = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const slug = decodeURIComponent(rawSlug);
  if (!slug.trim()) {
    notFound();
  }

  const { profile, redirectTo } = await loadProfile(slug);
  if (redirectTo) {
    redirect({ href: { pathname: "/kluby/[slug]", params: { slug: redirectTo } }, locale });
  }
  if (!profile) {
    notFound();
  }

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Club" });
  const maxYear = profile.perYear.reduce((max, row) => Math.max(max, row.starts), 0);
  const summary = [
    { value: String(profile.starts), label: copy("starts") },
    { value: String(profile.runners), label: copy("runners") },
    { value: String(profile.perYear.length), label: copy("editions") },
    {
      value:
        profile.firstYear === profile.lastYear
          ? String(profile.firstYear)
          : `${profile.firstYear}–${profile.lastYear}`,
      label: copy("years"),
    },
  ];
  const years = (row: { firstYear: number; lastYear: number }) =>
    row.firstYear === row.lastYear ? `${row.firstYear}` : `${row.firstYear}–${row.lastYear}`;
  const tableCopy = { year: copy("year"), name: copy("runner"), time: copy("time") };
  const members = paginate(
    profile.members,
    Array.isArray(strana) ? strana[0] : strana,
    MEMBERS_PER_PAGE,
  );
  const memberHref = (page: number) => ({
    pathname: "/kluby/[slug]" as const,
    params: { slug: profile.slug },
    query: page > 1 ? { strana: String(page) } : {},
    hash: "bezci",
  });

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
          <Link
            href="/kluby"
            className="mb-6 inline-block text-sm font-semibold text-race-accent hover:underline"
          >
            ← {copy("allClubs")}
          </Link>
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow")}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {profile.name}
          </h1>
          <p className="mt-3 text-sm text-race-muted">
            {copy("clubId", { id: profile.id })}
            {profile.mergedIds.length > 0
              ? ` · ${copy("mergedIds", { ids: profile.mergedIds.join(", ") })}`
              : ""}
          </p>
          {profile.history.length > 1 ? (
            <details className="mt-3 text-sm text-race-muted">
              <summary className="cursor-pointer font-semibold text-race-accent">
                {copy("history")}
              </summary>
              <ul className="mt-2 flex flex-col gap-0.5">
                {profile.history.map((row) => (
                  <li key={`${row.id}-${row.firstYear}`}>
                    <span className="tabular-nums">{years(row)}</span> · {row.name}
                    {profile.mergedIds.length > 0 ? (
                      <span className="text-race-dim"> ({row.id})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <article className="mt-6 border border-race-line/55 bg-race-surface p-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {summary.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-race-dim">
                    {item.label}
                  </dt>
                  <dd className="mt-1 font-display text-3xl font-bold text-foreground dark:text-white">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              href="/statistiky"
              className="mt-4 inline-block text-sm font-semibold text-race-accent hover:underline"
            >
              {copy("statsLink")} →
            </Link>
          </article>

          <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
            {copy("perYear")}
          </h2>
          <ol className="mt-4 flex flex-col gap-1.5" aria-label={copy("perYear")}>
            {profile.perYear.map((row) => (
              <li key={row.year} className="flex items-center gap-3 text-sm">
                <Link
                  href={`/results/${row.year}` as never}
                  className="w-12 shrink-0 font-medium text-race-accent hover:underline"
                >
                  {row.year}
                </Link>
                <span
                  className="h-3 rounded-sm bg-race-accent/70"
                  style={{ width: `${maxYear ? Math.max(2, (row.starts / maxYear) * 80) : 0}%` }}
                />
                <span className="text-race-muted">{row.starts}</span>
              </li>
            ))}
          </ol>

          <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
            {copy("best")}
          </h2>
          <div className="mt-4 grid gap-8 md:grid-cols-2">
            <BestTable title={copy("men")} rows={profile.best.M} copy={tableCopy} />
            <BestTable title={copy("women")} rows={profile.best.F} copy={tableCopy} />
          </div>

          <h2
            id="bezci"
            className="mt-12 scroll-mt-24 font-display text-2xl font-semibold text-foreground dark:text-white"
          >
            {copy("members")}
          </h2>
          {members.pageCount > 1 ? (
            <p className="mt-2 text-sm text-race-muted">
              {copy("membersShown", { from: members.from, to: members.to, total: members.total })}
            </p>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-4">{copy("runner")}</th>
                  <th className="py-2 pr-4">{copy("starts")}</th>
                  <th className="py-2 pr-4">{copy("personalBest")}</th>
                  <th className="py-2">{copy("years")}</th>
                </tr>
              </thead>
              <tbody>
                {members.items.map((member) => (
                  <tr key={member.runnerId} className="border-b border-race-line/40">
                    <td className="py-2 pr-4">
                      <RunnerNameLink id={member.runnerId} name={member.name} />
                    </td>
                    <td className="py-2 pr-4">{member.starts}</td>
                    <td className="py-2 pr-4 font-display font-semibold text-race-accent">
                      {formatRaceTime(member.best)}
                    </td>
                    <td className="py-2 text-race-muted">
                      {member.firstYear === member.lastYear
                        ? member.firstYear
                        : `${member.firstYear}–${member.lastYear}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationLinks
            page={members.page}
            pageCount={members.pageCount}
            hrefFor={memberHref}
            labels={{
              nav: copy("membersPages"),
              previous: copy("previous"),
              next: copy("next"),
              page: (page) => copy("page", { page }),
            }}
          />
          <p className="mt-8 text-xs leading-5 text-race-dim">{copy("idNote")}</p>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
