import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/staff";
import type { AuditChange } from "@/lib/audit/diff";
import {
  AUDIT_GROUPS,
  AUDIT_PAGE_SIZE,
  auditQuery,
  auditWhere,
  parseAuditFilters,
  type AuditSearchParams,
} from "@/lib/audit/filters";
import { prisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format/date";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<AuditSearchParams>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AdminAudit" });
  return { title: t("title") };
}

function changesOf(detail: unknown): [string, AuditChange][] | null {
  if (!detail || typeof detail !== "object" || !("changes" in detail)) return null;
  const changes = (detail as { changes: unknown }).changes;
  if (!changes || typeof changes !== "object") return null;
  return Object.entries(changes as Record<string, AuditChange>);
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  return typeof value === "string" ? value : JSON.stringify(value);
}

const inputClass = "h-10 border border-race-line bg-race-surface px-2";

export default async function AdminAuditPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const copy = await getTranslations({ locale, namespace: "AdminAudit" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  const filters = parseAuditFilters(await searchParams);
  const where = auditWhere(filters);

  const [total, entries, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const query = auditQuery(filters);
  const pageHref = (page: number) => ({
    pathname: "/admin/audit" as const,
    query: { ...query, ...(page > 1 ? { strana: String(page) } : {}) },
  });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={admin("title")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>

        <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterGroup")}</span>
            <select name="skupina" defaultValue={filters.group ?? ""} className={inputClass}>
              <option value="">{copy("all")}</option>
              {AUDIT_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {copy(`group_${group}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterAction")}</span>
            <select name="akce" defaultValue={filters.action ?? ""} className={inputClass}>
              <option value="">{copy("all")}</option>
              {actions.map((row) => (
                <option key={row.action} value={row.action}>
                  {row.action} ({row._count._all})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterActor")}</span>
            <input name="kdo" defaultValue={filters.actor} maxLength={80} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterTarget")}</span>
            <input
              name="cil"
              defaultValue={filters.target}
              maxLength={80}
              placeholder="registration:2026/12"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterFrom")}</span>
            <input type="date" name="od" defaultValue={filters.from ?? ""} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-race-muted">{copy("filterTo")}</span>
            <input type="date" name="do" defaultValue={filters.to ?? ""} className={inputClass} />
          </label>
          <Button type="submit" variant="outline" className="h-10 border-race-line bg-race-surface">
            {copy("filter")}
          </Button>
          {Object.keys(query).length > 0 ? (
            <Link href="/admin/audit" className="h-10 content-center text-sm text-race-muted">
              {copy("reset")}
            </Link>
          ) : null}
        </form>

        <p className="mt-4 text-sm text-race-muted">{copy("total", { count: total })}</p>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-race-muted">{copy("empty")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className="py-2 pr-3">{copy("colTime")}</th>
                  <th className="py-2 pr-3">{copy("colActor")}</th>
                  <th className="py-2 pr-3">{copy("colAction")}</th>
                  <th className="py-2 pr-3">{copy("colTarget")}</th>
                  <th className="py-2">{copy("colDetail")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const changes = changesOf(entry.detail);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-race-line/40 align-top"
                      data-testid={`audit-row-${entry.id}`}
                    >
                      <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">
                        {formatDateTime(entry.createdAt, locale)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {entry.actorEmail}
                        <span className="block text-xs text-race-dim">{entry.actorRole}</span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{entry.action}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {entry.target ? (
                          <Link
                            href={{ pathname: "/admin/audit", query: { cil: entry.target } }}
                            className="hover:text-race-accent"
                          >
                            {entry.target}
                          </Link>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-2.5 text-xs">
                        {changes && changes.length > 0 ? (
                          <ul className="mb-1 grid gap-0.5">
                            {changes.map(([key, change]) => (
                              <li key={key} className="break-all">
                                <span className="font-semibold">{key}</span>: {show(change.before)}{" "}
                                → {show(change.after)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {entry.detail !== null ? (
                          <details>
                            <summary className="cursor-pointer text-race-muted">
                              {copy("detailJson")}
                            </summary>
                            <pre className="mt-1 max-h-80 max-w-xl overflow-auto whitespace-pre-wrap break-all bg-race-surface p-2">
                              {JSON.stringify(entry.detail, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <nav className="mt-4 flex items-center gap-4 text-sm" aria-label={copy("pagination")}>
            {filters.page > 1 ? (
              <Link href={pageHref(filters.page - 1)} className="text-race-accent">
                ← {copy("newer")}
              </Link>
            ) : null}
            <span className="text-race-muted">{copy("page", { page: filters.page, pages })}</span>
            {filters.page < pages ? (
              <Link href={pageHref(filters.page + 1)} className="text-race-accent">
                {copy("older")} →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
