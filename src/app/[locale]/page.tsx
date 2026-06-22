import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvHomepageTemplate, type McvvHomepageContent } from "@/components/templates";
import { routing, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function Home({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Home" });
  const content: McvvHomepageContent = {
    brand: t.raw("brand") as McvvHomepageContent["brand"],
    nav: t.raw("nav") as McvvHomepageContent["nav"],
    hero: t.raw("hero") as McvvHomepageContent["hero"],
    overview: t.raw("overview") as McvvHomepageContent["overview"],
    profile: t.raw("profile") as McvvHomepageContent["profile"],
    schedule: t.raw("schedule") as McvvHomepageContent["schedule"],
    info: t.raw("info") as McvvHomepageContent["info"],
    results: t.raw("results") as McvvHomepageContent["results"],
    gallery: t.raw("gallery") as McvvHomepageContent["gallery"],
    partners: t.raw("partners") as McvvHomepageContent["partners"],
    finalCta: t.raw("finalCta") as McvvHomepageContent["finalCta"],
    footer: t.raw("footer") as McvvHomepageContent["footer"],
  };

  return <McvvHomepageTemplate content={content} />;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;
