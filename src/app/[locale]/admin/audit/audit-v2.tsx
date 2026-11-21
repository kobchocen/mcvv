import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  parseUnifiedFilters,
  UNIFIED_CSV_LIMIT,
  UNIFIED_KINDS,
  unifiedQuery,
  unifiedStats,
  type UnifiedRow,
  type UnifiedSearchParams,
} from "@/lib/audit/unified-core";
import { loadUnifiedAll, loadUnifiedPage } from "@/lib/audit/unified";
import { formatDateTime } from "@/lib/format/date";
import { Link, type Locale } from "@/i18n/routing";

const inputClass = "h-10 border border-race-line bg-race-surface px-2";

type Change = { before?: unknown; after?: unknown };

function parsedChanges(detail: string | null): [string, Change][] | null {
  if (!detail || !detail.startsWith("{")) return null;
  try {
    const value = JSON.parse(detail) as { changes?: unknown };
    if (!value.changes || typeof value.changes !== "object") return null;
    return Object.entries(value.changes as Record<string, Change>);
  } catch {
    return null;
  }
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Audit v2 (P9, jen při zapnutém `permissions.v2`): jednotný přehled auditu a deníků dne
 * závodu, filtry včetně čísla běžce a role, historie čísla, přehledy za rok a CSV.
 */
export async function AuditV2({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: UnifiedSearchParams;
}) {
  const copy = await getTranslations({ locale, namespace: "AdminAuditV2" });
  const filters = parseUnifiedFilters(searchParams);
  const query = unifiedQuery(filters);
  // Přehledy jen pro vybraný rok (ohraničený objem), stejné filtry jako tabulka.
  const [page, statsRows] = await Promise.all([
    loadUnifiedPage(filters),
    filters.year !== null ? loadUnifiedAll(filters, UNIFIED_CSV_LIMIT) : Promise.resolve(null),
  ]);
  const stats = statsRows ? unifiedStats(statsRows) : null;
  const pageHref = (number: number) => ({
    pathname: "/admin/audit" as const,
    query: { ...query, ...(number > 1 ? { strana: String(number) } : {}) },
  });
  const csvHref = `/api/admin/audit/csv?${new URLSearchParams(query).toString()}`;
  const bibHref = (row: UnifiedRow) =>
    row.year !== null && row.bib !== null
      ? {
          pathname: "/admin/audit" as const,
          query: { rok: String(row.year), cislo: String(row.bib) },
        }
      : null;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {filters.bib !== null && filters.year !== null
            ? copy("historyTitle", { bib: filters.bib, year: filters.year })
            : copy("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>

        <form
          className="mt-6 flex flex-wrap items-end gap-3"
          method="get"
          data-testid="audit2-filters"
        >
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("kind")}</span>
            <select name="druh" defaultValue={filters.kind ?? ""} className={inputClass}>
              <option value="">{copy("all")}</option>
              {UNIFIED_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {copy(`kind_${kind}`)}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["kdo", "who", filters.actor, "w-48"],
              ["role", "role", filters.role, "w-32"],
              ["akce", "action", filters.action, "w-44"],
              ["entita", "entity", filters.entity, "w-32"],
              ["zdroj", "source", filters.source, "w-24"],
              ["rok", "year", filters.year?.toString() ?? "", "w-20"],
              ["cislo", "bib", filters.bib?.toString() ?? "", "w-20"],
            ] as const
          ).map(([name, label, value, width]) => (
            <label key={name} className="grid gap-1 text-sm">
              <span className="text-race-muted">{copy(label)}</span>
              <input
                name={name}
                defaultValue={value}
                className={`${inputClass} ${width}`}
                inputMode={name === "rok" || name === "cislo" ? "numeric" : undefined}
              />
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("from")}</span>
            <input type="date" name="od" defaultValue={filters.from ?? ""} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("to")}</span>
            <input type="date" name="do" defaultValue={filters.to ?? ""} className={inputClass} />
          </label>
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
            {copy("filter")}
          </Button>
          <a
            href={csvHref}
            className="flex h-10 items-center text-sm font-semibold text-race-accent hover:underline"
            data-testid="audit2-csv"
          >
            {copy("csv")}
          </a>
        </form>
        <p className="mt-2 text-xs text-race-muted">{copy("filterHint")}</p>

        {stats ? (
          <section className="mt-8 grid gap-6 lg:grid-cols-3" data-testid="audit2-stats">
            <div className="border border-race-line/55 p-4 text-sm">
              <h2 className="font-display text-lg font-semibold">
                {copy("statsTitle", { year: filters.year ?? 0 })}
              </h2>
              <ul className="mt-2 grid gap-1">
                <li>{copy("statsTotal", { count: stats.total })}</li>
                {UNIFIED_KINDS.map((kind) => (
                  <li key={kind}>
                    {copy(`kind_${kind}`)}: {stats.byKind[kind]}
                  </li>
                ))}
                <li>{copy("statsCorrections", { count: stats.corrections })}</li>
                <li>{copy("statsDeletions", { count: stats.deletions })}</li>
                <li>{copy("statsConflicts", { count: stats.conflicts })}</li>
                <li>{copy("statsRejected", { count: stats.rejected })}</li>
                <li>{copy("statsDuplicates", { count: stats.duplicates })}</li>
              </ul>
              {stats.total >= UNIFIED_CSV_LIMIT ? (
                <p className="mt-2 text-xs text-race-muted">{copy("statsCapped")}</p>
              ) : null}
            </div>
            <div className="border border-race-line/55 p-4 text-sm">
              <h2 className="font-display text-lg font-semibold">{copy("statsHours")}</h2>
              {stats.byHour.length === 0 ? (
                <p className="mt-2 text-race-muted">–</p>
              ) : (
                <table className="mt-2 text-xs tabular-nums">
                  <thead>
                    <tr className="text-left text-race-muted">
                      <th className="pr-3">{copy("hour")}</th>
                      <th className="pr-3">{copy("kind_start")}</th>
                      <th>{copy("kind_split")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byHour.map((row) => (
                      <tr key={row.hour}>
                        <td className="pr-3">{row.hour}:00</td>
                        <td className="pr-3">{row.start}</td>
                        <td>{row.split}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border border-race-line/55 p-4 text-sm">
              <h2 className="font-display text-lg font-semibold">{copy("statsActors")}</h2>
              <ol className="mt-2 grid gap-1 text-xs">
                {stats.topActors.map((actor) => (
                  <li key={actor.who} className="break-all">
                    {actor.who}: {actor.count}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        <div className="mt-8 overflow-x-auto">
          {page.rows.length === 0 ? (
            <p className="text-sm text-race-muted">{copy("empty")}</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm" data-testid="audit2-table">
              <thead>
                <tr className="border-b border-race-line/55 text-left text-xs text-race-muted">
                  <th className="py-2 pr-3">{copy("colAt")}</th>
                  <th className="py-2 pr-3">{copy("who")}</th>
                  <th className="py-2 pr-3">{copy("action")}</th>
                  <th className="py-2 pr-3">{copy("colBib")}</th>
                  <th className="py-2 pr-3">{copy("source")}</th>
                  <th className="py-2">{copy("colDetail")}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => {
                  const changes = parsedChanges(row.detail);
                  const history = bibHref(row);
                  return (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className="border-b border-race-line/40 align-top"
                    >
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                        {formatDateTime(row.at, locale)}
                      </td>
                      <td className="py-2 pr-3 break-all">
                        {row.who}
                        {row.roles ? (
                          <span className="block text-xs text-race-dim">{row.roles}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {row.action}
                        {row.outcome ? (
                          <span className="block text-race-dim">{row.outcome}</span>
                        ) : null}
                        {row.target ? (
                          <span className="block break-all text-race-dim">{row.target}</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {history ? (
                          <Link href={history} className="text-race-accent hover:underline">
                            {row.bib} ({row.year})
                          </Link>
                        ) : row.year !== null ? (
                          row.year
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {row.source ?? "–"}
                        {row.entity ? (
                          <span className="block text-race-dim">{row.entity}</span>
                        ) : null}
                      </td>
                      <td className="py-2 text-xs">
                        {changes && changes.length > 0 ? (
                          <ul className="grid gap-0.5">
                            {changes.map(([key, change]) => (
                              <li key={key} className="break-all">
                                <span className="font-semibold">{key}</span>: {show(change.before)}{" "}
                                → {show(change.after)}
                              </li>
                            ))}
                          </ul>
                        ) : row.detail ? (
                          <details>
                            <summary className="cursor-pointer text-race-muted">
                              {copy("detail")}
                            </summary>
                            <pre className="mt-1 max-h-60 max-w-xl overflow-auto whitespace-pre-wrap break-all bg-race-surface p-2">
                              {row.detail}
                            </pre>
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-4 flex gap-4 text-sm">
          {filters.page > 1 ? (
            <Link href={pageHref(filters.page - 1)} className="text-race-accent hover:underline">
              ‹ {copy("prev")}
            </Link>
          ) : null}
          {page.hasNext ? (
            <Link href={pageHref(filters.page + 1)} className="text-race-accent hover:underline">
              {copy("next")} ›
            </Link>
          ) : null}
        </p>
      </div>
    </main>
  );
}
