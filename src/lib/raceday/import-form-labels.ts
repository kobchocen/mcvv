import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/routing";

/** Texty klientského formuláře importu (předávají se jako props). */
export async function importFormLabels(locale: Locale) {
  const t = await getTranslations({ locale, namespace: "RaceDayImport" });
  return {
    preview: t("preview"),
    commit: t("commit"),
    confirm: t("confirm"),
    errors: t("errorsTitle"),
    warnings: t("warningsTitle"),
    more: t.raw("more") as string,
    unchanged: t("unchanged"),
    working: t("working"),
  };
}
