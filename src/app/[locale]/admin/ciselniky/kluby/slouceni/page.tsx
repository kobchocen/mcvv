import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LinkPendingLabel } from "@/components/molecules/link-pending-label";
import { PendingSubmitButton } from "@/components/molecules/pending-submit-button";
import { McvvAdminHomeLink } from "@/components/organisms";
import { clubsSubnav, McvvAdminDictsSubnav } from "@/components/organisms/mcvv-admin-dicts-subnav";
import { McvvAdminMergePicker } from "@/components/organisms/mcvv-admin-merge-picker";
import { Link, type Locale } from "@/i18n/routing";
import {
  confirmClubMerge,
  previewClubMergeAction,
  rejectClubMerge,
  restoreClubMerge,
} from "@/lib/admin/club-merge-actions";
import { requireStaff } from "@/lib/admin/staff";
import { canMergeClubs } from "@/lib/auth/roles";
import { clubUsage, createClubResolver, suggestClubMerges, type ClubUsage } from "@/lib/clubs";
import { previewClubMerge, type ClubMergePreview } from "@/lib/clubs/merge-apply";
import {
  CLUB_MERGE_HISTORY_LIMIT,
  clubMergeHistoryEntry,
  type ClubMergeHistoryEntry,
} from "@/lib/clubs/merge-history";
import { loadClubNames } from "@/lib/clubs/queries";
import { prisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format/date";
import type { MergePickOption } from "@/lib/admin/merge-pick";
import { loadAllResults } from "@/lib/stats/queries";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    jistota?: string;
    pocet?: string;
    ok?: string;
    chyba?: string;
    /** Náhled sloučení: hlavní id a slučované id. */
    hlavni?: string;
    sloucit?: string;
    /** Po sloučení: hlavní id a id, které zmizelo. */
    hlavni_hotovo?: string;
    sloucene?: string;
  }>;
}>;

