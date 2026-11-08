import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvInstructionsTemplate,
  type McvvHomepageContent,
  type McvvInstructionsContent,
} from "@/components/templates";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  const t = await getTranslations({ locale, namespace: "Instructions" });
  return { title: t("title") };
}

export default async function InstructionsPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Instructions" });
  const edition = await currentRaceYear();

  const content: McvvInstructionsContent = {
    brand: home.raw("brand") as McvvHomepageContent["brand"],
    nav: home.raw("nav") as McvvHomepageContent["nav"],
    header: {
      eyebrow: copy("eyebrow", { n: editionNumber(edition) }),
      title: copy("title"),
    },
    tocTitle: copy("tocTitle"),
    backToTop: copy("backToTop"),
    mapAlt: copy("mapAlt"),
    sections: copy.raw("sections") as McvvInstructionsContent["sections"],
  };

  return <McvvInstructionsTemplate content={content} />;
}

export const dynamic = "force-dynamic";
