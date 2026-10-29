import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvSpeakerScreen } from "@/components/organisms/mcvv-speaker-screen";
import { Link, redirect, type Locale } from "@/i18n/routing";
import { canViewSpeakerScreen } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { resultboardInfoCache, type ResultboardInfo } from "@/lib/live/resultboard";
import { speakerCache } from "@/lib/live/speaker";
import type { SpeakerSnapshot } from "@/lib/live/speaker-core";

// Písmo tabulek obrazovky speakera (úzké, čitelné z dálky); jen pro tuto stránku.
const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Speaker" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Celoobrazovkové průběžné výsledky pro speakera na TV (#188). Jen admin a pořadatel. */
export default async function SpeakerPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) {
    redirect({ href: { pathname: "/prihlaseni", query: { next: "/mezicasy/speaker" } }, locale });
    return null;
  }
  const t = await getTranslations({ locale, namespace: "Speaker" });
  if (!canViewSpeakerScreen(session.role)) {
    return (
      <main className="min-h-screen bg-race-deep px-4 py-16 text-foreground">
        <div className="mx-auto max-w-md" data-testid="speaker-forbidden">
          <h1 className="font-display text-2xl font-bold">{t("forbiddenTitle")}</h1>
          <p className="mt-3 text-sm text-race-muted">{t("forbidden")}</p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-medium text-race-accent hover:underline"
          >
            {t("home")}
          </Link>
        </div>
      </main>
    );
  }
  const [cached, info] = await Promise.all([speakerCache.get(), resultboardInfoCache.get()]);
  return (
    <div className={robotoCondensed.variable}>
      <McvvSpeakerScreen
        initial={JSON.parse(cached.body) as SpeakerSnapshot}
        initialEtag={cached.etag}
        serverNowMs={new Date().getTime()}
        initialInfo={JSON.parse(info.body) as ResultboardInfo}
        initialInfoEtag={info.etag}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
