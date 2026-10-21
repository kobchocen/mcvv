import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminEditionForm } from "@/components/organisms/mcvv-admin-edition-form";
import { McvvAdminStartModelFields } from "@/components/organisms/mcvv-admin-start-model-fields";
import { startModelCopy } from "@/components/organisms/mcvv-admin-start-model-copy";
import { prisma } from "@/lib/db/client";
import { loadStartSettings } from "@/lib/race/startlist-load";
import { DEFAULT_CHAMPION_BIBS, startModelFromEdition } from "@/lib/race/start-time";
import { type Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ chyba?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("editionsTitle") };
}

export default async function AdminNewEditionPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const latest = await prisma.edition.findFirst({ orderBy: { id: "desc" } });
  const startCopy = await getTranslations({ locale, namespace: "StartAdmin" });
  const { chyba } = await searchParams;
  // Nový ročník = následující rok; rozsahy se převezmou z posledního ročníku.
  const settings = await loadStartSettings(
    latest ? latest.date.getUTCFullYear() : new Date().getFullYear(),
  );

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="mb-2 font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("new")} — {copy("editionsTitle")}
        </h1>
        <p className="mb-8 max-w-xl text-sm leading-6 text-race-muted">{copy("editionsNewHint")}</p>
        <McvvAdminEditionForm
          edition={
            latest
              ? {
                  startKidsMail: latest.startKidsMail,
                  startKidsPlace: latest.startKidsPlace,
                  startAdultMail: latest.startAdultMail,
                  startAdultPlace: latest.startAdultPlace,
                  startInterval: latest.startInterval,
                  finAdult1: latest.finAdult1,
                  finAdult2: latest.finAdult2,
                  finAdult3: latest.finAdult3,
                  finAdult4: latest.finAdult4,
                  finAdult5: latest.finAdult5,
                  finVet1: latest.finVet1,
                  finVet2: latest.finVet2,
                  finVet3: latest.finVet3,
                }
              : undefined
          }
          copy={{
            date: copy("editionsDate"),
            reg: copy("editionsReg"),
            weather: copy("editionsWeather"),
            temp: copy("editionsTemp"),
            kidsMail: copy("editionsKidsMail"),
            kidsPlace: copy("editionsKidsPlace"),
            adultMail: copy("editionsAdultMail"),
            adultPlace: copy("editionsAdultPlace"),
            prize: (place) => copy("editionsPrize", { place }),
            vet: (place) => copy("editionsVet", { place }),
            save: copy("create"),
          }}
        >
          <McvvAdminStartModelFields
            model={startModelFromEdition(latest)}
            champions={{
              men: latest ? latest.championBibMen : DEFAULT_CHAMPION_BIBS.men,
              women: latest ? latest.championBibWomen : DEFAULT_CHAMPION_BIBS.women,
            }}
            ranges={settings.ranges}
            categories={settings.categories}
            copy={startModelCopy(startCopy, chyba, false)}
          />
        </McvvAdminEditionForm>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
