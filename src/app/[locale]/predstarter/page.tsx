import type { Metadata, Viewport } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPrestarterClient } from "@/components/organisms/mcvv-prestarter-client";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Link, redirect, type Locale } from "@/i18n/routing";
import { getAccess, screenAllows } from "@/lib/admin/access";
import { prestarterScope } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { prestarterAccessFor } from "@/lib/live/prestarter-core";
import { getStartCorridor } from "@/lib/live/starter";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ koridor?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Prestarter" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07210E",
};

/**
 * Obrazovka předstartéra (#379, mobil na výšku): fronta 6 nejbližších závodníků koridoru,
 * označení připravených (stejný záznam startu jako startér), box Neodstartovali s pozdním
 * startem a celá startovka s hledáním.
 */
export default async function PrestarterPage({ params, searchParams }: PageProps) {
  const [{ locale: requestedLocale }, { koridor }] = await Promise.all([params, searchParams]);
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) {
    redirect({ href: { pathname: "/prihlaseni", query: { next: "/predstarter" } }, locale });
    return null;
  }
  const t = await getTranslations({ locale, namespace: "Prestarter" });
  const access = prestarterAccessFor(
    prestarterScope(await screenAllows(await getAccess())),
    await getStartCorridor(session.id),
    koridor,
  );
  if (!access.ok) {
    const noCorridor = access.error === "no-corridor";
    return (
      <main className="min-h-screen bg-race-deep px-4 py-16 text-foreground">
        <div className="mx-auto max-w-md" data-testid="prestarter-forbidden">
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
    <main className="flex h-dvh flex-col overflow-hidden bg-[#eef4ee] dark:bg-[#031106]">
      <McvvTestRunBanner locale={locale} className="flex-none" />
      <McvvPrestarterClient
        userId={session.id}
        initialCorridor={access.corridor}
        canSwitch={access.canSwitch}
        locale={locale}
      />
    </main>
  );
}

export const dynamic = "force-dynamic";
