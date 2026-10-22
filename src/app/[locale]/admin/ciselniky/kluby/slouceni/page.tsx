import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { Link, type Locale } from "@/i18n/routing";
import {
  confirmClubMerge,
  rejectClubMerge,
  restoreClubMerge,
  unmergeClub,
} from "@/lib/admin/club-merge-actions";
import { requireStaff } from "@/lib/admin/staff";
import { clubUsage, createClubResolver, suggestClubMerges, type ClubUsage } from "@/lib/clubs";
import { loadClubMerges, loadClubNames } from "@/lib/clubs/queries";
import { prisma } from "@/lib/db/client";
import { loadAllResults } from "@/lib/stats/queries";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jistota?: string; pocet?: string; ok?: string; chyba?: string }>;
}>;

const CONFIDENCES = ["high", "medium", "low"] as const;
const PAGE = 50;
const ERRORS = ["ids", "hlavni", "nezname", "same", "empty", "main_merged", "other_merged"];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("clubMergeTitle") };
}

const inputClass = "h-9 min-w-[12rem] flex-1 border border-race-line bg-race-surface px-2 text-sm";
const outlineClass = "h-9 border-race-line bg-race-surface";

function yearsLabel(years: readonly number[]): string {
  if (years.length === 0) return "";
  // Runs of consecutive years: 2018, 2020–2022
  const parts: string[] = [];
  let start = years[0];
  let previous = years[0];
  for (const year of [...years.slice(1), Number.NaN]) {
    if (year === previous + 1) {
      previous = year;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = year;
    previous = year;
  }
  return parts.join(", ");
}

export default async function AdminClubMergePage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const query = await searchParams;
  const confidence = CONFIDENCES.find((value) => value === query.jistota);
  const limit = Math.max(PAGE, Number.parseInt(query.pocet ?? "", 10) || PAGE);

  const [results, names, merges, rejections] = await Promise.all([
    loadAllResults(),
    loadClubNames(),
    loadClubMerges(),
    prisma.clubMergeRejection.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const resolver = createClubResolver({ names, merges });
  const usage = clubUsage(results, names, resolver);
  const byId = new Map(usage.map((club) => [club.id, club]));
  const rejected = new Set(rejections.map((row) => `${row.clubIdA}|${row.clubIdB}`));
  const all = suggestClubMerges(usage, { rejected });
  const counts = Object.fromEntries(
    CONFIDENCES.map((value) => [value, all.filter((s) => s.confidence === value).length]),
  ) as Record<(typeof CONFIDENCES)[number], number>;
  const filtered = confidence ? all.filter((s) => s.confidence === confidence) : all;
  const shown = filtered.slice(0, limit);
  const mergedClubs = usage.filter((club) => club.ids.length > 1);
  const error = ERRORS.find((value) => value === query.chyba);

  const label = (id: string) => `${id} – ${resolver.profileName(id) || "?"}`;
  const usageLabel = (club: ClubUsage) =>
    copy("clubMergeUsage", {
      starts: club.starts,
      years:
        club.firstYear === club.lastYear
          ? `${club.firstYear}`
          : `${club.firstYear}–${club.lastYear}`,
    });

  /** One side of a merge: id, names per edition, usage and the radio "keep as main". */
  const renderSide = (club: ClubUsage, side: "a" | "b") => (
    <label
      key={side}
      className="flex flex-1 cursor-pointer flex-col gap-1 border border-race-line/70 p-3 has-[:checked]:border-race-accent has-[:checked]:bg-race-accent/10"
    >
      <span className="flex items-center gap-2">
        <input type="radio" name="main" value={side} required />
        <span className="text-xs font-semibold uppercase tracking-wide text-race-dim">
          {copy("clubMergeKeepMain")}
        </span>
      </span>
      <span>
        <b className="font-mono">{club.id}</b> · <b>{club.name}</b>{" "}
        <span className="text-race-dim">({usageLabel(club)})</span>
      </span>
      {club.ids.length > 1 ? (
        <span className="text-xs text-race-dim">
          {copy("clubMergeAlreadyMerged", { ids: club.ids.slice(1).join(", ") })}
        </span>
      ) : null}
      <ul className="text-xs text-race-muted">
        {club.names.map((row) => (
          <li key={row.name}>
            {row.name} <span className="text-race-dim">({yearsLabel(row.years)})</span>
          </li>
        ))}
      </ul>
      <Link
        href={{ pathname: "/kluby/[slug]", params: { slug: resolver.slug(club.id) } }}
        className="text-xs font-semibold text-race-accent hover:underline"
      >
        {copy("clubMergeProfile")}
      </Link>
    </label>
  );

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
            clubs: usage.length,
            merged: merges.length,
            mains: mergedClubs.length,
          })}
        </p>
        {query.ok ? (
          <p className="mt-4 border border-race-accent/40 bg-race-accent/10 px-3 py-2 text-sm">
            {copy("clubMergeSaved")}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            {copy(`clubMergeError_${error}`)}
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
          {shown.map((s) => {
            const formId = `merge-${s.a.id}-${s.b.id}`;
            return (
              <li
                key={`${s.a.id}|${s.b.id}`}
                className="border border-race-line/55 bg-race-surface p-3 text-sm"
              >
                <p className="text-xs text-race-muted">
                  {copy(`clubMergeConfidence_${s.confidence}`)} · {s.score.toFixed(2)}
                  {s.reasons.length > 0
                    ? ` · ${s.reasons.map((reason) => copy(`clubMergeReason_${reason}`)).join(", ")}`
                    : ""}{" "}
                  · {copy("clubMergeMatched", { a: s.matched[0], b: s.matched[1] })}
                </p>
                {s.sameYears.length > 0 ? (
                  <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {copy("clubMergeSameYears", { years: yearsLabel(s.sameYears) })}
                  </p>
                ) : null}
                <form id={formId} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="idA" value={s.a.id} />
                  <input type="hidden" name="idB" value={s.b.id} />
                  <fieldset className="flex flex-col gap-2 sm:flex-row">
                    <legend className="mb-1 text-xs font-semibold text-foreground">
                      {copy("clubMergeChooseMain")}
                    </legend>
                    {renderSide(s.a, "a")}
                    {renderSide(s.b, "b")}
                  </fieldset>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" formAction={confirmClubMerge} className="h-9">
                      {copy("clubMergeConfirm")}
                    </Button>
                    <Button
                      type="submit"
                      formAction={rejectClubMerge}
                      formNoValidate
                      variant="outline"
                      className={outlineClass}
                    >
                      {copy("clubMergeReject")}
                    </Button>
                  </div>
                </form>
              </li>
            );
          })}
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
        <datalist id="club-ids">
          {usage.map((club) => (
            <option key={club.id} value={club.id} label={label(club.id)} />
          ))}
        </datalist>
        <form
          action={confirmClubMerge}
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1 text-xs text-race-dim">
            {copy("clubMergeIdA")}
            <input name="idA" list="club-ids" required className={inputClass} />
            <span className="flex items-center gap-2 text-foreground">
              <input type="radio" name="main" value="a" required />
              {copy("clubMergeKeepMain")}
            </span>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-race-dim">
            {copy("clubMergeIdB")}
            <input name="idB" list="club-ids" required className={inputClass} />
            <span className="flex items-center gap-2 text-foreground">
              <input type="radio" name="main" value="b" required />
              {copy("clubMergeKeepMain")}
            </span>
          </label>
          <Button type="submit" className="h-9">
            {copy("clubMergeConfirm")}
          </Button>
        </form>

        <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("clubMergeClubs")}
        </h2>
        {mergedClubs.length === 0 ? (
          <p className="mt-2 text-sm text-race-muted">{copy("clubMergeNoClubs")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {mergedClubs.map((club) => (
              <li key={club.id} className="border border-race-line/55 bg-race-surface p-3 text-sm">
                <p>
                  <span className="mr-2 border border-race-accent px-1 text-xs font-semibold uppercase text-race-accent">
                    {copy("clubMergeMainBadge")}
                  </span>
                  <b className="font-mono">{club.id}</b> · <b>{club.name}</b>{" "}
                  <span className="text-race-dim">({usageLabel(club)})</span>{" "}
                  <Link
                    href={{ pathname: "/kluby/[slug]", params: { slug: resolver.slug(club.id) } }}
                    className="text-xs font-semibold text-race-accent hover:underline"
                  >
                    /kluby/{resolver.slug(club.id)}
                  </Link>
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {club.ids.slice(1).map((id) => (
                    <li key={id}>
                      <form
                        action={unmergeClub}
                        className="flex items-center gap-2 border border-race-line px-2 py-1"
                      >
                        <input type="hidden" name="id" value={id} />
                        <span>
                          <b className="font-mono">{id}</b> ·{" "}
                          {resolver
                            .history(id)
                            .map((row) => row.name)
                            .filter((name, index, list) => list.indexOf(name) === index)
                            .join(" / ")}
                        </span>
                        <button
                          type="submit"
                          className="text-xs text-race-dim hover:text-red-500"
                          title={copy("clubMergeUnmerge", { id })}
                        >
                          {copy("clubMergeUnmergeShort")}
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
                <li key={`${row.clubIdA}|${row.clubIdB}`}>
                  <form action={restoreClubMerge} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="idA" value={row.clubIdA} />
                    <input type="hidden" name="idB" value={row.clubIdB} />
                    <span>
                      {byId.has(row.clubIdA) ? label(row.clubIdA) : row.clubIdA} ⇄{" "}
                      {byId.has(row.clubIdB) ? label(row.clubIdB) : row.clubIdB}
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
