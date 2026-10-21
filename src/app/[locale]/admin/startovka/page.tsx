import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import {
  applyStartListProposal,
  createStartGroup,
  deleteStartGroup,
  setStartBib,
  swapStartBibs,
  toggleStartLock,
} from "@/lib/admin/startlist";
import { requireStaff } from "@/lib/admin/staff";
import { getSiteSettings } from "@/lib/settings/site";
import { formatInterval } from "@/lib/race/start-settings";
import {
  checkStartList,
  outsideCategory,
  reserveSummary,
  type StartListIssue,
} from "@/lib/race/startlist-check";
import { generateStartList, type GeneratorWarning } from "@/lib/race/startlist-generator";
import { startListProposalLock } from "@/lib/race/startlist-proposal-lock";
import {
  buildGeneratorInput,
  inputFingerprint,
  latestEditionYear,
  loadAdminStartRows,
  loadStartGroups,
  loadStartSettings,
  type AdminStartRow,
} from "@/lib/race/startlist-load";
import { compareByStart, formatClock, startTimeForBib } from "@/lib/race/start-time";
import { cn, formatRaceTime } from "@/lib/utils";
import { Link, type Locale } from "@/i18n/routing";

type SearchParams = {
  rok?: string;
  navrh?: string;
  kat?: string;
  q?: string;
  razeni?: string;
  ok?: string;
  n?: string;
  chyba?: string;
  mimo?: string;
  bezec?: string;
  cislo?: string;
  drzi?: string;
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("navStartList") };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const card = "border border-race-line/55 bg-race-surface p-4 sm:p-5";
const cardTitle = "font-display text-lg font-semibold text-foreground dark:text-white";
const smallInput = "h-9 border border-race-line bg-race-surface px-2 text-sm";
const linkButton = "font-semibold text-race-accent hover:underline";
const outsideBadge =
  "ml-2 rounded-full border border-race-line px-1.5 text-[0.6875rem] font-normal text-race-muted";

