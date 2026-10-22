import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { Link, type Locale } from "@/i18n/routing";
import {
  confirmClubMerge,
  rejectClubMerge,
  removeClubAlias,
  renameCanonicalClub,
  restoreClubMerge,
} from "@/lib/admin/club-merge-actions";
import { requireStaff } from "@/lib/admin/staff";
import {
  clubNameUsage,
  createClubResolver,
  suggestClubMerges,
  type MergeSuggestion,
} from "@/lib/clubs";
import { loadClubAliases } from "@/lib/clubs/queries";
import { prisma } from "@/lib/db/client";
import { loadAllResults } from "@/lib/stats/queries";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jistota?: string; pocet?: string; ok?: string; chyba?: string }>;
}>;

const CONFIDENCES = ["high", "medium", "low"] as const;
const PAGE = 50;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("clubMergeTitle") };
}

const inputClass = "h-9 min-w-[12rem] flex-1 border border-race-line bg-race-surface px-2 text-sm";
const outlineClass = "h-9 border-race-line bg-race-surface";

export default async function AdminClubMergePage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const query = await searchParams;
  const confidence = CONFIDENCES.find((value) => value === query.jistota);
  const limit = Math.max(PAGE, Number.parseInt(query.pocet ?? "", 10) || PAGE);

  const [results, aliases, rejections, canonical] = await Promise.all([
    loadAllResults(),
    loadClubAliases(),
    prisma.clubMergeRejection.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.canonicalClub.findMany({
      orderBy: { name: "asc" },
      include: { aliases: { orderBy: { name: "asc" } } },
    }),
  ]);
  const resolver = createClubResolver(aliases);
  const usage = clubNameUsage(results, resolver);
  const startsByKey = new Map(usage.map((row) => [row.key, row]));
  const rejected = new Set(rejections.map((row) => `${row.keyA}|${row.keyB}`));
  const all = suggestClubMerges(usage, { rejected });
  const counts = Object.fromEntries(
    CONFIDENCES.map((value) => [value, all.filter((s) => s.confidence === value).length]),
  ) as Record<(typeof CONFIDENCES)[number], number>;
  const filtered = confidence ? all.filter((s) => s.confidence === confidence) : all;
  const shown = filtered.slice(0, limit);
  const canonicalById = new Map(canonical.map((club) => [club.id, club]));

  const defaultName = (s: MergeSuggestion) =>
    (s.a.canonicalId && canonicalById.get(s.a.canonicalId)?.name) ||
    (s.b.canonicalId && canonicalById.get(s.b.canonicalId)?.name) ||
    s.a.name;
  const usageLabel = (row: { name: string; starts: number; firstYear: number; lastYear: number }) =>
    copy("clubMergeUsage", {
      starts: row.starts,
      years:
        row.firstYear === row.lastYear ? `${row.firstYear}` : `${row.firstYear}–${row.lastYear}`,
    });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("clubMergeTitle")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("clubMergeIntro")}</p>
        <p className="mt-2 text-sm text-race-muted">
          {copy("clubMergeSummary", {
            names: usage.length,
            clubs: canonical.length,
            aliases: aliases.length,
          })}
        </p>
        {query.ok ? (
          <p className="mt-4 border border-race-accent/40 bg-race-accent/10 px-3 py-2 text-sm">
            {copy("clubMergeSaved")}
          </p>
        ) : null}
        {query.chyba ? (
          <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            {copy("clubMergeError")}
          </p>
        ) : null}

        <h2 className="mt-10 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("clubMergeSuggestions")}
        </h2>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={{ pathname: "/admin/ciselniky/kluby/slouceni" }}
            className={`border px-2 py-1 ${!confidence ? "border-race-accent text-race-accent" : "border-race-line"}`}
          >
            {copy("clubMergeAll", { count: all.length })}
          </Link>
          {CONFIDENCES.map((value) => (
            <Link
              key={value}
              href={{ pathname: "/admin/ciselniky/kluby/slouceni", query: { jistota: value } }}
              className={`border px-2 py-1 ${confidence === value ? "border-race-accent text-race-accent" : "border-race-line"}`}
            >
              {copy(`clubMergeConfidence_${value}`)} ({counts[value]})
            </Link>
          ))}
        </nav>
        <p className="mt-2 text-xs text-race-dim">{copy("clubMergeScoreHint")}</p>

        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((s) => (
            <li
              key={`${s.a.key}|${s.b.key}`}
              className="border border-race-line/55 bg-race-surface p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <b>{s.a.name}</b> <span className="text-race-dim">({usageLabel(s.a)})</span>
                  <span className="mx-2 text-race-dim">⇄</span>
                  <b>{s.b.name}</b> <span className="text-race-dim">({usageLabel(s.b)})</span>
                </p>
                <p className="text-xs text-race-muted">
                  {copy(`clubMergeConfidence_${s.confidence}`)} · {s.score.toFixed(2)}
                  {s.reasons.length > 0
                    ? ` · ${s.reasons.map((reason) => copy(`clubMergeReason_${reason}`)).join(", ")}`
                    : ""}
                </p>
              </div>
              {[s.a, s.b].some((row) => (startsByKey.get(row.key)?.spellings.length ?? 0) > 1) ? (
                <p className="mt-1 text-xs text-race-dim">
                  {copy("clubMergeSpellings")}:{" "}
                  {[s.a, s.b]
                    .flatMap((row) => startsByKey.get(row.key)?.spellings ?? [])
                    .map((sp) => `${sp.name} (${sp.starts})`)
                    .join(" · ")}
                </p>
              ) : null}
              <form className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="nameA" value={s.a.name} />
                <input type="hidden" name="nameB" value={s.b.name} />
                <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-race-dim">
                  {copy("clubMergeCanonical")}
                  <input name="canonical" defaultValue={defaultName(s)} className={inputClass} />
                </label>
                <Button type="submit" formAction={confirmClubMerge} className="h-9">
                  {copy("clubMergeConfirm")}
                </Button>
                <Button
                  type="submit"
                  formAction={rejectClubMerge}
                  variant="outline"
                  className={outlineClass}
                >
                  {copy("clubMergeReject")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        {filtered.length > shown.length ? (
          <Link
            href={{
              pathname: "/admin/ciselniky/kluby/slouceni",
              query: {
                ...(confidence ? { jistota: confidence } : {}),
                pocet: String(limit + PAGE),
              },
            }}
            className="mt-4 inline-block text-sm font-semibold text-race-accent hover:underline"
          >
            {copy("clubMergeMore", { count: filtered.length - shown.length })}
          </Link>
        ) : null}

        <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("clubMergeManual")}
        </h2>
        <p className="mt-2 text-sm text-race-muted">{copy("clubMergeManualHint")}</p>
        <datalist id="club-names">
          {usage.map((row) => (
            <option key={row.key} value={row.name} />
          ))}
        </datalist>
        <form action={confirmClubMerge} className="mt-3 flex flex-wrap items-end gap-2">
          <input
            name="nameA"
            list="club-names"
            required
            placeholder={copy("clubMergeNameA")}
            className={inputClass}
          />
          <input
            name="nameB"
            list="club-names"
            required
            placeholder={copy("clubMergeNameB")}
            className={inputClass}
          />
          <input name="canonical" placeholder={copy("clubMergeCanonical")} className={inputClass} />
          <Button type="submit" className="h-9">
            {copy("clubMergeConfirm")}
          </Button>
        </form>

        <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("clubMergeClubs")}
        </h2>
        {canonical.length === 0 ? (
          <p className="mt-2 text-sm text-race-muted">{copy("clubMergeNoClubs")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {canonical.map((club) => (
              <li key={club.id} className="border border-race-line/55 bg-race-surface p-3 text-sm">
                <form action={renameCanonicalClub} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={club.id} />
                  <input name="name" defaultValue={club.name} className={inputClass} />
                  <Button type="submit" variant="outline" className={outlineClass}>
                    {copy("save")}
                  </Button>
                  <Link
                    href={{ pathname: "/kluby/[slug]", params: { slug: club.slug } }}
                    className="text-xs font-semibold text-race-accent hover:underline"
                  >
                    /kluby/{club.slug}
                  </Link>
                </form>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {club.aliases.map((alias) => (
                    <li key={alias.key}>
                      <form
                        action={removeClubAlias}
                        className="flex items-center gap-1 border border-race-line px-2 py-1"
                      >
                        <input type="hidden" name="key" value={alias.key} />
                        <span>
                          {alias.name}{" "}
                          <span className="text-race-dim">
                            ({startsByKey.get(alias.key)?.starts ?? 0})
                          </span>
                        </span>
                        <button
                          type="submit"
                          className="text-xs text-race-dim hover:text-red-500"
                          aria-label={copy("clubMergeRemoveAlias", { name: alias.name })}
                          title={copy("clubMergeRemoveAlias", { name: alias.name })}
                        >
                          ✕
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {rejections.length > 0 ? (
          <>
            <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
              {copy("clubMergeRejected", { count: rejections.length })}
            </h2>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {rejections.map((row) => (
                <li key={`${row.keyA}|${row.keyB}`}>
                  <form action={restoreClubMerge} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="keyA" value={row.keyA} />
                    <input type="hidden" name="keyB" value={row.keyB} />
                    <span>
                      {startsByKey.get(row.keyA)?.name ?? row.keyA} ⇄{" "}
                      {startsByKey.get(row.keyB)?.name ?? row.keyB}
                    </span>
                    <button type="submit" className="text-xs text-race-accent hover:underline">
                      {copy("clubMergeRestore")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
