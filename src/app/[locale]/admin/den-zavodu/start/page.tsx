import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ClubLink } from "@/components/molecules";
import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, type Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";
import { formatDateTime } from "@/lib/format/date";
import { OUTCOME_LABELS_CS } from "@/lib/live/admin-core";
import { clearBlocked } from "@/lib/live/clear-core";
import { MANUAL_REASON_MAX } from "@/lib/live/manual-core";
import { getRaceContext } from "@/lib/live/race-context";
import { clearStartsAction, deleteStartAction, setStartAction } from "@/lib/live/start-actions";
import { loadStartOverview, previewStartClear, startJournal } from "@/lib/live/start-check";
import {
  filterStartRows,
  formatOffset,
  parseStartFilter,
  type StartFilter,
} from "@/lib/live/start-check-core";
import { pragueClock } from "@/lib/live/start-clock";

type SearchParams = {
  filter?: string;
  q?: string;
  edit?: string;
  saved?: string;
  error?: string;
  cleared?: string;
  entries?: string;
  preview?: string;
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "StartCheck" });
  return { title: t("title") };
}

const box = "grid gap-4 border border-race-line/60 bg-race-surface/40 p-4";
const legend = "px-1 font-display text-lg font-semibold";
const FILTERS: StartFilter[] = ["all", "started", "missing", "unknown"];
const MAX_ROWS = 400;

/**
 * Evidence startu (#203): kdo opravdu odstartoval, kdo ne (kandidáti DNS) a časy. Přehled
 * vidí admin i pořadatel; zápis, opravu a mazání jen admin. Čas startu je jen evidence –
 * výsledky, OFeed ani OBD ho nepoužívají.
 */
