import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { ConfirmSubmitButton } from "@/components/molecules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, type Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/staff";
import { formatDateTime } from "@/lib/format/date";
import { clearSplitsAction, deleteSplitAction, setSplitAction } from "@/lib/live/admin-actions";
import { OUTCOME_LABELS_CS } from "@/lib/live/admin-core";
import { previewClear } from "@/lib/live/clear";
import {
  clearableSplits,
  clearBlocked,
  formatClearSource,
  parseClearFilter,
  type ClearFilter,
} from "@/lib/live/clear-core";
import { raceDayOverview } from "@/lib/live/ingest";
import { loadSplitTable, type SplitTableRow } from "@/lib/live/manual";
import { MANUAL_REASON_MAX, orderProblems } from "@/lib/live/manual-core";
import { formatRaceTime } from "@/lib/live/start-time";
import { prisma } from "@/lib/db/client";
import { getRaceContext, getStations } from "@/lib/live/race-context";
import { FINISH_SPLIT } from "@/lib/live/stations";
import { listDeviceTokens } from "@/lib/live/tokens";

type SearchParams = {
  splits?: string | string[];
  source?: string;
  preview?: string;
  error?: string;
  cleared?: string;
  entries?: string;
  tokens?: string;
  q?: string;
  all?: string;
  edit?: string;
  saved?: string;
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "LiveSplits" });
  return { title: t("title") };
}

