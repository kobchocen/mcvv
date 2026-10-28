import { getTranslations } from "next-intl/server";

import type { NationalityField } from "@/components/molecules/nationality-select";
import { countryOptions } from "@/lib/runner/nationality";

/** Popisky a nabídka států pro formuláře (přihláška, administrace). */
export async function nationalityField(locale: string): Promise<NationalityField> {
  const t = await getTranslations({ locale, namespace: "Nationality" });
  return {
    label: t("label"),
    unknown: t("unknown"),
    hint: t("hint"),
    ...countryOptions(locale),
  };
}
