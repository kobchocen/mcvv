import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link, type Locale } from "@/i18n/routing";

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

  const tiles = [
    { href: "/admin/partneri" as const, title: copy("navPartners") },
    { href: "/admin/rocniky" as const, title: copy("navEditions") },
    { href: "/admin/ciselniky" as const, title: copy("navDictionaries") },
    { href: "/admin/prihlasky" as const, title: copy("navRegistrations") },
  ];

  return (
    <main className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-4xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-race-muted">{copy("intro")}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="border border-race-line/55 bg-race-surface p-5 transition-colors hover:border-race-accent/50"
            >
              <p className="font-display text-xl font-semibold text-foreground dark:text-white">
                {tile.title}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
