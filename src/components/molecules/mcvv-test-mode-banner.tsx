import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/routing";

/** Banner TEST na interních obrazovkách dne závodu, když běží testovací režim B+. */
export async function McvvTestModeBanner({
  locale,
  ctx,
}: Readonly<{ locale: Locale; ctx: { year: number; testRunId?: number } }>) {
  if (ctx.testRunId == null) return null;
  const t = await getTranslations({ locale, namespace: "LiveResults" });
  return (
    <p
      role="status"
      className="bg-amber-500 px-4 py-2 text-center text-sm font-bold text-black"
      data-testid="testmode-banner"
    >
      {t("testModeBanner", { year: ctx.year })}
    </p>
  );
}
