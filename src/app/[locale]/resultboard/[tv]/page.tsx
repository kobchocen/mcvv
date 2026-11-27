import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";

import { McvvResultboard } from "@/components/organisms/mcvv-resultboard";
import { McvvResultboardForbidden } from "@/components/organisms/mcvv-resultboard-forbidden";
import type { Locale } from "@/i18n/routing";
import { onlineResultsCache } from "@/lib/live/online-results";
import type { OnlineWire } from "@/lib/live/online-results-core";
import {
  resultboardInfoCache,
  resultboardTestCache,
  type ResultboardInfo,
} from "@/lib/live/resultboard";
import { requireResultboardAccess } from "@/lib/live/resultboard-access";
import { parseMonitorParam } from "@/lib/live/resultboard-core";
import { siteUrl } from "@/lib/site/url";

// Písmo tabulek (úzké, jako speaker #188); jen pro tuto stránku.
const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

type PageProps = Readonly<{
  params: Promise<{ locale: string; tv: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, tv } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Resultboard" });
  return { title: t("metaTitle", { n: tv }), robots: { index: false, follow: false } };
}

/** QR kód na veřejné online výsledky (Q142) – SVG z naší vlastní URL, jednou za render. */
async function qrFor(url: string): Promise<string> {
  try {
    return await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  } catch {
    return "";
  }
}

/**
 * Resultboard `/resultboard/<n>` – TV v cíli (náhrada OFB, #188). Jen přihlášení
 * s `screens.resultboard` (jako speaker); noindex. První vykreslení ze sdílených cache
 * (stejný snímek jako `/vysledky/online`), dál klient polluje. `?test=1` je pořád
 * jen pro stejné oprávnění (Q135). Veřejnost má živé výsledky na `/vysledky/online`.
 */
export default async function ResultboardPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale, tv: tvParam } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const tv = parseMonitorParam(tvParam);
  if (tv === null) notFound();
  const query = await searchParams;
  const wantsTest = query.test === "1";
  const next = wantsTest ? `/resultboard/${tv}?test=1` : `/resultboard/${tv}`;
  if (!(await requireResultboardAccess(locale, next))) {
    return <McvvResultboardForbidden locale={locale} />;
  }
  const test = wantsTest;
  const online = `${siteUrl()}/vysledky/online`;
  const [cached, info, qrSvg] = await Promise.all([
    test ? resultboardTestCache.get() : onlineResultsCache.get(),
    resultboardInfoCache.get(),
    qrFor(online),
  ]);
  return (
    <div className={robotoCondensed.variable}>
      <McvvResultboard
        tv={tv}
        initial={JSON.parse(cached.body) as OnlineWire}
        initialEtag={cached.etag}
        serverNowMs={new Date().getTime()}
        initialInfo={JSON.parse(info.body) as ResultboardInfo}
        initialInfoEtag={info.etag}
        test={test}
        qrSvg={qrSvg}
        qrLabel={online.replace(/^https?:\/\//, "")}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
