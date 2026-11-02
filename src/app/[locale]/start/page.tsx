import type { Metadata, Viewport } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvStarterClient } from "@/components/organisms/mcvv-starter-client";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Link, redirect, type Locale } from "@/i18n/routing";
import { getSession } from "@/lib/auth/session";
import { getStartCorridor } from "@/lib/live/starter";
import { starterAccess } from "@/lib/live/starter-api-core";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ koridor?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Starter" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
};

/** Obrazovka startéra v koridoru (mobil na výšku): čas, fronta, Nevyběhli, pozdní start. */
export default async function StarterPage({ params, searchParams }: PageProps) {
  const [{ locale: requestedLocale }, { koridor }] = await Promise.all([params, searchParams]);
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) {
    redirect({ href: { pathname: "/prihlaseni", query: { next: "/start" } }, locale });
    return null;
  }
  const t = await getTranslations({ locale, namespace: "Starter" });
  const access = starterAccess(session.role, await getStartCorridor(session.id), koridor);
  if (!access.ok) {
    const noCorridor = access.error === "no-corridor";
    return (
      <main className="min-h-screen bg-race-deep px-4 py-16 text-foreground">
        <div className="mx-auto max-w-md" data-testid="starter-forbidden">
          <h1 className="font-display text-2xl font-bold">
            {noCorridor ? t("noCorridorTitle") : t("forbiddenTitle")}
          </h1>
          <p className="mt-3 text-sm text-race-muted">
            {noCorridor ? t("noCorridorText") : t("forbiddenText")}
          </p>
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
    <main className="flex h-dvh flex-col overflow-hidden bg-[#f2f3f5]">
      <McvvTestRunBanner locale={locale} className="flex-none" />
      <McvvStarterClient
        userId={session.id}
        initialCorridor={access.corridor}
        canSwitch={access.canSwitch}
        locale={locale}
      />
    </main>
  );
}

export const dynamic = "force-dynamic";
