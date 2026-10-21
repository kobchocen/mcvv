import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminEditionForm } from "@/components/organisms/mcvv-admin-edition-form";
import { McvvAdminStartModelFields } from "@/components/organisms/mcvv-admin-start-model-fields";
import { startModelCopy } from "@/components/organisms/mcvv-admin-start-model-copy";
import { prisma } from "@/lib/db/client";
import { loadStartSettings } from "@/lib/race/startlist-load";
import { startModelFromEdition } from "@/lib/race/start-time";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ chyba?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("editionsTitle") };
}

export default async function AdminEditEditionPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale, id: rawId } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    notFound();
  }
  const edition = await prisma.edition.findUnique({ where: { id } });
  if (!edition) {
    notFound();
  }
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const startCopy = await getTranslations({ locale, namespace: "StartAdmin" });
  const settings = await loadStartSettings(edition.date.getUTCFullYear());
  const { chyba } = await searchParams;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="mb-8 font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("edit")} — {edition.id}
        </h1>
        <McvvAdminEditionForm
          edition={edition}
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
            save: copy("save"),
          }}
        >
          <McvvAdminStartModelFields
            model={startModelFromEdition(edition)}
            champions={{ men: edition.championBibMen, women: edition.championBibWomen }}
            ranges={settings.ranges}
            categories={settings.categories}
            copy={startModelCopy(startCopy, chyba, !settings.rangesStored)}
          />
        </McvvAdminEditionForm>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
