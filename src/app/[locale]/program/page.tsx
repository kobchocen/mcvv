import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvProgramTemplate,
  type McvvHomepageContent,
  type McvvProgramContent,
} from "@/components/templates";
import { routing, type Locale } from "@/i18n/routing";

type ProgramPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function ProgramPage({ params }: ProgramPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const home = await getTranslations({ locale, namespace: "Home" });
  const program = await getTranslations({ locale, namespace: "Program" });

  const content: McvvProgramContent = {
    brand: home.raw("brand") as McvvHomepageContent["brand"],
    nav: home.raw("nav") as McvvHomepageContent["nav"],
    header: program.raw("header") as McvvProgramContent["header"],
    tocTitle: program("tocTitle"),
    sections: program.raw("sections") as McvvProgramContent["sections"],
    cta: program.raw("cta") as McvvProgramContent["cta"],
  };

  return <McvvProgramTemplate content={content} />;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;
