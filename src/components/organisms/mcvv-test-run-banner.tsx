import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { formatDateTime } from "@/lib/format/date";
import { getActiveTestRun, raceDayLeftovers } from "@/lib/live/test-run";

type Props = Readonly<{
  locale: Locale;
  /** Admin stránky: v den závodu červené varování, když zůstala testovací data (Q70). */
  leftovers?: boolean;
  className?: string;
}>;

/**
 * Banner „TEST“ (#186): vidět všude, kde se pracuje s daty dne závodu (admin den závodu,
 * zadávání mezičasů). Server component – načte stav testu sám; bez testu nic nevykreslí.
 */
export async function McvvTestRunBanner({ locale, leftovers = false, className = "" }: Props) {
  const now = new Date();
  const [run, left] = await Promise.all([
    getActiveTestRun(now),
    leftovers ? raceDayLeftovers(now) : Promise.resolve(null),
  ]);
  if (!run && !left) return null;
  const t = await getTranslations({ locale, namespace: "TestRun" });
  return (
    <div className={`grid gap-2 ${className}`}>
      {run ? (
        <p
          role="status"
          data-testid="test-run-banner"
          className="border-2 border-amber-500 bg-amber-400 px-4 py-2 text-center font-display text-base font-bold tracking-wide text-black"
        >
          {t("banner", {
            zero: formatDateTime(run.zero, locale),
            expires: formatDateTime(run.expiresAt, locale),
          })}
        </p>
      ) : null}
      {left ? (
        <p
          role="alert"
          data-testid="test-run-leftovers"
          className="border-2 border-red-600 bg-red-600 px-4 py-2 text-center text-sm font-bold text-white"
        >
          {t("leftovers", {
            splits: left.splits,
            starts: left.starts,
            zero: left.zeroOverride ? t("leftoversZero") : "",
            run: left.testRun ? t("leftoversRun") : "",
          })}
        </p>
      ) : null}
    </div>
  );
}
