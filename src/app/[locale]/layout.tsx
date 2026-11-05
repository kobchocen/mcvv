import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getMessages, setRequestLocale } from "next-intl/server";

import { routing, type Locale } from "@/i18n/routing";
import { HtmlLang } from "@/components/atoms/html-lang";
import { env } from "@/lib/env";
import { ogAlternateLocales, ogLocale, SITE_NAME, siteDescription } from "@/lib/site/seo";
import { AppProviders } from "@/providers";

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

/** Per-locale description and Open Graph locale (#273); pages still set their own title. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const description = siteDescription(locale);
  return {
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description,
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;

  if (!routing.locales.includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages({ locale });

  return (
    <AppProviders locale={locale} messages={messages} timeZone={env.TIME_ZONE}>
      <HtmlLang locale={locale} />
      {children}
    </AppProviders>
  );
}
