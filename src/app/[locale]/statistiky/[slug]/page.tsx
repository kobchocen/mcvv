import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvStatsPage, type McvvHomepageContent } from "@/components/templates";
import { isStaffRole, getSession } from "@/lib/auth/session";
import { isStatSlug, STAT_SLUGS } from "@/lib/stats/queries";
import { loadStatsSlug } from "@/lib/stats/tables";
import { STATS_OVERVIEW_SLUG } from "@/components/molecules";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; slug: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  if (!isStatSlug(slug)) {
    return {};
  }
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Stats" });
  return { title: t(`${slug}.title`) };
}

export default async function StatsSlugPage({ params }: PageProps) {
  const { locale: requestedLocale, slug } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  if (!isStatSlug(slug)) {
    notFound();
  }

  const home = await getTranslations({ locale, namespace: "Home" });
  const stats = await getTranslations({ locale, namespace: "Stats" });
  const { tables, chart, chartCaption } = await loadStatsSlug(slug, stats, locale);
  const session = await getSession();
  const print =
    session && isStaffRole(session.role)
      ? { href: `/api/statistiky/${slug}/pdf`, label: stats("printPdf") }
      : undefined;

  return (
    <McvvStatsPage
      brand={home.raw("brand") as McvvHomepageContent["brand"]}
      nav={home.raw("nav") as McvvHomepageContent["nav"]}
      eyebrow={stats("eyebrow")}
      title={stats(`${slug}.title`)}
      intro={stats(`${slug}.intro`)}
      tables={tables}
      chart={chart}
      chartCaption={chartCaption}
      chartMenLabel={stats("men")}
      chartWomenLabel={stats("women")}
      empty={stats("empty")}
      back={stats("back")}
      print={print}
      statsNav={{
        current: slug,
        ariaLabel: stats("navLabel"),
        items: [
          { slug: STATS_OVERVIEW_SLUG, label: stats("overview.nav") },
          ...STAT_SLUGS.map((item) => ({ slug: item, label: stats(`${item}.nav`) })),
        ],
      }}
    />
  );
}

export const dynamic = "force-dynamic";
