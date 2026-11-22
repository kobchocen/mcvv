import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvSplitsClient } from "@/components/organisms/mcvv-splits-client";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Link, redirect, type Locale } from "@/i18n/routing";
import { getSession } from "@/lib/auth/session";
import { getAssignedStations } from "@/lib/live/assignment";
import { stationsForScope } from "@/lib/live/assignment-core";
import { getStations } from "@/lib/live/race-context";
import { getLiveRaceContext } from "@/lib/testmode/run";
import { withStart } from "@/lib/live/stations";
import { allowsFor, can, getAccess } from "@/lib/admin/access";
import { splitScope } from "@/lib/admin/permissions";
import { McvvTestModeBanner } from "@/components/molecules/mcvv-test-mode-banner";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Splits" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Webový klient pro zadávání mezičasů na kontrolách 1,3 km a 2,7 km (#121) a evidenci startu (#203). */
export default async function SplitsPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await getSession();
  const access = await getAccess();
  if (!session) {
    redirect({ href: { pathname: "/prihlaseni", query: { next: "/mezicasy" } }, locale });
    return null;
  }
  const t = await getTranslations({ locale, namespace: "Splits" });
  if (!can(access, "screens.splits", "read")) {
    return (
      <main className="min-h-screen bg-race-deep px-4 py-16 text-foreground">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-2xl font-bold">{t("forbiddenTitle")}</h1>
          <p className="mt-3 text-sm text-race-muted">{t("forbiddenText")}</p>
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
  const [ctx, allStations, assigned] = await Promise.all([
    getLiveRaceContext(),
    getStations(),
    getAssignedStations(session.id),
  ]);
  // Splitmaker vidí jen přiřazená stanoviště (server zápis na jiné odmítne).
  // Start (#203) je vestavěné stanoviště: evidence, kdo odstartoval (jen evidence).
  const stations = stationsForScope(
    splitScope(allowsFor(access)),
    assigned,
    withStart(allStations),
  );
  if (stations.length === 0) {
    return (
      <main className="min-h-screen bg-race-deep px-4 py-16 text-foreground">
        <div className="mx-auto max-w-md" data-testid="no-station">
          <h1 className="font-display text-2xl font-bold">{t("noStationTitle")}</h1>
          <p className="mt-3 text-sm text-race-muted">{t("noStationText")}</p>
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
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvTestModeBanner locale={locale as Locale} ctx={ctx} />
      <McvvTestRunBanner locale={locale} />
      <McvvSplitsClient
        stations={stations}
        year={ctx.year}
        userId={session.id}
        userName={session.name}
        zeroIso={ctx.zero.toISOString()}
        intervalS={ctx.intervalS}
        secondStartFrom={ctx.secondStartFrom}
        zeroOverridden={ctx.zeroOverridden}
        startLimitS={ctx.startLimitS}
        locale={locale}
      />
    </main>
  );
}

export const dynamic = "force-dynamic";
