import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("dictsTitle") };
}

export default async function AdminDictionariesPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const copy = await getTranslations({ locale, namespace: "Admin" });

  const cards = [
    {
      href: "/admin/ciselniky/kategorie" as const,
      title: copy("dictsCategories"),
      hint: copy("dictsCategoriesHint"),
    },
    {
      href: "/admin/ciselniky/kluby" as const,
      title: copy("dictsClubs"),
      hint: copy("dictsClubsHint"),
    },
  ];

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("dictsTitle")}
        </h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="border border-race-line/55 bg-race-surface p-5 transition-colors hover:border-race-accent/50"
            >
              <p className="font-display text-xl font-semibold text-foreground dark:text-white">
                {card.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-race-muted">{card.hint}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
