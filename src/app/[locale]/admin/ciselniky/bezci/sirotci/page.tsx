import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import {
  McvvAdminDictsSubnav,
  runnersSubnav,
} from "@/components/organisms/mcvv-admin-dicts-subnav";
import { McvvAdminRunnerOrphans } from "@/components/organisms/mcvv-admin-runner-orphans";
import { loadRunnerOrphans } from "@/lib/admin/runner-orphans";
import { birthYearOf } from "@/lib/admin/runner-sex-core";
import { requireAdmin } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { formatDate } from "@/lib/format/date";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ chyba?: string; smazano?: string }>;
}>;

const ERRORS = ["vyber", "potvrzeni", "zmena"] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "RunnerCleanup" });
  return { title: t("title") };
}

/**
 * Úklid běžců bez navázaných dat (sirotků) – stejný vzor jako u klubů (#193): náhled
 * (jen čtení) se seznamem a zaškrtnutím → potvrzovací dialog → smazání v jedné transakci,
 * server vazby znovu ověří. Audit `runner.orphan_cleanup` drží smazané řádky. Jen admin.
 */
export default async function RunnerOrphansPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const [admin, runners, copy, query] = await Promise.all([
    getTranslations({ locale, namespace: "Admin" }),
    getTranslations({ locale, namespace: "AdminRunners" }),
    getTranslations({ locale, namespace: "RunnerCleanup" }),
    searchParams,
  ]);
  const error = ERRORS.find((value) => value === query.chyba) ?? null;
  const deleted = query.smazano !== undefined ? Number.parseInt(query.smazano, 10) : null;

  // Dry-run: jen čtení, nic se nemaže.
  const orphans = await loadRunnerOrphans(prisma);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={admin("title")} />
        <McvvAdminDictsSubnav
          backLabel={admin("dictsTitle")}
          label={runners("title")}
          items={runnersSubnav(
            {
              search: runners("subnavSearch"),
              merge: runners("subnavMerge"),
              orphans: runners("subnavOrphans"),
            },
            "orphans",
          )}
        />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>

        {deleted !== null && Number.isFinite(deleted) ? (
          <p
            role="status"
            className="mt-4 border border-race-accent/40 bg-race-accent/10 px-3 py-2 text-sm"
            data-testid="runner-orphans-done"
          >
            {copy("done", { count: deleted })}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            {copy(`error_${error}`)}
          </p>
        ) : null}

        <section
          className="mt-6 border border-race-line/55 bg-race-surface p-4 text-sm"
          aria-labelledby="nahled-title"
          data-testid="runner-orphans-preview"
        >
          <h2
            id="nahled-title"
            className="font-display text-2xl font-semibold text-foreground dark:text-white"
          >
            {copy("previewTitle")}
          </h2>
          <p className="mt-2" data-testid="runner-orphans-summary">
            {copy("summary", { count: orphans.length })}
          </p>
          {orphans.length === 0 ? (
            <p className="mt-4 text-race-muted">{copy("empty")}</p>
          ) : (
            <McvvAdminRunnerOrphans
              rows={orphans.map((row) => ({
                id: row.id,
                name: row.name,
                birthYear: birthYearOf(row.id),
                nationality: row.nationality,
                created: `${row.created ? formatDate(row.created, locale) : "–"}${row.author ? ` · ${row.author}` : ""}`,
              }))}
              copy={{
                colSelect: copy("colSelect"),
                colName: runners("colName"),
                colId: runners("colId"),
                colBirthYear: runners("colBirthYear"),
                colNationality: runners("colNationality"),
                colCreated: copy("colCreated"),
                selectAll: copy("selectAll"),
                selectNone: copy("selectNone"),
                // Šablony s {count} doplní klient podle zaškrtnutí (bez ICU formátování).
                selected: String(copy.raw("selected")).replace("{total}", String(orphans.length)),
                execute: String(copy.raw("execute")),
                confirmTitle: copy("confirmTitle"),
                confirmText: String(copy.raw("confirmText")),
                confirmLabel: String(copy.raw("confirmLabel")),
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
