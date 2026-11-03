import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LinkPendingLabel } from "@/components/molecules/link-pending-label";
import { PendingSubmitButton } from "@/components/molecules/pending-submit-button";
import {
  McvvAdminDictsSubnav,
  runnersSubnav,
} from "@/components/organisms/mcvv-admin-dicts-subnav";
import { McvvAdminMergePicker } from "@/components/organisms/mcvv-admin-merge-picker";
import { Link, type Locale } from "@/i18n/routing";
import type { MergePickOption } from "@/lib/admin/merge-pick";
import { previewRunnerMerge, type RunnerMergePreview } from "@/lib/admin/runner-merge";
import { mergeRunnersAction, previewRunnerMergeAction } from "@/lib/admin/runner-merge-actions";
import {
  RUNNER_MERGE_HISTORY_LIMIT,
  RUNNER_MERGE_SUGGESTIONS_PAGE,
  RUNNER_MERGE_TABLES,
  runnerDuplicateSuggestions,
  type RunnerMergeConflict,
  type RunnerMergeHistoryEntry,
} from "@/lib/admin/runner-merge-core";
import {
  loadRunnerMergeHistory,
  loadRunnerMergeIndex,
  type RunnerMergeIndexRow,
} from "@/lib/admin/runner-merge-index";
import { birthYearOf, runnerSexOf } from "@/lib/admin/runner-sex-core";
import { requireAdmin } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format/date";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    /** Náhled: hlavní (zůstává) a slučovaný (zmizí) běžec. */
    hlavni?: string;
    sloucit?: string;
    chyba?: string;
    /** Po sloučení: id, které zmizelo, a hlavní id. */
    slouceno?: string;
    do?: string;
    /** Počet zobrazených návrhů (po 10). */
    pocet?: string;
  }>;
}>;

const PATHNAME = "/admin/ciselniky/bezci/slouceni" as const;
const ERRORS = ["confirm", "failed", "same", "not_found", "conflict"] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AdminRunnerMerge" });
  return { title: t("title") };
}

