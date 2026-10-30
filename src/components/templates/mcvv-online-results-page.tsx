import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvOnlineResults } from "@/components/organisms/mcvv-online-results";
import type { Locale } from "@/i18n/routing";
import { onlineResultsCache } from "@/lib/live/online-results";
import { resultboardInfoCache, type ResultboardInfo } from "@/lib/live/resultboard";
import { decodeOnline, findCategoryBySlug, type OnlineWire } from "@/lib/live/online-results-core";

// Písmo tabulek (úzké, jako speaker #188); jen pro tuto stránku.
const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** Partneři pro pruh dole – ze sdílené 30s cache resultboardu (bez dotazu do DB na každý request). */
async function partners() {
  try {
    const cached = await resultboardInfoCache.get();
    return (JSON.parse(cached.body) as ResultboardInfo).partners;
  } catch (error) {
    console.error("[online-results] partners load failed", error);
    return [];
  }
}

async function snapshot() {
  const cached = await onlineResultsCache.get();
  const wire = JSON.parse(cached.body) as OnlineWire;
  return { wire, data: decodeOnline(wire), etag: cached.etag };
}

export async function onlineResultsMetadata(
  locale: string,
  slug: string | null,
): Promise<Metadata> {
  const t = await getTranslations({ locale: locale as Locale, namespace: "OnlineResults" });
  const { data } = await snapshot();
  const cat = findCategoryBySlug(data.categories, slug);
  const title = t("metaTitle", { year: data.year });
  return {
    title: cat ? `${cat.name.charAt(0).toUpperCase()}${cat.name.slice(1)} – ${title}` : title,
    description: t("metaDescription"),
    // průběžná data – do vyhledávačů patří oficiální výsledky
    robots: { index: false, follow: true },
  };
}

/**
 * Veřejné online výsledky `/vysledky/online[/<kategorie>]` – bez přihlášení. První
 * vykreslení ze sdílené cache snímku (stejná jako `/api/live/results`), dál klient polluje.
 */
export async function McvvOnlineResultsPage({
  locale,
  slug,
}: {
  locale: string;
  slug: string | null;
}) {
  setRequestLocale(locale as Locale);
  const [{ wire, data, etag }, partnerList] = await Promise.all([snapshot(), partners()]);
  if (slug !== null && !findCategoryBySlug(data.categories, slug)) notFound();
  return (
    <div className={robotoCondensed.variable}>
      <McvvOnlineResults
        initial={wire}
        initialEtag={etag}
        serverNowMs={new Date().getTime()}
        initialSlug={slug}
        partners={partnerList}
      />
    </div>
  );
}
