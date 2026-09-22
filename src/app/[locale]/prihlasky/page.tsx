import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvNavbar } from "@/components/organisms";
import { Link, type Locale } from "@/i18n/routing";
import { prisma } from "@/lib/db/client";
import { formatCzk } from "@/lib/utils";
import type { McvvHomepageContent } from "@/components/templates";

type EntriesPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const ROZPIS_EDITION_ID = 34;

export async function generateMetadata({ params }: EntriesPageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  const t = await getTranslations({ locale, namespace: "Entries" });
  return { title: t("title") };
}

export default async function EntriesPage({ params }: EntriesPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const home = await getTranslations({ locale, namespace: "Home" });
  const entries = await getTranslations({ locale, namespace: "Entries" });

  let edition: Awaited<ReturnType<typeof prisma.edition.findUnique>> = null;
  try {
    edition = await prisma.edition.findUnique({ where: { id: ROZPIS_EDITION_ID } });
  } catch {
    edition = null;
  }

  const dash = "—";
  const fees = [
    { label: entries("onlineAdult"), value: formatCzk(edition?.startAdultMail, locale, dash) },
    { label: entries("onlineKids"), value: formatCzk(edition?.startKidsMail, locale, dash) },
    { label: entries("onsiteAdult"), value: formatCzk(edition?.startAdultPlace, locale, dash) },
    { label: entries("onsiteKids"), value: formatCzk(edition?.startKidsPlace, locale, dash) },
  ];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvNavbar
        content={{
          brand: home.raw("brand") as McvvHomepageContent["brand"],
          nav: home.raw("nav") as McvvHomepageContent["nav"],
        }}
        variant="solid"
      />

      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-3xl gap-6">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {entries("eyebrow")}
            </p>
          </div>
          <h1 className="font-display text-5xl font-bold text-white sm:text-6xl">
            {entries("title")}
          </h1>
          <p className="text-lg font-semibold text-race-accent">{entries("closed")}</p>
          <p className="text-base leading-7 text-race-muted">{entries("raceDate")}</p>

          <dl className="grid gap-2 sm:grid-cols-2">
            {fees.map((row) => (
              <div key={row.label} className="border border-race-line/55 bg-race-surface px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-race-dim">
                  {row.label}
                </dt>
                <dd className="mt-1 font-display text-xl font-semibold text-white">{row.value}</dd>
              </div>
            ))}
          </dl>

          <p>
            <Link
              href="/program"
              className="font-medium text-race-accent underline-offset-2 hover:underline"
            >
              {entries("back")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