function yearsLabel(years: readonly number[]): string {
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const year of [...sorted.slice(1), Number.NaN]) {
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

export default async function AdminRunnerMergePage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const [copy, admin, runners] = await Promise.all([
    getTranslations({ locale, namespace: "AdminRunnerMerge" }),
    getTranslations({ locale, namespace: "Admin" }),
    getTranslations({ locale, namespace: "AdminRunners" }),
  ]);
  const query = await searchParams;
  const limit = Math.max(
    RUNNER_MERGE_SUGGESTIONS_PAGE,
    Number.parseInt(query.pocet ?? "", 10) || RUNNER_MERGE_SUGGESTIONS_PAGE,
  );

  const [index, history, preview] = await Promise.all([
    loadRunnerMergeIndex(),
    loadRunnerMergeHistory(),
    query.hlavni && query.sloucit && !query.slouceno
      ? previewRunnerMerge(prisma, query.hlavni, query.sloucit)
      : Promise.resolve(null),
  ]);
  const byId = new Map(index.map((runner) => [runner.id, runner]));
  const suggestions = runnerDuplicateSuggestions(index);
  const shown = suggestions.slice(0, limit);
  const error = ERRORS.find(
    (value) => value === query.chyba || (preview && !preview.ok && preview.error === value),
  );
  const done =
    query.slouceno && query.do
      ? (history.find((entry) => entry.otherId === query.slouceno && entry.mainId === query.do) ??
        null)
      : null;

  const sexLabel = (id: string) => copy(runnerSexOf(id) === "F" ? "sexF" : "sexM");
  const runnerMeta = (runner: Pick<RunnerMergeIndexRow, "id" | "years" | "results">) =>
    copy("meta", {
      birthYear: birthYearOf(runner.id),
      sex: sexLabel(runner.id),
      years: runner.years.length,
      results: runner.results,
    });
  const runnerLines = (runner: RunnerMergeIndexRow) => [
    runnerMeta(runner),
    copy("years", { years: yearsLabel(runner.years) }),
  ];

  /** Nabídka ručního výběru: hledání podle jména i id. */
  const pickOptions: MergePickOption[] = index.map((runner) => ({
    id: runner.id,
    label: runner.name,
    meta: runnerMeta(runner),
    card: {
      title: runner.name,
      lines: runnerLines(runner),
      href: `/${locale}/bezec/${runner.id}`,
    },
  }));

  const tableLabel = (table: string) => copy(`table_${table}`);

  const renderCard = (id: string, role: "main" | "other") => {
    const runner = byId.get(id);
    return (
      <div
        key={role}
        className={`flex flex-1 flex-col gap-1 border p-3 ${role === "main" ? "border-emerald-600/60 bg-emerald-500/5" : "border-red-500/50 bg-red-500/5"}`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-race-dim">
          {copy(role === "main" ? "roleMain" : "roleOther")}
        </span>
        <span>
          <b className="font-mono">{id}</b> · <b>{runner?.name ?? "?"}</b>
        </span>
        {runner ? (
          <ul className="text-xs text-race-muted">
            {runnerLines(runner).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <Link
          href={{ pathname: "/bezec/[id]", params: { id } }}
          className="text-xs font-semibold text-race-accent hover:underline"
        >
          {copy("profile")}
        </Link>
      </div>
    );
  };

  const renderConflicts = (conflicts: RunnerMergeConflict[]) => (
    <div
      className="mt-4 border border-red-500/50 bg-red-500/10 p-3"
      data-testid="runner-merge-conflict"
    >
      <p className="font-semibold text-red-600 dark:text-red-400">{copy("conflictTitle")}</p>
      <ul className="mt-2 list-disc pl-5">
        {conflicts.map((conflict) => (
          <li key={conflict.year}>
            {copy("conflictYear", {
              year: conflict.year,
              main: conflict.main.map(tableLabel).join(", "),
              other: conflict.other.map(tableLabel).join(", "),
            })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-race-muted">{copy("conflictHint")}</p>
    </div>
  );

  /** Náhled: obě karty, co se přepíše, varování; při konfliktu jen chyba bez tlačítka. */
  const renderPreview = (result: RunnerMergePreview, mainId: string, otherId: string) => (
    <section
      id="nahled"
      className="mt-8 border-2 border-red-500/60 bg-red-500/5 p-4 text-sm"
      aria-labelledby="nahled-title"
      data-testid="runner-merge-preview"
    >
      <h2
        id="nahled-title"
        className="font-display text-2xl font-semibold text-foreground dark:text-white"
      >
        {copy("previewTitle", {
          other: otherId,
          otherName: result.other?.name ?? "?",
          main: mainId,
          mainName: result.main?.name ?? "?",
        })}
      </h2>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {renderCard(otherId, "other")}
        <span className="self-center text-2xl text-race-dim" aria-hidden>
          →
        </span>
        {renderCard(mainId, "main")}
      </div>
      {result.ok ? (
        <>
          <p className="mt-4 font-semibold text-red-600 dark:text-red-400">
            {copy("irreversible", { other: otherId, main: mainId })}
          </p>
          {RUNNER_MERGE_TABLES.some((table) => result.plan.counts[table] > 0) ? (
            <dl className="mt-4 grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1">
              {RUNNER_MERGE_TABLES.filter((table) => result.plan.counts[table] > 0).map((table) => (
                <div key={table} className="contents">
                  <dt className="text-race-muted">{tableLabel(table)}</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {result.plan.counts[table]}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-race-muted">{copy("nothingToMove")}</p>
          )}
          {result.plan.droppedPhotoTags.length > 0 ? (
            <p className="mt-2 text-race-muted">
              {copy("droppedPhotoTags", { count: result.plan.droppedPhotoTags.length })}
            </p>
          ) : null}
          {result.plan.nationality ? (
            <p className="mt-2 text-race-muted">
              {copy("nationalityFill", { nationality: result.plan.nationality })}
            </p>
          ) : null}
          {result.plan.warnings.length > 0 ? (
            <ul
              className="mt-3 flex flex-col gap-1 font-semibold text-amber-600 dark:text-amber-400"
              data-testid="runner-merge-warnings"
            >
              {result.plan.warnings.map((warning) => (
                <li key={warning}>
                  ⚠{" "}
                  {copy(`warning_${warning}`, {
                    mainName: result.main?.name ?? "",
                    otherName: result.other?.name ?? "",
                    mainSex: sexLabel(mainId),
                    otherSex: sexLabel(otherId),
                    mainYear: birthYearOf(mainId),
                    otherYear: birthYearOf(otherId),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          <form action={mergeRunnersAction} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="main" value={mainId} />
            <input type="hidden" name="other" value={otherId} />
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirm" value="1" required className="mt-1" />
              <span>{copy("acknowledge", { other: otherId, main: mainId })}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <PendingSubmitButton
                variant="destructive"
                className="h-9"
                pendingLabel={copy("working")}
              >
                {copy("execute", { other: otherId, main: mainId })}
              </PendingSubmitButton>
              <Link
                href={{ pathname: PATHNAME }}
                className="inline-flex h-9 items-center border border-race-line px-3"
              >
                {copy("cancel")}
              </Link>
            </div>
          </form>
        </>
      ) : result.error === "conflict" ? (
        renderConflicts(result.conflicts)
      ) : null}
    </section>
  );

  const auditDay = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(date);

  const renderHistoryRow = (entry: RunnerMergeHistoryEntry) => (
    <tr key={entry.id} className="border-t border-race-line/55 align-top">
      <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(entry.at, locale)}</td>
      <td className="py-2 pr-3 break-all">{entry.actor}</td>
      <td className="py-2 pr-3">
        <span className="font-mono">{entry.otherId}</span>
        {entry.otherName ? ` ${entry.otherName}` : ""} →{" "}
        <span className="font-mono">{entry.mainId}</span>
        {entry.mainName ? ` ${entry.mainName}` : ""}
      </td>
      <td className="py-2 pr-3 text-race-muted tabular-nums">{entry.rows}</td>
      <td className="py-2 whitespace-nowrap">
        <Link
          href={{
            pathname: "/admin/audit",
            query: {
              akce: "runner.merge",
              cil: `runner:${entry.mainId}`,
              od: auditDay(entry.at),
              do: auditDay(entry.at),
            },
          }}
          className="text-xs font-semibold text-race-accent hover:underline"
        >
          {copy("historyAudit")}
        </Link>
      </td>
    </tr>
  );

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminDictsSubnav
          backLabel={admin("dictsTitle")}
          label={runners("title")}
          items={runnersSubnav(
            {
              search: runners("subnavSearch"),
              merge: runners("subnavMerge"),
              orphans: runners("subnavOrphans"),
            },
            "merge",
          )}
        />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>

        {query.slouceno && query.do ? (
          <section
            role="status"
            className="mt-6 border-2 border-emerald-600/60 bg-emerald-500/10 p-4 text-sm"
            data-testid="runner-merge-done"
          >
            <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
              ✓ {copy("doneTitle")}
            </h2>
            <p className="mt-2">
              {copy("doneDetail", {
                other: query.slouceno,
                otherName: done?.otherName ?? "?",
                main: query.do,
                mainName: byId.get(query.do)?.name ?? done?.mainName ?? "?",
                rows: done?.rows ?? 0,
              })}
            </p>
            <Link
              href={{ pathname: "/bezec/[id]", params: { id: query.do } }}
              className="mt-2 inline-block text-sm font-semibold text-race-accent hover:underline"
            >
              {copy("profile")} {query.do}
            </Link>
          </section>
        ) : null}
        {error && error !== "conflict" ? (
          <p
            className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
            data-testid="runner-merge-error"
          >
            {copy(`error_${error}`)}
          </p>
        ) : null}

        {preview && query.hlavni && query.sloucit && !(!preview.ok && preview.error === "same")
          ? renderPreview(preview, query.hlavni, query.sloucit)
          : null}

        <h2 className="mt-10 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("manual")}
        </h2>
        <p className="mt-2 text-sm text-race-muted">{copy("manualHint")}</p>
        <form
          action={previewRunnerMergeAction}
          className="mt-3 flex flex-col gap-3 border border-race-line/55 bg-race-surface p-3"
          data-testid="runner-merge-manual"
        >
          <McvvAdminMergePicker
            options={pickOptions}
            mainName="main"
            otherName="other"
            initialMain={query.slouceno ? null : (query.hlavni ?? null)}
            initialOther={query.slouceno ? null : (query.sloucit ?? null)}
            copy={{
              main: copy("pickMain"),
              other: copy("pickOther"),
              swap: copy("pickSwap"),
              hint: copy("pickHint"),
              noResults: copy("pickNoResults"),
              pickFromList: copy("pickFromList"),
              same: copy("error_same"),
              profile: copy("profile"),
            }}
            testId="runner-merge-picker"
          />
          <div>
            <PendingSubmitButton className="h-9">{copy("preview")}</PendingSubmitButton>
          </div>
        </form>

        <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("suggestions", { count: suggestions.length })}
        </h2>
        <p className="mt-2 text-sm text-race-muted">{copy("suggestionsHint")}</p>
        {suggestions.length === 0 ? (
          <p className="mt-3 text-sm text-race-muted">{copy("suggestionsEmpty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2" data-testid="runner-merge-suggestions">
            {shown.map(({ main, other }) => {
              const mainRow = byId.get(main.id);
              const otherRow = byId.get(other.id);
              return (
                <li
                  key={`${main.id}|${other.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-race-line/55 bg-race-surface p-3 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <b>{main.name}</b>
                    <span className="block text-xs text-race-muted">
                      <span className="font-mono">{other.id}</span>
                      {otherRow
                        ? ` (${runnerMeta(otherRow)}; ${yearsLabel(otherRow.years)})`
                        : ""}{" "}
                      → <span className="font-mono">{main.id}</span>
                      {mainRow ? ` (${runnerMeta(mainRow)}; ${yearsLabel(mainRow.years)})` : ""}
                    </span>
                  </span>
                  <Link
                    href={{
                      pathname: PATHNAME,
                      query: {
                        hlavni: main.id,
                        sloucit: other.id,
                        ...(limit > RUNNER_MERGE_SUGGESTIONS_PAGE ? { pocet: String(limit) } : {}),
                      },
                      hash: "nahled",
                    }}
                    className="inline-flex h-9 items-center border border-race-line px-3 font-semibold text-race-accent hover:underline"
                  >
                    <LinkPendingLabel>{copy("suggestionPreview")}</LinkPendingLabel>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {suggestions.length > shown.length ? (
          <Link
            href={{
              pathname: PATHNAME,
              query: { pocet: String(limit + RUNNER_MERGE_SUGGESTIONS_PAGE) },
            }}
            scroll={false}
            className="mt-4 inline-flex h-9 items-center border border-race-line bg-race-surface px-3 text-sm font-semibold text-race-accent hover:underline"
            data-testid="runner-merge-more"
          >
            <LinkPendingLabel>
              {copy("more", { count: suggestions.length - shown.length })}
            </LinkPendingLabel>
          </Link>
        ) : null}

        <h2 className="mt-12 font-display text-2xl font-semibold text-foreground dark:text-white">
          {copy("history")}
        </h2>
        <p className="mt-2 text-sm text-race-muted">
          {copy("historyHint", { limit: RUNNER_MERGE_HISTORY_LIMIT })}
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-race-muted">{copy("historyEmpty")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table
              className="w-full min-w-[40rem] text-left text-sm"
              data-testid="runner-merge-history"
            >
              <thead className="text-xs uppercase tracking-wide text-race-dim">
                <tr>
                  <th className="py-2 pr-3 font-semibold">{copy("historyWhen")}</th>
                  <th className="py-2 pr-3 font-semibold">{copy("historyWho")}</th>
                  <th className="py-2 pr-3 font-semibold">{copy("historyWhat")}</th>
                  <th className="py-2 pr-3 font-semibold">{copy("historyRows")}</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>{history.map((entry) => renderHistoryRow(entry))}</tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