export default async function AdminStartListPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const t = await getTranslations({ locale, namespace: "StartAdmin" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  const query = await searchParams;
  const parsedYear = Number.parseInt(query.rok ?? "", 10);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : await latestEditionYear();

  const [settings, allRows, groups, site] = await Promise.all([
    loadStartSettings(year),
    loadAdminStartRows(year),
    loadStartGroups(year),
    getSiteSettings(),
  ]);
  const { model, champions, ranges } = settings;
  const rows = allRows.filter((row) => !row.cancelled || row.bib != null);
  const byId = new Map(allRows.map((row) => [row.runnerId, row]));
  const nameOf = (id: string | undefined) => (id ? (byId.get(id)?.name ?? id) : "");
  const categoryName = new Map(settings.categories.map((c) => [c.id, c.name]));
  const rangeOf = new Map(ranges.map((r) => [r.categoryId, r]));
  const championBibs = new Set([champions.men, champions.women].filter((b) => b != null));

  const issues = checkStartList(model, allRows, groups);
  const reserve = reserveSummary(
    model,
    ranges,
    champions,
    allRows.filter((row) => !row.cancelled && row.bib != null).map((row) => row.bib!),
  );
  const valid = allRows.filter((row) => row.valid);
  const withBib = valid.filter((row) => row.bib != null).length;

  // Po zveřejnění je návrh zakázaný (UI i server action); náhled se ani nepočítá.
  const proposalLocked = startListProposalLock(site).locked;
  const showProposal = query.navrh === "1" && !proposalLocked;
  const input = showProposal ? await buildGeneratorInput(year, settings, allRows, groups) : null;
  const proposal = input ? generateStartList(input) : null;
  const fingerprint = input ? inputFingerprint(input) : "";

  // Filtr a řazení tabulky.
  const category = query.kat && rangeOf.has(query.kat) ? query.kat : "";
  const search = normalize((query.q ?? "").trim());
  const sortByTime = query.razeni === "cas";
  const visible = rows
    .filter((row) => !category || row.categoryId === category)
    .filter(
      (row) =>
        !search ||
        normalize(row.name).includes(search) ||
        normalize(row.clubName).includes(search) ||
        String(row.bib ?? "") === search,
    )
    .sort((a, b) => {
      if (a.bib == null || b.bib == null) {
        return (a.bib == null ? 1 : 0) - (b.bib == null ? 1 : 0) || a.name.localeCompare(b.name);
      }
      return sortByTime ? compareByStart(model, a.bib, b.bib) : a.bib - b.bib;
    });
  const groupOf = new Map<string, number>();
  for (const group of groups) {
    for (const id of group.memberIds) {
      groupOf.set(id, group.id);
    }
  }

  const issueText = (issue: StartListIssue): string => {
    switch (issue.code) {
      case "duplicate":
        return t("issueDuplicate", {
          bib: issue.bib,
          names: issue.runnerIds.map(nameOf).join(", "),
        });
      case "invalidWithBib":
        return t("issueInvalidWithBib", { bib: issue.bib, name: nameOf(issue.runnerId) });
      case "missingBib":
        return t("issueMissingBib", { name: nameOf(issue.runnerId) });
      case "groupSplit":
        return t("issueGroupSplit", { id: issue.groupId, kind: t(`kind_${issue.kind}`) });
    }
  };
  const warningText = (warning: GeneratorWarning): string => {
    switch (warning.code) {
      case "shortage":
        return t("warnShortage", warning);
      case "noRange":
        return t("warnNoRange", warning);
      case "lockedDuplicate":
        return t("warnLockedDuplicate", { bib: warning.bib });
      case "championTaken":
        return t("warnChampionTaken", { bib: warning.bib });
      case "organizerBlockFull":
        return t("warnOrganizerBlockFull", {
          series: warning.series,
          count: warning.runnerIds.length,
        });
      case "groupApprox":
        return t("warnGroupApprox", { id: warning.groupId, deviation: warning.deviation });
      case "groupLockedConflict":
        return t("warnGroupLockedConflict", { id: warning.groupId });
    }
  };

  const flash = (() => {
    switch (query.ok) {
      case "bib":
        return query.mimo === "1" ? t("okBibOutside") : t("okBib");
      case "swap":
        return t("okSwap");
      case "lock":
        return t("okLock");
      case "applied":
        return t("okApplied", { n: Number.parseInt(query.n ?? "0", 10) || 0 });
      case "group":
        return t("okGroup");
      case "groupDeleted":
        return t("okGroupDeleted");
      default:
        return null;
    }
  })();
  const error = (() => {
    switch (query.chyba) {
      case "bib":
        return t("errBib");
      case "duplicate":
        return t("errDuplicate", { bib: query.cislo ?? "", name: nameOf(query.drzi) });
      case "swap":
        return t("errSwap");
      case "swapEmpty":
        return t("errSwapEmpty");
      case "swapDuplicate":
        return t("errSwapDuplicate");
      case "stale":
        return t("errStale");
      case "blocking":
        return t("errBlocking");
      case "groupSize":
        return t("errGroupSize");
      case "published":
        return t("proposeLockedPublished");
      default:
        return null;
    }
  })();
  const duplicateRow = query.chyba === "duplicate" && query.bezec ? byId.get(query.bezec) : null;

  const yearLinks = [year - 1, year, year + 1];
  const editionLink = settings.editionId
    ? ({ pathname: "/admin/rocniky/[id]", params: { id: String(settings.editionId) } } as const)
    : ("/admin/rocniky" as const);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <McvvAdminHomeLink label={admin("title")} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("title", { year })}
          </h1>
          <a
            href={`/api/admin/startovka/pdf?rok=${year}&lang=${locale}`}
            className="inline-flex h-10 items-center bg-race-accent-solid px-4 font-display text-sm font-semibold text-white hover:bg-race-accent-solid-hover"
            data-testid="startlist-pdf"
          >
            {t("pdf")}
          </a>
        </div>
        <p className="mt-3 flex flex-wrap gap-3 text-sm">
          {yearLinks.map((value) => (
            <Link
              key={value}
              href={{ pathname: "/admin/startovka", query: { rok: String(value) } }}
              className={
                value === year
                  ? "font-semibold text-race-accent"
                  : "text-race-muted hover:text-foreground"
              }
            >
              {value}
            </Link>
          ))}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{t("intro")}</p>
        <p className="mt-3 text-sm text-foreground dark:text-white">
          {t("modelLine", {
            zero: formatClock(model.zeroSeconds),
            interval: model.intervalSeconds,
            second: model.secondStartFrom,
            men: champions.men ?? "—",
            women: champions.women ?? "—",
          })}{" "}
          ·{" "}
          <Link href={editionLink} className={linkButton}>
            {t("editModel")}
          </Link>
        </p>
        {!settings.editionId ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            {t("noEdition", { year })}
          </p>
        ) : null}
        <p className="mt-1 text-sm">
          <span
            className={
              site.startlistPublished
                ? "font-semibold text-emerald-700 dark:text-emerald-400"
                : "text-race-muted"
            }
          >
            {site.startlistPublished ? t("published") : t("unpublished")}
          </span>{" "}
          <Link href="/admin/nastaveni" className={linkButton}>
            {t("publishLink")}
          </Link>
        </p>
        <p className="mt-1 text-sm text-race-muted">
          {t("stats", { valid: valid.length, withBib, withoutBib: valid.length - withBib })}
        </p>

        {flash ? (
          <p
            role="status"
            className="mt-6 border-l-4 border-emerald-600 bg-emerald-600/10 px-3 py-2 text-sm"
          >
            {flash}
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center gap-3 border-l-4 border-red-600 bg-red-600/10 px-3 py-2 text-sm"
          >
            <span>{error}</span>
            {duplicateRow?.bib != null && query.cislo ? (
              <form action={swapStartBibs}>
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="bibA" value={duplicateRow.bib} />
                <input type="hidden" name="bibB" value={query.cislo} />
                <button type="submit" className={linkButton}>
                  {t("errDuplicateSwap")} ({duplicateRow.bib} ↔ {query.cislo})
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <section className={card} data-testid="startlist-reserve">
            <h2 className={cardTitle}>{t("reserveHeading")}</h2>
            <p className="mt-1 text-sm text-race-muted">{t("reserveHint")}</p>
            <ul className="mt-3 grid gap-1 text-sm">
              {reserve.map((item) => (
                <li key={item.series}>
                  <span className="font-semibold tabular-nums">
                    {t("reserveSeries", {
                      n: item.series,
                      ranges: item.intervals.map(formatInterval).join(", ") || "—",
                    })}
                  </span>
                  {item.used > 0 ? (
                    <span className="text-race-muted">
                      {" "}
                      · {t("reserveUsed", { count: item.used })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section className={card} data-testid="startlist-issues">
            <h2 className={cardTitle}>{t("issuesHeading")}</h2>
            {issues.length === 0 ? (
              <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
                {t("issuesNone")}
              </p>
            ) : (
              <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto text-sm">
                {issues.map((issue, index) => (
                  <li
                    key={index}
                    className={
                      issue.code === "duplicate"
                        ? "font-semibold text-red-700 dark:text-red-400"
                        : "text-amber-800 dark:text-amber-300"
                    }
                  >
                    {issueText(issue)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className={cn(card, "mt-4")} data-testid="startlist-proposal">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={cardTitle}>{t("proposalHeading")}</h2>
            {showProposal ? (
              <Link
                href={{ pathname: "/admin/startovka", query: { rok: String(year) } }}
                className="text-sm text-race-muted hover:underline"
              >
                {t("proposalCancel")}
              </Link>
            ) : (
              <form method="get">
                <input type="hidden" name="rok" value={year} />
                <input type="hidden" name="navrh" value="1" />
                <Button
                  type="submit"
                  disabled={proposalLocked}
                  aria-describedby={proposalLocked ? "startlist-propose-locked" : undefined}
                  data-testid="startlist-propose"
                  className="h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
                >
                  {t("proposeButton")}
                </Button>
              </form>
            )}
          </div>
          {proposalLocked ? (
            <p
              id="startlist-propose-locked"
              data-testid="startlist-propose-locked"
              className="mt-2 max-w-4xl border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-sm"
            >
              {t("proposeLockedPublished")}{" "}
              <Link href="/admin/nastaveni" className={linkButton}>
                {t("publishLink")}
              </Link>
            </p>
          ) : null}
          <p className="mt-1 max-w-4xl text-sm leading-6 text-race-muted">{t("proposeHint")}</p>
          {proposal ? (
            <div className="mt-4 grid gap-4">
              {proposal.warnings.length > 0 ? (
                <ul className="grid gap-1 border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-sm">
                  {proposal.warnings.map((warning, index) => (
                    <li key={index}>{warningText(warning)}</li>
                  ))}
                </ul>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                      <th className="py-2 pr-3">{t("colCategory")}</th>
                      <th className="py-2 pr-3">{t("colRange")}</th>
                      <th className="py-2 pr-3">{t("colTimes")}</th>
                      <th className="py-2 pr-3">{t("colRunners")}</th>
                      <th className="py-2 pr-3">{t("colSlots")}</th>
                      <th className="py-2">{t("colAssigned")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.categories.map((row) => (
                      <tr
                        key={row.categoryId}
                        className={cn(
                          "border-b border-race-line/40",
                          row.runners > row.slots && "text-red-700 dark:text-red-400",
                        )}
                      >
                        <td className="py-1.5 pr-3">
                          <span className="font-semibold">{row.categoryId}</span>{" "}
                          {categoryName.get(row.categoryId)}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {row.bibFrom}–{row.bibTo}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums text-race-muted">
                          {startTimeForBib(model, row.bibFrom)} –{" "}
                          {startTimeForBib(model, row.bibTo)}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">{row.runners}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{row.slots}</td>
                        <td className="py-1.5 tabular-nums">{row.assigned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {proposal.changed === 0 ? (
                <p className="text-sm text-race-muted">{t("proposalNoChange")}</p>
              ) : (
                <>
                  <p className="text-sm font-semibold">
                    {t("proposalSummary", { changed: proposal.changed })}
                  </p>
                  <div className="max-h-96 overflow-auto border border-race-line/40">
                    <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-race-surface">
                        <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                          <th className="px-2 py-2">{t("colName")}</th>
                          <th className="px-2 py-2">{t("colCategory")}</th>
                          <th className="px-2 py-2">{t("colChange")}</th>
                          <th className="px-2 py-2">{t("colTime")}</th>
                          <th className="px-2 py-2">{t("colReason")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proposal.lines
                          .filter((line) => line.bib !== line.previousBib)
                          .sort(
                            (a, b) =>
                              (a.bib ?? 99999) - (b.bib ?? 99999) ||
                              nameOf(a.runnerId).localeCompare(nameOf(b.runnerId)),
                          )
                          .map((line) => (
                            <tr key={line.runnerId} className="border-b border-race-line/30">
                              <td className="px-2 py-1">{nameOf(line.runnerId)}</td>
                              <td className="px-2 py-1">{byId.get(line.runnerId)?.categoryId}</td>
                              <td className="px-2 py-1 tabular-nums">
                                {line.previousBib ?? "—"} → <strong>{line.bib ?? "—"}</strong>
                              </td>
                              <td className="px-2 py-1 tabular-nums">
                                {startTimeForBib(model, line.bib)}
                              </td>
                              <td className="px-2 py-1 text-race-muted">
                                {t(`reason_${line.reason}`)}
                                {line.outsideCategory ? (
                                  <span className={outsideBadge}>{t("outsideBadge")}</span>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {proposal.blocking ? (
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                      {t("proposalBlocked")}
                    </p>
                  ) : (
                    <form action={applyStartListProposal}>
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="fingerprint" value={fingerprint} />
                      <Button
                        type="submit"
                        className="h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
                      >
                        {t("proposalApply")}
                      </Button>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : null}
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className={card}>
            <h2 className={cardTitle}>{t("swapHeading")}</h2>
            <form action={swapStartBibs} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="year" value={year} />
              <label className="grid gap-1 text-sm">
                <span className="text-race-muted">{t("swapA")}</span>
                <input
                  name="bibA"
                  type="number"
                  min={1}
                  required
                  className={cn(smallInput, "w-24")}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-race-muted">{t("swapB")}</span>
                <input
                  name="bibB"
                  type="number"
                  min={1}
                  required
                  className={cn(smallInput, "w-24")}
                />
              </label>
              <Button type="submit" variant="outline" className="h-9 border-race-line">
                {t("swapButton")}
              </Button>
            </form>
            <p className="mt-2 text-xs text-race-muted">{t("swapHint")}</p>
          </section>
          <section className={card} data-testid="startlist-groups">
            <h2 className={cardTitle}>{t("groupsHeading")}</h2>
            <p className="mt-1 text-sm text-race-muted">{t("groupsHint")}</p>
            {groups.length === 0 ? (
              <p className="mt-2 text-sm text-race-muted">{t("groupsEmpty")}</p>
            ) : (
              <ul className="mt-3 grid gap-2 text-sm">
                {groups.map((group) => (
                  <li key={group.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">
                      {t("groupLabel", { id: group.id })} · {t(`kind_${group.kind}`)}
                    </span>
                    <span>
                      {group.memberIds
                        .map((id) => {
                          const row = byId.get(id);
                          return row
                            ? `${row.name} (${row.bib ?? "—"}${row.bib ? `, ${startTimeForBib(model, row.bib)}` : ""})`
                            : id;
                        })
                        .join(" + ")}
                    </span>
                    {group.note ? <span className="text-race-muted">{group.note}</span> : null}
                    <form action={deleteStartGroup}>
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="groupId" value={group.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-700 hover:underline dark:text-red-400"
                      >
                        {t("groupDelete")}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form
              id="group-form"
              action={createStartGroup}
              className="mt-3 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="year" value={year} />
              <label className="grid gap-1 text-sm">
                <span className="text-race-muted">{t("groupKind")}</span>
                <select name="kind" className={smallInput} defaultValue="joint">
                  <option value="joint">{t("kind_joint")}</option>
                  <option value="consecutive">{t("kind_consecutive")}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-race-muted">{t("groupNote")}</span>
                <input name="note" maxLength={200} className={cn(smallInput, "w-48")} />
              </label>
              <Button type="submit" variant="outline" className="h-9 border-race-line">
                {t("groupCreate")}
              </Button>
            </form>
          </section>
        </div>

        <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
          <input type="hidden" name="rok" value={year} />
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{t("filterCategory")}</span>
            <select
              name="kat"
              defaultValue={category}
              className="h-10 border border-race-line bg-race-surface px-2"
            >
              <option value="">{t("filterAll")}</option>
              {settings.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} – {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{t("filterSearch")}</span>
            <input
              name="q"
              defaultValue={query.q ?? ""}
              className="h-10 w-56 border border-race-line bg-race-surface px-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{t("sortBy")}</span>
            <select
              name="razeni"
              defaultValue={sortByTime ? "cas" : "cislo"}
              className="h-10 border border-race-line bg-race-surface px-2"
            >
              <option value="cislo">{t("sortBib")}</option>
              <option value="cas">{t("sortTime")}</option>
            </select>
          </label>
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
            {t("filter")}
          </Button>
          <span className="text-sm text-race-muted">
            {t("shown", { count: visible.length, total: rows.length })}
          </span>
        </form>

        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-race-muted">{t("empty")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table
              className="w-full min-w-[72rem] border-collapse text-left text-sm"
              data-testid="startlist-admin-table"
            >
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-2" title={t("colSelect")}>
                    ✓
                  </th>
                  <th className="py-2 pr-3">{t("colBib")}</th>
                  <th className="py-2 pr-3">{t("colTime")}</th>
                  <th className="py-2 pr-3">{t("colName")}</th>
                  <th className="py-2 pr-3">{t("colBirth")}</th>
                  <th className="py-2 pr-3">{t("colClub")}</th>
                  <th className="py-2 pr-3">{t("colRegistration")}</th>
                  <th className="py-2 pr-3">{t("colCategory")}</th>
                  <th className="py-2 pr-3">{t("colLastYear")}</th>
                  <th className="py-2 pr-3">{t("colBest")}</th>
                  <th className="py-2 pr-3">{t("colLock")}</th>
                  <th className="py-2">{t("colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <StartRow
                    key={row.runnerId}
                    row={row}
                    year={year}
                    time={startTimeForBib(model, row.bib)}
                    highlighted={query.bezec === row.runnerId}
                    groupId={groupOf.get(row.runnerId) ?? null}
                    champion={row.bib != null && championBibs.has(row.bib)}
                    outside={!row.cancelled && outsideCategory(model, ranges, champions, row)}
                    labels={{
                      save: t("save"),
                      lock: t("lock"),
                      unlock: t("unlock"),
                      lockedTitle: t("lockedTitle"),
                      invalidTitle: t("invalidTitle"),
                      organizer: t("organizerBadge"),
                      champion: t("championBadge"),
                      outside: t("outsideBadge"),
                      outsideTitle: t("outsideTitle", {
                        range: rangeOf.get(row.categoryId)
                          ? `${rangeOf.get(row.categoryId)!.bibFrom}–${rangeOf.get(row.categoryId)!.bibTo}`
                          : "—",
                      }),
                      group: (id) => t("groupLabel", { id }),
                      select: t("colSelect"),
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function StartRow({
  row,
  year,
  time,
  highlighted,
  groupId,
  champion,
  outside,
  labels,
}: {
  row: AdminStartRow;
  year: number;
  time: string;
  highlighted: boolean;
  groupId: number | null;
  champion: boolean;
  outside: boolean;
  labels: {
    save: string;
    lock: string;
    unlock: string;
    lockedTitle: string;
    invalidTitle: string;
    organizer: string;
    champion: string;
    outside: string;
    outsideTitle: string;
    group: (id: number) => string;
    select: string;
  };
}) {
  const note = [row.note, row.registrationNote].filter(Boolean).join(" · ");
  return (
    <tr
      id={row.runnerId}
      className={cn(
        "border-b border-race-line/40 align-middle",
        highlighted && "bg-race-accent/10",
        row.cancelled && "opacity-60",
      )}
    >
      <td className="py-1.5 pr-2">
        <input
          type="checkbox"
          name="member"
          value={row.runnerId}
          form="group-form"
          aria-label={`${labels.select} ${row.name}`}
        />
      </td>
      <td className="py-1.5 pr-3">
        <form action={setStartBib} className="flex items-center gap-1">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="runnerId" value={row.runnerId} />
          <input
            name="bib"
            type="number"
            min={0}
            max={9999}
            defaultValue={row.bib ?? ""}
            aria-label={`${row.name}`}
            className={cn(
              "h-8 w-[4.5rem] border bg-race-surface px-1.5 text-right font-semibold tabular-nums",
              row.locked ? "border-race-accent" : "border-race-line",
            )}
          />
          <button
            type="submit"
            className="px-1 text-xs font-semibold text-race-accent hover:underline"
          >
            {labels.save}
          </button>
        </form>
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-race-muted">{time}</td>
      <td
        className={cn("py-1.5 pr-3 font-medium", !row.valid && "text-red-600 dark:text-red-400")}
        title={!row.valid ? labels.invalidTitle : undefined}
      >
        {row.name}
        {row.organizer ? (
          <span className="ml-2 rounded-full border border-race-line px-1.5 text-[0.6875rem] font-normal text-race-muted">
            {labels.organizer}
          </span>
        ) : null}
        {champion ? (
          <span className="ml-2 rounded-full bg-red-600/15 px-1.5 text-[0.6875rem] font-semibold text-red-700 dark:text-red-300">
            {labels.champion}
          </span>
        ) : null}
        {outside ? (
          <span className={outsideBadge} title={labels.outsideTitle}>
            {labels.outside}
          </span>
        ) : null}
        {groupId ? (
          <span className="ml-2 rounded-full bg-race-accent/15 px-1.5 text-[0.6875rem] font-semibold text-race-accent">
            {labels.group(groupId)}
          </span>
        ) : null}
      </td>
      <td className="py-1.5 pr-3 text-race-muted">{row.birthYear}</td>
      <td className="py-1.5 pr-3 text-race-muted">{row.clubName}</td>
      <td className="py-1.5 pr-3">
        <Link
          href={{
            pathname: "/admin/prihlasky/[rok]/[id]",
            params: { rok: String(year), id: String(row.registrationId) },
          }}
          className="text-race-accent hover:underline"
        >
          {row.registrationId}
        </Link>
      </td>
      <td className="py-1.5 pr-3">{row.categoryId}</td>
      <td className="py-1.5 pr-3 tabular-nums text-race-muted">
        {row.lastYearTime != null ? formatRaceTime(row.lastYearTime) : ""}
      </td>
      <td className="py-1.5 pr-3 tabular-nums text-race-muted">
        {row.personalBest != null ? formatRaceTime(row.personalBest) : ""}
      </td>
      <td className="py-1.5 pr-3">
        <form action={toggleStartLock}>
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="runnerId" value={row.runnerId} />
          <input type="hidden" name="locked" value={row.locked ? "0" : "1"} />
          <button
            type="submit"
            title={row.locked ? labels.lockedTitle : undefined}
            className={cn(
              "text-xs hover:underline",
              row.locked ? "font-semibold text-race-accent" : "text-race-muted",
            )}
          >
            {row.locked ? `🔒 ${labels.unlock}` : labels.lock}
          </button>
        </form>
      </td>
      <td className="max-w-[16rem] truncate py-1.5 text-xs text-race-muted" title={note}>
        {note}
      </td>
    </tr>
  );
}

export const dynamic = "force-dynamic";
