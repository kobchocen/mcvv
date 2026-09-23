import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Admin" });
  return { title: t("title") };
}

export default async function AdminPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const copy = await getTranslations({ locale, namespace: "Admin" });

  return (
    <main className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-4xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-race-muted">{copy("placeholder")}</p>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
