import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, type Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/staff";
import { formatDateTime } from "@/lib/format/date";
import { clearSplitsAction } from "@/lib/live/admin-actions";
import { previewClear } from "@/lib/live/clear";
import {
  clearableSplits,
  clearBlocked,
  formatClearSource,
  parseClearFilter,
  type ClearFilter,
} from "@/lib/live/clear-core";
import { raceDayOverview } from "@/lib/live/ingest";
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
  const [stations, tokens, overview] = await Promise.all([
    getStations(),
    listDeviceTokens(ctx.year),
    raceDayOverview(ctx.year),
  ]);
  const now = new Date();
  const fmt = (date: Date | null | undefined) => (date ? formatDateTime(date, locale) : "–");
  const splitCodes = clearableSplits(stations);
  const stationName = (code: string) =>
    code === FINISH_SPLIT ? live("finish") : (stations.find((s) => s.code === code)?.label ?? code);
  const blocked = clearBlocked(now, ctx.officialZero);

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
    const id = Number(value.split(":")[1]);
    const token = tokens.find((row) => row.id === id);
    return t("sourceToken", { label: token ? `${token.label} (${token.prefix}…)` : `#${id}` });
  };

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div>
          <McvvAdminHomeLink label={admin("title")} />
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
                    {["all", "web", "obd", ...tokens.map((token) => `token:${token.id}`)].map(
                      (value) => (
                        <option key={value} value={value}>
                          {sourceLabel(value)}
                        </option>
                      ),
                    )}
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
