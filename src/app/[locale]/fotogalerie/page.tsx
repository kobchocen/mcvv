import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { type Locale } from "@/i18n/routing";

import { PhotoGalleryView } from "./_components/photo-gallery-view";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "PhotoGallery" });
  return { title: t("title") };
}

export default async function PhotoGalleryPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const { year: yearParam } = await searchParams;
  const year = yearParam ? Number(yearParam) : null;

  return <PhotoGalleryView locale={locale} year={Number.isInteger(year) ? year : null} />;
}

export const dynamic = "force-dynamic";
