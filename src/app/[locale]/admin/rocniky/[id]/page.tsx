import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminEditionForm } from "@/components/organisms/mcvv-admin-edition-form";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("editionsTitle") };
}

export default async function AdminEditEditionPage({ params }: PageProps) {
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

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="mb-4">
          <Link
            href="/admin/rocniky"
            className="text-sm font-medium text-race-accent hover:underline"
          >
            {copy("back")}
          </Link>
        </p>
        <h1 className="mb-8 font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("edit")} — {edition.id}
        </h1>
        <McvvAdminEditionForm
          edition={edition}
          copy={{
            date: copy("editionsDate"),
            reg: copy("editionsReg"),
            interval: copy("editionsInterval"),
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
        />
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