const CONFIDENCES = ["high", "medium", "low"] as const;
/** Návrhy po 10, „Načíst další“ přidá dalších 10 (Q244). */
const PAGE = 10;
const ERRORS = [
  "ids",
  "hlavni",
  "potvrzeni",
  "same",
  "empty",
  "no_club",
  "unknown_main",
  "unknown_other",
];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("clubMergeTitle") };
}

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
  const session = await requireStaff();
  // Q47: an organizer sees the suggestions and may reject them; preview and merge are admin only.
  const canMerge = canMergeClubs(session.role);
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const cleanup = await getTranslations({ locale, namespace: "ClubCleanup" });
  const query = await searchParams;
  const confidence = CONFIDENCES.find((value) => value === query.jistota);
  const limit = Math.max(PAGE, Number.parseInt(query.pocet ?? "", 10) || PAGE);

  const [results, names, rejections, mergeAudit, previewResult] = await Promise.all([
    loadAllResults(),
    loadClubNames(),
    prisma.clubMergeRejection.findMany({ orderBy: { createdAt: "desc" } }),
    // Q246: posledních 20 sloučení včetně těch z migrace (source = "migration").
    prisma.auditLog.findMany({
      where: { action: "club.merge" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CLUB_MERGE_HISTORY_LIMIT,
      select: { id: true, createdAt: true, actorEmail: true, target: true, detail: true },
    }),
    canMerge && query.hlavni && query.sloucit
      ? previewClubMerge(prisma, query.hlavni, query.sloucit)
      : Promise.resolve(null),
  ]);
  const preview = previewResult?.ok ? previewResult.preview : null;
  const resolver = createClubResolver({ names });
  const usage = clubUsage(results, names, resolver);
  const byId = new Map(usage.map((club) => [club.id, club]));
  const rejected = new Set(rejections.map((row) => `${row.clubIdA}|${row.clubIdB}`));
  const all = suggestClubMerges(usage, { rejected });
  const counts = Object.fromEntries(
    CONFIDENCES.map((value) => [value, all.filter((s) => s.confidence === value).length]),
  ) as Record<(typeof CONFIDENCES)[number], number>;
  const filtered = confidence ? all.filter((s) => s.confidence === confidence) : all;
  const shown = filtered.slice(0, limit);
  const error = ERRORS.find(
    (value) =>
      value === query.chyba ||
      (previewResult && !previewResult.ok && previewResult.error === value),
  );

  const history = mergeAudit.map(clubMergeHistoryEntry);
  const done =
    query.ok === "merge" && query.hlavni_hotovo && query.sloucene
      ? (history.find(
          (entry) => entry.main === query.hlavni_hotovo && entry.merged === query.sloucene,
        ) ?? null)
      : null;

  const label = (id: string) => `${id} – ${resolver.profileName(id) || "?"}`;
  const usageLabel = (club: ClubUsage) =>
    copy("clubMergeUsage", {
      starts: club.starts,
      years:
        club.firstYear === club.lastYear
          ? `${club.firstYear}`
          : `${club.firstYear}–${club.lastYear}`,
    });

  const isAdmin = canMerge;
  /** Nabídka ručního výběru (Q245): hledání podle id i všech názvů klubu. */
  const pickOptions: MergePickOption[] = canMerge
    ? usage.map((club) => ({
        id: club.id,
        label: club.name,
        meta: usageLabel(club),
        search: club.names.map((row) => row.name).join(" "),
        card: {
          title: club.name,
          lines: [
            usageLabel(club),
            ...club.names.map((row) => `${row.name} (${yearsLabel(row.years)})`),
          ],
          href: `/${locale}/kluby/${resolver.slug(club.id)}`,
        },
      }))
    : [];

  /** Den záznamu v Europe/Prague (YYYY-MM-DD) pro filtr auditu. */
  const auditDay = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(date);

  /** Řádek přehledu sloučení (Q246): pro pořadatele jen čtení, odkaz do auditu jen admin (Q247). */
  const renderHistoryRow = (entry: ClubMergeHistoryEntry) => (
    <tr key={entry.id} className="border-t border-race-line/55 align-top">
      <td className="py-2 pr-3 whitespace-nowrap">
        {formatDateTime(entry.at, locale)}
        {entry.source === "migration" ? (
          <span className="ml-2 border border-race-line px-1 text-xs text-race-muted">
            {copy("clubMergeHistoryMigration")}
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-3 break-all">{entry.actor}</td>
      <td className="py-2 pr-3">
        <span className="font-mono">{entry.merged}</span>
        {entry.mergedName ? ` ${entry.mergedName}` : ""} →{" "}
        <span className="font-mono">{entry.main}</span>
        {byId.has(entry.main) ? ` ${resolver.profileName(entry.main)}` : ""}
      </td>
      <td className="py-2 pr-3 text-race-muted">{copy("clubMergeHistoryCounts", entry.counts)}</td>
      {isAdmin ? (
        <td className="py-2 whitespace-nowrap">
          <Link
            href={{
              pathname: "/admin/audit",
              query: {
                akce: "club.merge",
                cil: `club:${entry.main}`,
                od: auditDay(entry.loggedAt),
                do: auditDay(entry.loggedAt),
              },
            }}
            className="text-xs font-semibold text-race-accent hover:underline"
          >
            {copy("clubMergeHistoryAudit")}
          </Link>
        </td>
      ) : null}
    </tr>
  );

  /** One side of a merge: id, names per edition, usage and the radio "keep as main". */
  const renderSide = (club: ClubUsage, side: "a" | "b") => (
    <label
      key={side}
      className="flex flex-1 cursor-pointer flex-col gap-1 border border-race-line/70 p-3 has-[:checked]:border-race-accent has-[:checked]:bg-race-accent/10"
    >
      <span className="flex items-center gap-2">
        {canMerge ? <input type="radio" name="main" value={side} required /> : null}
        <span className="text-xs font-semibold uppercase tracking-wide text-race-dim">
          {copy("clubMergeKeepMain")}
        </span>
      </span>
      <span>
        <b className="font-mono">{club.id}</b> · <b>{club.name}</b>{" "}
        <span className="text-race-dim">({usageLabel(club)})</span>
      </span>
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

  /**
   * Náhled sloučení před potvrzením: co se nevratně změní (počty řádků po tabulkách, roky
   * číselníku) a zaškrtávací potvrzení nevratnosti.
   */
  const renderPreview = (preview: ClubMergePreview) => {
    const { counts } = preview;
    const rows = [
      { label: copy("clubMergeCount_entries"), value: counts.mcvv_prihlaska_radek },
      { label: copy("clubMergeCount_starts"), value: counts.mcvv_start },
      { label: copy("clubMergeCount_results"), value: counts.mcvv_time },
      { label: copy("clubMergeCount_moved"), value: counts.cisKlubMoved },
      { label: copy("clubMergeCount_dropped"), value: counts.cisKlubDropped },
      { label: copy("clubMergeCount_created"), value: counts.cisKlubCreated },
      { label: copy("clubMergeCount_rejected"), value: counts.rejectedPairs },
    ];
    return (
      <section
        id="nahled"
        className="mt-8 border-2 border-red-500/60 bg-red-500/5 p-4 text-sm"
        aria-labelledby="nahled-title"
      >
        <h2
          id="nahled-title"
          className="font-display text-2xl font-semibold text-foreground dark:text-white"
        >
          {copy("clubMergePreviewTitle", {
            merged: preview.otherId,
            mergedName: preview.otherName,
            main: preview.mainId,
            mainName: preview.mainName,
          })}
        </h2>
        <p className="mt-3 font-semibold text-red-600 dark:text-red-400">
          {copy("clubMergeIrreversible", { merged: preview.otherId, main: preview.mainId })}
        </p>
        <dl className="mt-4 grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-race-muted">{row.label}</dt>
              <dd className="text-right font-semibold tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
        {preview.moveYears.length > 0 ? (
          <p className="mt-3 text-race-muted">
            {copy("clubMergeMoveYears", {
              years: preview.moveYears.map((row) => `${row.year} ${row.name}`).join(" · "),
            })}
          </p>
        ) : null}
        {preview.dropYears.length > 0 ? (
          <p className="mt-2 font-semibold text-amber-600 dark:text-amber-400">
            {copy("clubMergeDropYears", {
              years: preview.dropYears
                .map((row) => `${row.year}: „${row.name}“ → „${row.mainName}“`)
                .join(" · "),
            })}
          </p>
        ) : null}
        {preview.createYears.length > 0 ? (
          <p className="mt-2 text-race-muted">
            {copy("clubMergeCreateYears", {
              years: preview.createYears.map((row) => row.year).join(", "),
              name: preview.createYears[0]?.name ?? "",
            })}
          </p>
        ) : null}
        <form action={confirmClubMerge} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="hlavni" value={preview.mainId} />
          <input type="hidden" name="sloucit" value={preview.otherId} />
          <label className="flex items-start gap-2">
            <input type="checkbox" name="nevratne" value="ano" required className="mt-1" />
            <span>
              {copy("clubMergeAcknowledge", { merged: preview.otherId, main: preview.mainId })}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <PendingSubmitButton
              variant="destructive"
              className="h-9"
              pendingLabel={copy("clubMergeWorking")}
            >
              {copy("clubMergeExecute", { merged: preview.otherId, main: preview.mainId })}
            </PendingSubmitButton>
            <Link
              href={{ pathname: "/admin/ciselniky/kluby/slouceni" }}
              className="inline-flex h-9 items-center border border-race-line px-3"
            >
              {copy("clubMergeCancel")}
            </Link>
          </div>
        </form>
      </section>
    );
  };

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
        <McvvAdminDictsSubnav
          backLabel={copy("dictsTitle")}
          label={copy("dictsClubs")}
          items={clubsSubnav(
            {
              list: copy("clubsSubnavList"),
              merge: copy("clubsSubnavMerge"),
              orphans: cleanup("title"),
            },
            canMerge,
            "merge",
          )}
        />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("clubMergeTitle")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("clubMergeIntro")}</p>
        {canMerge ? null : (
          <p className="mt-3 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {copy("clubMergeAdminOnly")}
          </p>
        )}
        <p className="mt-2 text-sm text-race-muted">
          {copy("clubMergeSummary", { clubs: usage.length })}
        </p>
        {query.ok === "merge" && query.hlavni_hotovo && query.sloucene ? (
          <section
            role="status"
            className="mt-6 border-2 border-emerald-600/60 bg-emerald-500/10 p-4 text-sm"
            data-testid="club-merge-done"
          >
            <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
              ✓ {copy("clubMergeDoneTitle")}
            </h2>
            <p className="mt-2">
              {copy("clubMergeDoneDetail", {
                merged: query.sloucene,
                mergedName: done?.mergedName ?? "?",
                main: query.hlavni_hotovo,
                mainName: resolver.profileName(query.hlavni_hotovo) || "?",
              })}
            </p>
            {done ? (
              <p className="mt-1 text-race-muted">{copy("clubMergeHistoryCounts", done.counts)}</p>
            ) : null}
            <p className="mt-1 text-race-muted">
              {copy("clubMergeDone", { main: query.hlavni_hotovo, merged: query.sloucene })}
            </p>
            <Link
              href={{
                pathname: "/kluby/[slug]",
                params: { slug: resolver.slug(query.hlavni_hotovo) },
              }}
              className="mt-2 inline-block text-sm font-semibold text-race-accent hover:underline"
            >
              {copy("clubMergeProfile")} {query.hlavni_hotovo}
            </Link>
          </section>
        ) : query.ok ? (
          <p
            role="status"
            className="mt-4 border border-race-accent/40 bg-race-accent/10 px-3 py-2 text-sm"
          >
            {copy("clubMergeSaved")}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            {copy(`clubMergeError_${error}`)}
          </p>
        ) : null}

        {preview ? renderPreview(preview) : null}

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
                    {canMerge ? (
                      <legend className="mb-1 text-xs font-semibold text-foreground">
                        {copy("clubMergeChooseMain")}
                      </legend>
                    ) : null}
                    {renderSide(s.a, "a")}
                    {renderSide(s.b, "b")}
                  </fieldset>
                  <div className="flex flex-wrap gap-2">
                    {canMerge ? (
                      <PendingSubmitButton formAction={previewClubMergeAction} className="h-9">
                        {copy("clubMergeConfirm")}
                      </PendingSubmitButton>
                    ) : null}
                    <PendingSubmitButton
                      formAction={rejectClubMerge}
                      formNoValidate
                      variant="outline"
                      className={outlineClass}
                    >
                      {copy("clubMergeReject")}
                    </PendingSubmitButton>
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
            scroll={false}
            className="mt-4 inline-flex h-9 items-center border border-race-line bg-race-surface px-3 text-sm font-semibold text-race-accent hover:underline"
            data-testid="club-merge-more"
          >
            <LinkPendingLabel>
              {copy("clubMergeMore", { count: filtered.length - shown.length })}
            </LinkPendingLabel>
          </Link>
        ) : null}

        {canMerge ? (
          <>
            <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
              {copy("clubMergeManual")}
            </h2>
            <p className="mt-2 text-sm text-race-muted">{copy("clubMergeManualHint")}</p>
            <form
              action={previewClubMergeAction}
              className="mt-3 flex flex-col gap-3 border border-race-line/55 bg-race-surface p-3"
              data-testid="club-merge-manual"
            >
              <McvvAdminMergePicker
                options={pickOptions}
                mainName="hlavni"
                otherName="sloucit"
                initialMain={query.hlavni ?? null}
                initialOther={query.sloucit ?? null}
                copy={{
                  main: copy("clubMergePickMain"),
                  other: copy("clubMergePickOther"),
                  swap: copy("clubMergePickSwap"),
                  hint: copy("clubMergePickHint"),
                  noResults: copy("clubMergePickNoResults"),
                  pickFromList: copy("clubMergePickFromList"),
                  same: copy("clubMergeError_same"),
                  profile: copy("clubMergeProfile"),
                }}
                testId="club-merge-picker"
              />
              <div>
                <PendingSubmitButton className="h-9">
                  {copy("clubMergePreview")}
                </PendingSubmitButton>
              </div>
            </form>
          </>
        ) : null}

        <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("clubMergeHistory")}
        </h2>
        <p className="mt-2 text-sm text-race-muted">
          {copy("clubMergeHistoryHint", { limit: CLUB_MERGE_HISTORY_LIMIT })}
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-race-muted">{copy("clubMergeHistoryEmpty")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table
              className="w-full min-w-[40rem] text-left text-sm"
              data-testid="club-merge-history"
            >
              <thead className="text-xs uppercase tracking-wide text-race-dim">
                <tr>
                  <th className="py-2 pr-3 font-semibold">{copy("clubMergeHistoryWhen")}</th>
                  <th className="py-2 pr-3 font-semibold">{copy("clubMergeHistoryWho")}</th>
                  <th className="py-2 pr-3 font-semibold">{copy("clubMergeHistoryWhat")}</th>
                  <th className="py-2 pr-3 font-semibold">{copy("clubMergeHistoryRows")}</th>
                  {isAdmin ? <th className="py-2 font-semibold" /> : null}
                </tr>
              </thead>
              <tbody>{history.map((entry) => renderHistoryRow(entry))}</tbody>
            </table>
          </div>
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
                    <PendingSubmitButton
                      variant="link"
                      className="h-auto p-0 text-xs text-race-accent"
                    >
                      {copy("clubMergeRestore")}
                    </PendingSubmitButton>
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