const box = "grid gap-4 border border-race-line/60 bg-race-surface/40 p-4";
const legend = "px-1 font-display text-lg font-semibold";
const selectClass = "h-10 w-fit border border-race-line bg-race-surface px-2 text-sm";

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function LiveSplitsPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const sp = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations({ locale, namespace: "LiveSplits" });
  const live = await getTranslations({ locale, namespace: "LiveResults" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  const ctx = await getRaceContext();
  const editBib = /^\d{1,3}$/.test(sp.edit ?? "") ? Number(sp.edit) : null;
  const [stations, tokens, overview, table, history] = await Promise.all([
    getStations(),
    listDeviceTokens(ctx.year),
    raceDayOverview(ctx.year),
    loadSplitTable(ctx.year),
    editBib
      ? prisma.splitEntry.findMany({
          where: { year: ctx.year, bib: editBib },
          orderBy: { id: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);
  const now = new Date();
  const fmt = (date: Date | null | undefined) => (date ? formatDateTime(date, locale) : "–");
  const splitCodes = clearableSplits(stations);
  const stationName = (code: string) =>
    code === FINISH_SPLIT ? live("finish") : (stations.find((s) => s.code === code)?.label ?? code);
  const blocked = clearBlocked(now, ctx.officialZero);
  const query = (sp.q ?? "").trim().toLowerCase();
  const visible = table.filter((row) => {
    if (query) {
      return String(row.bib) === query || (row.name ?? "").toLowerCase().includes(query);
    }
    return sp.all === "1" || Object.keys(row.cells).length > 0;
  });
  const editRow: SplitTableRow | null =
    editBib === null
      ? null
      : (table.find((row) => row.bib === editBib) ?? {
          bib: editBib,
          name: null,
          categoryId: null,
          known: false,
          cells: {},
        });
  const problemsOf = (row: SplitTableRow) =>
    orderProblems(Object.fromEntries(Object.entries(row.cells).map(([k, c]) => [k, c.time])));
  const sourceBadge = (source: string | null) =>
    source === "admin"
      ? t("badgeManual")
      : source === "obd"
        ? "OBD"
        : source === "web"
          ? "web"
          : t("badgeLegacy");

  const requested: ClearFilter | null =
    sp.preview || sp.splits || sp.source
      ? parseClearFilter({ splits: asList(sp.splits), source: sp.source }, splitCodes)
      : null;
  const preview =
    sp.preview && requested && !blocked ? await previewClear(ctx.year, requested) : null;
  const sourceValue = requested ? formatClearSource(requested.source) : "all";
  const sourceLabel = (value: string) => {
    if (value === "all") return t("sourceAll");
    if (value === "web") return t("sourceWeb");
    if (value === "obd") return t("sourceObd");
    if (value === "admin") return t("sourceAdmin");
    const id = Number(value.split(":")[1]);
    const token = tokens.find((row) => row.id === id);
    return t("sourceToken", { label: token ? `${token.label} (${token.prefix}…)` : `#${id}` });
  };

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div>
          <McvvAdminHomeLink label={admin("title")} />
          <McvvTestRunBanner locale={locale} leftovers className="mb-4" />
          <p className="mt-2 text-sm">
            <Link href="/admin/den-zavodu/zive" className="text-race-accent hover:underline">
              ← {live("title")}
            </Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("heading", { year: ctx.year })}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-race-muted">
            {t("intro", { zero: fmt(ctx.officialZero) })}
          </p>
          {sp.error ? (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {t(`error.${sp.error}` as never)}
            </p>
          ) : sp.saved ? (
            <p role="status" className="mt-4 text-sm text-race-accent" data-testid="edit-result">
              {t(`saved.${sp.saved}` as never)}
            </p>
          ) : sp.cleared !== undefined ? (
            <p role="status" className="mt-4 text-sm text-race-accent" data-testid="clear-result">
              {t("clearDone", {
                splits: Number(sp.cleared) || 0,
                entries: Number(sp.entries) || 0,
                tokens: Number(sp.tokens) || 0,
              })}
            </p>
          ) : null}
        </div>

        <fieldset className={box}>
          <legend className={legend}>{live("splitsTitle")}</legend>
          <dl className="grid grid-cols-3 gap-3 text-center" data-testid="split-counts">
            {splitCodes.map((code) => (
              <div key={code} className="border border-race-line/50 bg-race-surface p-3">
                <dt className="text-xs text-race-muted">{stationName(code)}</dt>
                <dd className="font-display text-2xl font-bold">
                  {overview.splitCounts[code] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
        </fieldset>

        {editRow ? (
          <fieldset className={`${box} border-race-accent/60`} data-testid="split-edit">
            <legend className={legend}>
              {t("editTitle", { bib: editRow.bib })}
              {editRow.name ? ` – ${editRow.name}` : ""}
            </legend>
            {!editRow.known ? (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
                {t("unknownBib")}
              </p>
            ) : null}
            {problemsOf(editRow).length > 0 ? (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
                {t("orderWarning")}
              </p>
            ) : null}
            <p className="text-xs text-race-muted">{t("editIntro")}</p>
            {splitCodes.map((code) => {
              const cell = editRow.cells[code];
              return (
                <div
                  key={code}
                  className="grid gap-2 border border-race-line/50 p-3"
                  data-testid={`edit-split-${code}`}
                >
                  <p className="text-sm">
                    <strong>{stationName(code)}</strong>:{" "}
                    {cell ? (
                      <>
                        <span className="font-mono">{formatRaceTime(cell.time)}</span> (
                        {cell.author ?? "–"}, {sourceBadge(cell.source)}, {fmt(cell.created)})
                        {cell.conflict ? (
                          <span className="text-red-600 dark:text-red-400">
                            {" "}
                            · {t("hasConflict")}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-race-muted">{t("noTime")}</span>
                    )}
                  </p>
                  <form action={setSplitAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="bib" value={editRow.bib} />
                    <input type="hidden" name="split" value={code} />
                    <input type="hidden" name="year" value={ctx.year} />
                    <input type="hidden" name="expected" value={cell ? cell.time : ""} />
                    <div className="grid gap-1">
                      <Label htmlFor={`value-${code}`} className="text-xs">
                        {t("valueLabel")}
                      </Label>
                      <Input
                        id={`value-${code}`}
                        name="value"
                        required
                        autoComplete="off"
                        placeholder="28:06"
                        defaultValue={cell ? formatRaceTime(cell.time) : ""}
                        className="h-9 w-28 bg-race-surface font-mono"
                      />
                    </div>
                    <select
                      name="mode"
                      defaultValue="race"
                      aria-label={t("modeLabel")}
                      className="h-9 border border-race-line bg-race-surface px-2 text-sm"
                    >
                      <option value="race">{t("modeRace")}</option>
                      <option value="clock">{t("modeClock")}</option>
                    </select>
                    <div className="grid gap-1">
                      <Label htmlFor={`reason-${code}`} className="text-xs">
                        {cell ? t("reasonRequired") : t("reasonOptional")}
                      </Label>
                      <Input
                        id={`reason-${code}`}
                        name="reason"
                        required={Boolean(cell)}
                        maxLength={MANUAL_REASON_MAX}
                        autoComplete="off"
                        className="h-9 w-64 bg-race-surface"
                      />
                    </div>
                    {!editRow.known ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name="force" className="size-4" />
                        {t("forceUnknown")}
                      </label>
                    ) : null}
                    <Button type="submit" className="h-9 bg-race-accent-solid px-3 text-white">
                      {cell ? t("overwrite") : t("add")}
                    </Button>
                  </form>
                  {cell ? (
                    <form action={deleteSplitAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="bib" value={editRow.bib} />
                      <input type="hidden" name="split" value={code} />
                      <input type="hidden" name="year" value={ctx.year} />
                      <input type="hidden" name="expected" value={cell.time} />
                      <Input
                        name="reason"
                        required
                        maxLength={MANUAL_REASON_MAX}
                        autoComplete="off"
                        aria-label={t("reasonRequired")}
                        placeholder={t("deleteReason")}
                        className="h-9 w-64 bg-race-surface"
                      />
                      <ConfirmSubmitButton
                        variant="outline"
                        destructive
                        title={t("deleteTitle")}
                        description={t("deleteConfirm", {
                          bib: editRow.bib,
                          split: stationName(code),
                        })}
                        confirmLabel={t("delete")}
                        className="h-9 px-3 text-red-700"
                      >
                        {t("delete")}
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>
              );
            })}
            {history.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  {t("historyTitle")}
                </summary>
                <table className="mt-2 w-full text-left text-xs">
                  <tbody>
                    {history.map((e) => (
                      <tr key={e.id} className="border-t border-race-line/40">
                        <td className="py-1">{fmt(e.receivedAt)}</td>
                        <td>{stationName(e.split)}</td>
                        <td>{e.time !== null ? formatRaceTime(e.time) : "–"}</td>
                        <td>
                          {e.source} / {e.action}
                        </td>
                        <td>
                          {OUTCOME_LABELS_CS[e.outcome] ?? e.outcome}
                          {e.note ? <span className="text-race-muted"> ({e.note})</span> : null}
                        </td>
                        <td>{e.author}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
            <p className="text-sm">
              <Link href="/admin/den-zavodu/zive/casy" className="text-race-accent hover:underline">
                {t("closeEdit")}
              </Link>
            </p>
          </fieldset>
        ) : null}

        <fieldset className={box} data-testid="split-table">
          <legend className={legend}>{t("tableTitle")}</legend>
          <div className="flex flex-wrap items-end gap-4">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="q" className="text-xs">
                  {t("searchLabel")}
                </Label>
                <Input
                  id="q"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  className="h-9 w-48 bg-race-surface"
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="all"
                  value="1"
                  defaultChecked={sp.all === "1"}
                  className="size-4"
                />
                {t("showAll")}
              </label>
              <Button type="submit" variant="outline" className="h-9">
                {t("search")}
              </Button>
            </form>
            <form method="get" className="flex items-end gap-2" data-testid="edit-open">
              <div className="grid gap-1">
                <Label htmlFor="edit" className="text-xs">
                  {t("editBibLabel")}
                </Label>
                <Input
                  id="edit"
                  name="edit"
                  inputMode="numeric"
                  required
                  pattern="[0-9]{1,3}"
                  className="h-9 w-24 bg-race-surface font-mono"
                />
              </div>
              <Button type="submit" variant="outline" className="h-9">
                {t("editOpen")}
              </Button>
            </form>
          </div>
          <p className="text-xs text-race-muted">{t("tableLegend")}</p>
          {visible.length === 0 ? (
            <p className="text-sm text-race-muted">{t("tableEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-race-muted">
                  <tr>
                    <th className="py-1 pr-2">{live("colBib")}</th>
                    <th className="pr-2">{t("colName")}</th>
                    {splitCodes.map((code) => (
                      <th key={code} className="pr-2">
                        {stationName(code)}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const problems = problemsOf(row);
                    return (
                      <tr
                        key={row.bib}
                        className="border-t border-race-line/40"
                        data-testid={`split-row-${row.bib}`}
                      >
                        <td className="py-1 pr-2 font-mono">{row.bib}</td>
                        <td className="pr-2">
                          {row.name ?? <span className="text-amber-700">{t("notInStart")}</span>}
                        </td>
                        {splitCodes.map((code) => {
                          const cell = row.cells[code];
                          return (
                            <td key={code} className="pr-2 font-mono">
                              {cell ? (
                                <>
                                  {formatRaceTime(cell.time)}
                                  {cell.source === "admin" ? (
                                    <span className="ml-1 rounded bg-race-accent/15 px-1 font-sans text-xs">
                                      {t("badgeManual")}
                                    </span>
                                  ) : null}
                                  {cell.conflict ? (
                                    <span className="ml-1 text-red-600" title={t("hasConflict")}>
                                      !
                                    </span>
                                  ) : null}
                                  {problems.includes(code) ? (
                                    <span className="ml-1 text-amber-600" title={t("orderWarning")}>
                                      ↕
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-race-muted">–</span>
                              )}
                            </td>
                          );
                        })}
                        <td>
                          <Link
                            href={{
                              pathname: "/admin/den-zavodu/zive/casy",
                              query: { edit: row.bib },
                            }}
                            className="text-xs text-race-accent hover:underline"
                          >
                            {t("editLink")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </fieldset>

        <fieldset className={`${box} border-red-500/50`} data-testid="clear-splits">
          <legend className={legend}>{t("clearTitle")}</legend>
          <p className="text-sm text-race-muted">{t("clearIntro")}</p>
          {blocked ? (
            <p role="status" className="border border-amber-500/60 bg-amber-500/10 p-2 text-sm">
              {t("clearBlocked", { zero: fmt(ctx.officialZero) })}
            </p>
          ) : (
            <>
              <p className="text-xs text-race-muted">
                {t("clearAllowedUntil", { zero: fmt(ctx.officialZero) })}
              </p>
              <form method="get" className="grid gap-4" data-testid="clear-filter">
                <input type="hidden" name="preview" value="1" />
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">{t("filterSplits")}</span>
                  <div className="flex flex-wrap gap-4">
                    {splitCodes.map((code) => (
                      <label key={code} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="splits"
                          value={code}
                          defaultChecked={!requested || requested.splits.includes(code)}
                          className="size-4"
                        />
                        {stationName(code)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="source">{t("filterSource")}</Label>
                  <select
                    id="source"
                    name="source"
                    defaultValue={sourceValue}
                    className={selectClass}
                  >
                    {[
                      "all",
                      "web",
                      "obd",
                      "admin",
                      ...tokens.map((token) => `token:${token.id}`),
                    ].map((value) => (
                      <option key={value} value={value}>
                        {sourceLabel(value)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-race-muted">{t("filterSourceHint")}</p>
                </div>
                <Button type="submit" variant="outline" className="h-10 w-fit">
                  {t("previewButton")}
                </Button>
              </form>
            </>
          )}
          {preview && requested ? (
            <form
              action={clearSplitsAction}
              className="grid gap-4 border border-red-500/40 p-3"
              data-testid="clear-confirm"
            >
              <p className="text-sm font-semibold">
                {t("previewSummary", {
                  splits: preview.splitsTotal,
                  entries: preview.entries,
                  conflicts: preview.conflicts,
                })}
              </p>
              <ul className="text-sm text-race-muted">
                {requested.splits.map((code) => (
                  <li key={code}>
                    {stationName(code)}: {preview.splits[code] ?? 0}
                  </li>
                ))}
                <li>
                  {t("filterSource")}: {sourceLabel(sourceValue)}
                </li>
              </ul>
              {requested.splits.map((code) => (
                <input key={code} type="hidden" name="splits" value={code} />
              ))}
              <input type="hidden" name="source" value={sourceValue} />
              <input type="hidden" name="year" value={ctx.year} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="revokeTokens" className="size-4" />
                {t("optionRevokeTokens")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="clearZeroOverride"
                  defaultChecked={ctx.zeroOverridden}
                  className="size-4"
                />
                {t("optionClearZero")}
              </label>
              <p className="text-xs text-race-muted">{t("clearAfterHint")}</p>
              <div className="grid gap-1.5">
                <Label htmlFor="confirmYear">{t("confirmLabel", { year: ctx.year })}</Label>
                <Input
                  id="confirmYear"
                  name="confirmYear"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  maxLength={4}
                  className="h-10 w-32 bg-race-surface font-mono"
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-fit bg-red-700 font-semibold text-white hover:bg-red-800"
              >
                {t("clearButton")}
              </Button>
            </form>
          ) : null}
        </fieldset>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
