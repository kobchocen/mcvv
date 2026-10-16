import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Stats" });
  return { title: t("comingSoonTitle") };
}

export default async function StatsIndexPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Stats" });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow")}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {copy("comingSoonTitle")}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-race-muted">
            {copy("comingSoonBody")}
          </p>
        </div>
      </section>
    </main>
  );
}
