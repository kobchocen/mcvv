import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvRacedayImportForm } from "@/components/organisms/mcvv-raceday-import-form";
import { requireRaceDay } from "@/lib/admin/staff";
import { currentRaceYear } from "@/lib/entries/year";
import { presentationImportAction } from "@/lib/raceday/import-actions";
import { importFormLabels } from "@/lib/raceday/import-form-labels";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "RaceDayImport" });
  return { title: t("presentationTitle") };
}

export default async function PresentationImportPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireRaceDay();
  const t = await getTranslations({ locale, namespace: "RaceDayImport" });
  const raceDay = await getTranslations({ locale, namespace: "RaceDay" });
  const { year } = await currentRaceYear();

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/den-zavodu" className="text-sm text-race-muted hover:text-race-accent">
          ← {raceDay("title")}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold text-foreground dark:text-white">
          {t("presentationHeading", { year })}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{t("presentationIntro")}</p>
        <section className="mt-8 border border-race-line/60 bg-race-surface/40 p-5">
          <McvvRacedayImportForm
            action={presentationImportAction}
            files={[
              { name: "cis_bezec", label: "cis_bezec.csv", hint: t("hintRunners") },
              { name: "cis_klub", label: "cis_klub.csv", hint: t("hintClubs") },
              { name: "start", label: "start.csv", hint: t("hintStart") },
            ]}
            labels={await importFormLabels(locale)}
          />
        </section>
        <p className="mt-4 max-w-3xl text-xs leading-5 text-race-muted">{t("formatNote")}</p>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