export default async function StartCheckPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const sp = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await requireStaff();
  const isAdmin = session.role === "admin";
  const t = await getTranslations({ locale, namespace: "StartCheck" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  const ctx = await getRaceContext();
  const editBib = isAdmin && /^\d{1,3}$/.test(sp.edit ?? "") ? Number(sp.edit) : null;
  const [overview, recent, history, clearPreview] = await Promise.all([
    loadStartOverview(ctx),
    startJournal(ctx.year),
    editBib ? startJournal(ctx.year, editBib) : Promise.resolve([]),
    isAdmin && sp.preview ? previewStartClear(ctx.year) : Promise.resolve(null),
  ]);
  const filter = parseStartFilter(sp.filter);
  const rows = filterStartRows(overview.rows, filter, sp.q ?? "");
  const now = new Date();
  const blocked = clearBlocked(now, ctx.officialZero);
  const fmt = (date: Date | null | undefined) => (date ? formatDateTime(date, locale) : "–");
  const who = (userId: number | null, source: string) =>
    source === "admin"
      ? `${t("sourceAdmin")}${userId && overview.userNames[userId] ? ` (${overview.userNames[userId]})` : ""}`
      : userId && overview.userNames[userId]
        ? overview.userNames[userId]
        : source;
  const editRow =
    editBib === null ? null : (overview.rows.find((row) => row.bib === editBib) ?? null);
  const editRecord = editRow?.record ?? null;
  const filterHref = (value: StartFilter) => ({
    pathname: "/admin/den-zavodu/start" as const,
    query: { ...(value === "all" ? {} : { filter: value }), ...(sp.q ? { q: sp.q } : {}) },
  });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-8">
        <div>
          <McvvAdminHomeLink label={admin("title")} />
          <McvvTestRunBanner locale={locale} leftovers className="mb-4" />
          <p className="mt-2 text-sm">
            <Link href="/admin/den-zavodu" className="text-race-accent hover:underline">
              ← {t("backRaceDay")}
            </Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("heading", { year: ctx.year })}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">
            {t("intro", { zero: fmt(ctx.zero) })}
          </p>
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link href="/mezicasy" className="font-medium text-race-accent hover:underline">
              {t("openClient")}
            </Link>
            {isAdmin ? (
              <Link
                href="/admin/den-zavodu/zive"
                className="font-medium text-race-accent hover:underline"
              >
                {t("openAssignment")}
              </Link>
            ) : null}
          </p>
          {sp.error ? (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {t(`error.${sp.error}` as never)}
            </p>
          ) : sp.saved ? (
            <p role="status" className="mt-4 text-sm text-race-accent" data-testid="start-result">
              {t(`saved.${sp.saved}` as never)}
            </p>
          ) : sp.cleared !== undefined ? (
            <p role="status" className="mt-4 text-sm text-race-accent" data-testid="clear-result">
              {t("clearDone", {
                records: Number(sp.cleared) || 0,
                entries: Number(sp.entries) || 0,
              })}
            </p>
          ) : null}
        </div>

        <dl
          className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4"
          data-testid="start-summary"
        >
          {(
            [
              ["total", overview.summary.total, "all"],
              ["started", overview.summary.started, "started"],
              ["missing", overview.summary.missing, "missing"],
              ["unknown", overview.summary.unknown, "unknown"],
            ] as const
          ).map(([key, value, target]) => (
            <div
              key={key}
              className={`border p-3 ${
                filter === target
                  ? "border-race-accent bg-race-accent/10"
                  : "border-race-line/50 bg-race-surface"
              }`}
            >
              <dt className="text-xs text-race-muted">
                <Link href={filterHref(target)} className="hover:underline">
                  {t(`summary.${key}`)}
                </Link>
              </dt>
              <dd
                className={`font-display text-2xl font-bold ${
                  key === "missing" && value > 0 ? "text-amber-700 dark:text-amber-300" : ""
                } ${key === "unknown" && value > 0 ? "text-red-600 dark:text-red-400" : ""}`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {editBib !== null ? (
          <fieldset className={`${box} border-race-accent/60`} data-testid="start-edit">
            <legend className={legend}>
              {t("editTitle", { bib: editBib })}
              {editRow?.name ? ` – ${editRow.name}` : ""}
            </legend>
            {!editRow?.known ? (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
                {t("unknownBib")}
              </p>
            ) : null}
            <p className="text-sm">
              {t("planned")}:{" "}
              <span className="font-mono">{editRow ? pragueClock(editRow.planned) : "–"}</span> ·{" "}
              {t("actual")}:{" "}
              {editRecord ? (
                <>
                  <span className="font-mono">{pragueClock(editRecord.startedAt)}</span> (
                  {formatOffset(editRow!.offsetS ?? 0)}, {who(editRecord.userId, editRecord.source)}
                  )
                </>
              ) : (
                <span className="text-race-muted">{t("notStarted")}</span>
              )}
            </p>
            <form action={setStartAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="bib" value={editBib} />
              <input type="hidden" name="year" value={ctx.year} />
              <input
                type="hidden"
                name="expected"
                value={editRecord ? editRecord.startedAt.getTime() : ""}
              />
              <div className="grid gap-1">
                <Label htmlFor="start-value" className="text-xs">
                  {t("valueLabel")}
                </Label>
                <Input
                  id="start-value"
                  name="value"
                  required
                  autoComplete="off"
                  placeholder="10:15:00"
                  defaultValue={pragueClock(editRecord?.startedAt ?? editRow?.planned ?? ctx.zero)}
                  className="h-9 w-28 bg-race-surface font-mono"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="start-reason" className="text-xs">
                  {editRecord ? t("reasonRequired") : t("reasonOptional")}
                </Label>
                <Input
                  id="start-reason"
                  name="reason"
                  required={Boolean(editRecord)}
                  maxLength={MANUAL_REASON_MAX}
                  autoComplete="off"
                  className="h-9 w-64 bg-race-surface"
                />
              </div>
              <Button type="submit" className="h-9 bg-race-accent-solid px-3 text-white">
                {editRecord ? t("overwrite") : t("add")}
              </Button>
            </form>
            {editRecord ? (
              <form action={deleteStartAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="bib" value={editBib} />
                <input type="hidden" name="year" value={ctx.year} />
                <input type="hidden" name="expected" value={editRecord.startedAt.getTime()} />
                <Input
                  name="reason"
                  required
                  maxLength={MANUAL_REASON_MAX}
                  autoComplete="off"
                  aria-label={t("reasonRequired")}
                  placeholder={t("deleteReason")}
                  className="h-9 w-64 bg-race-surface"
                />
                <Button type="submit" variant="outline" className="h-9 px-3 text-red-700">
                  {t("delete")}
                </Button>
              </form>
            ) : null}
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
                        <td className="font-mono">
                          {e.startedAt ? pragueClock(e.startedAt) : "–"}
                        </td>
                        <td>
                          {e.source} / {e.action}
                        </td>
                        <td>
                          {OUTCOME_LABELS_CS[e.outcome] ?? e.outcome}
                          {e.note ? <span className="text-race-muted"> ({e.note})</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
            <p className="text-sm">
              <Link href="/admin/den-zavodu/start" className="text-race-accent hover:underline">
                {t("closeEdit")}
              </Link>
            </p>
          </fieldset>
        ) : null}

        <fieldset className={box} data-testid="start-table">
          <legend className={legend}>{t("tableTitle")}</legend>
          <div className="flex flex-wrap items-end gap-4">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="filter" className="text-xs">
                  {t("filterLabel")}
                </Label>
                <select
                  id="filter"
                  name="filter"
                  defaultValue={filter}
                  className="h-9 border border-race-line bg-race-surface px-2 text-sm"
                >
                  {FILTERS.map((value) => (
                    <option key={value} value={value}>
                      {t(`filter.${value}`)}
                    </option>
                  ))}
                </select>
              </div>
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
              <Button type="submit" variant="outline" className="h-9">
                {t("search")}
              </Button>
            </form>
            {isAdmin ? (
              <form method="get" className="flex items-end gap-2">
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
            ) : null}
          </div>
          <p className="text-xs text-race-muted">{t("tableLegend")}</p>
          {rows.length === 0 ? (
            <p className="text-sm text-race-muted">{t("tableEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-race-muted">
                  <tr>
                    <th className="py-1 pr-2">{t("colBib")}</th>
                    <th className="pr-2">{t("colName")}</th>
                    <th className="pr-2">{t("colCategory")}</th>
                    <th className="pr-2">{t("planned")}</th>
                    <th className="pr-2">{t("actual")}</th>
                    <th className="pr-2">{t("colOffset")}</th>
                    <th className="pr-2">{t("colBy")}</th>
                    {isAdmin ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, MAX_ROWS).map((row) => (
                    <tr
                      key={row.bib}
                      className={`border-t border-race-line/40 ${
                        !row.known ? "bg-red-500/10" : !row.record ? "text-race-muted" : ""
                      }`}
                      data-testid={`start-row-${row.bib}`}
                    >
                      <td className="py-1 pr-2 font-mono font-semibold">{row.bib}</td>
                      <td className="pr-2">
                        {row.name ?? <span className="text-red-600">{t("unknownShort")}</span>}
                        {row.club ? (
                          <span className="text-xs text-race-muted">
                            {" · "}
                            <ClubLink id={row.clubId} name={row.club} />
                          </span>
                        ) : null}
                      </td>
                      <td className="pr-2">{row.categoryId ?? "–"}</td>
                      <td className="pr-2 font-mono">{pragueClock(row.planned)}</td>
                      <td className="pr-2 font-mono">
                        {row.record ? pragueClock(row.record.startedAt) : "–"}
                      </td>
                      <td className="pr-2 font-mono">
                        {row.offsetS !== null ? formatOffset(row.offsetS) : ""}
                      </td>
                      <td className="pr-2 text-xs">
                        {row.record ? who(row.record.userId, row.record.source) : ""}
                      </td>
                      {isAdmin ? (
                        <td>
                          <Link
                            href={{
                              pathname: "/admin/den-zavodu/start",
                              query: { edit: String(row.bib) },
                            }}
                            className="text-xs text-race-accent hover:underline"
                          >
                            {t("edit")}
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > MAX_ROWS ? (
                <p className="mt-2 text-xs text-race-muted">
                  {t("truncated", { shown: MAX_ROWS, total: rows.length })}
                </p>
              ) : null}
            </div>
          )}
        </fieldset>

        <fieldset className={box}>
          <legend className={legend}>{t("journalTitle", { count: overview.journalCount })}</legend>
          {recent.length === 0 ? (
            <p className="text-sm text-race-muted">{t("journalEmpty")}</p>
          ) : (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">{t("journalShow")}</summary>
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-race-muted">
                  <tr>
                    <th className="py-1">{t("colReceived")}</th>
                    <th>{t("colBib")}</th>
                    <th>{t("actual")}</th>
                    <th>{t("colOffset")}</th>
                    <th>{t("colOutcome")}</th>
                    <th>{t("colBy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((e) => (
                    <tr key={e.id} className="border-t border-race-line/40">
                      <td className="py-1">{fmt(e.receivedAt)}</td>
                      <td>{e.bib || "–"}</td>
                      <td className="font-mono">{e.startedAt ? pragueClock(e.startedAt) : "–"}</td>
                      <td className="font-mono">
                        {e.offsetS !== null ? formatOffset(e.offsetS) : "–"}
                      </td>
                      <td>
                        {OUTCOME_LABELS_CS[e.outcome] ?? e.outcome}
                        {e.note ? <span className="text-race-muted"> ({e.note})</span> : null}
                      </td>
                      <td>{who(e.userId, e.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </fieldset>

        {isAdmin ? (
          <fieldset className={box} data-testid="start-clear">
            <legend className={legend}>{t("clearTitle")}</legend>
            <p className="text-sm text-race-muted">
              {t("clearIntro", { zero: fmt(ctx.officialZero) })}
            </p>
            {blocked ? (
              <p role="status" className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {t("clearBlocked")}
              </p>
            ) : clearPreview ? (
              <form action={clearStartsAction} className="grid gap-3">
                <input type="hidden" name="year" value={ctx.year} />
                <p className="text-sm">
                  {t("clearPreview", {
                    records: clearPreview.records,
                    entries: clearPreview.entries,
                  })}
                </p>
                <div className="grid gap-1">
                  <Label htmlFor="confirmYear" className="text-xs">
                    {t("clearConfirm", { year: ctx.year })}
                  </Label>
                  <Input
                    id="confirmYear"
                    name="confirmYear"
                    required
                    autoComplete="off"
                    inputMode="numeric"
                    className="h-9 w-28 bg-race-surface font-mono"
                  />
                </div>
                <Button type="submit" variant="outline" className="h-9 w-fit text-red-700">
                  {t("clearSubmit")}
                </Button>
              </form>
            ) : (
              <form method="get">
                <input type="hidden" name="preview" value="1" />
                <Button type="submit" variant="outline" className="h-9">
                  {t("clearPreviewButton")}
                </Button>
              </form>
            )}
          </fieldset>
        ) : null}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
