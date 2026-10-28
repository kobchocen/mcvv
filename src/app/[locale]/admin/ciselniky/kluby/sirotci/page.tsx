import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminPendingSubmit } from "@/components/organisms/mcvv-admin-pending-submit";
import { confirmOrphanCleanup } from "@/lib/admin/club-orphan-actions";
import { requireAdmin } from "@/lib/admin/staff";
import { ORPHAN_SCOPES, isOrphanScope } from "@/lib/clubs/orphans";
import { previewOrphanCleanup } from "@/lib/clubs/orphans-apply";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { formatDate } from "@/lib/format/date";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ rozsah?: string; chyba?: string; smazano?: string }>;
}>;

const ERRORS = ["rozsah", "potvrzeni", "zmena"] as const;
/** Náhled vypíše nejvýš tolik řádků; smaže se vždy celý seznam (počet je nahoře). */
const SHOWN = 500;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "ClubCleanup" });
  return { title: t("title") };
}

export default async function ClubOrphansPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const copy = await getTranslations({ locale, namespace: "ClubCleanup" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  const query = await searchParams;
  const scope = isOrphanScope(query.rozsah) ? query.rozsah : "ids";
  const error = ERRORS.find((value) => value === query.chyba) ?? null;
  const deleted = query.smazano !== undefined ? Number.parseInt(query.smazano, 10) : null;

  const { year: currentYear } = await currentRaceYear();
  // Dry-run: jen čtení, nic se nemaže.
  const plan = await previewOrphanCleanup(prisma, { scope, currentYear });
  const shown = plan.rows.slice(0, SHOWN);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={admin("title")} />
        <Link
          href="/admin/ciselniky/kluby"
          className="mt-1 inline-block text-sm text-race-muted hover:text-foreground"
        >
          ← {admin("dictsClubs")}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">
          {copy("intro", { year: currentYear })}
        </p>

        {deleted !== null && Number.isFinite(deleted) ? (
          <p
            role="status"
            className="mt-4 border border-race-accent/40 bg-race-accent/10 px-3 py-2 text-sm"
          >
            {copy("done", { count: deleted })}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            {copy(`error_${error}`)}
          </p>
        ) : null}

        <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label={copy("scope")}>
          {ORPHAN_SCOPES.map((value) => (
            <Link
              key={value}
              href={{ pathname: "/admin/ciselniky/kluby/sirotci", query: { rozsah: value } }}
              aria-current={scope === value ? "page" : undefined}
              className={`border px-2 py-1 ${scope === value ? "border-race-accent text-race-accent" : "border-race-line"}`}
            >
              {copy(`scope_${value}`)}
            </Link>
          ))}
        </nav>
        <p className="mt-2 max-w-3xl text-xs text-race-dim">{copy(`scopeHint_${scope}`)}</p>

        <section
          className="mt-6 border border-race-line/55 bg-race-surface p-4 text-sm"
          aria-labelledby="nahled-title"
          data-testid="orphan-preview"
        >
          <h2
            id="nahled-title"
            className="font-display text-2xl font-semibold text-foreground dark:text-white"
          >
            {copy("previewTitle")}
          </h2>
          <p className="mt-2">
            {copy("summary", {
              rows: plan.rows.length,
              ids: plan.ids,
              removedIds: plan.removedIds,
            })}
          </p>
          {plan.keptCurrent > 0 ? (
            <p className="mt-1 text-race-muted">
              {copy("keptCurrent", { count: plan.keptCurrent, year: currentYear })}
            </p>
          ) : null}

          {plan.rows.length === 0 ? (
            <p className="mt-4 text-race-muted">{copy("empty")}</p>
          ) : (
            <>
              <div className="mt-4 max-h-[28rem] overflow-auto border border-race-line/55">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-race-surface">
                    <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                      <th className="px-2 py-2">{copy("colId")}</th>
                      <th className="px-2 py-2">{copy("colYear")}</th>
                      <th className="px-2 py-2">{copy("colName")}</th>
                      <th className="px-2 py-2">{copy("colCreated")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => (
                      <tr key={`${row.id}/${row.year}`} className="border-b border-race-line/40">
                        <td className="px-2 py-1.5 font-mono">{row.id}</td>
                        <td className="px-2 py-1.5 tabular-nums">{row.year}</td>
                        <td className="px-2 py-1.5">{row.name}</td>
                        <td className="px-2 py-1.5 text-race-muted">
                          {row.created ? formatDate(row.created, locale) : "–"}
                          {row.author ? ` · ${row.author}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.rows.length > shown.length ? (
                <p className="mt-2 text-xs text-race-dim">
                  {copy("truncated", { shown: shown.length, total: plan.rows.length })}
                </p>
              ) : null}

              <form
                action={confirmOrphanCleanup}
                className="mt-5 flex flex-col gap-3 border-2 border-red-500/60 bg-red-500/5 p-4"
              >
                <input type="hidden" name="rozsah" value={scope} />
                <input type="hidden" name="otisk" value={plan.fingerprint} />
                <p className="font-semibold text-red-600 dark:text-red-400">
                  {copy("irreversible")}
                </p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="nevratne" value="ano" required className="mt-1" />
                  <span>{copy("acknowledge", { count: plan.rows.length })}</span>
                </label>
                <div>
                  <McvvAdminPendingSubmit
                    destructive
                    label={copy("execute", { count: plan.rows.length })}
                    pendingLabel={copy("executing")}
                  />
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
