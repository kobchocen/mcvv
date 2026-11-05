import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { locales, type Locale } from "@/i18n/routing";
import { getPublicPhoto } from "@/lib/photos/queries";
import { parsePhotoId, photoShareMetadata } from "@/lib/photos/share";
import { siteUrl } from "@/lib/site/url";

import { PhotoGalleryView } from "../../_components/photo-gallery-view";

const SITE_NAME = "Malá cena Velké Verandy";

type PageProps = Readonly<{ params: Promise<{ locale: string; id: string }> }>;

/** Published photo by permalink id, or 404 (missing, malformed or unpublished). */
async function loadPhoto(rawId: string) {
  const id = parsePhotoId(rawId);
  const photo = id === null ? null : await getPublicPhoto(id);
  if (!photo) notFound();
  return photo;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale, id } = await params;
  const locale = requestedLocale as Locale;
  const photo = await loadPhoto(id);
  const t = await getTranslations({ locale, namespace: "PhotoGallery" });
  return photoShareMetadata({
    base: siteUrl(),
    locale,
    locales,
    photo,
    title: t("shareTitle", { year: photo.year }),
    description: t("shareDescription", { year: photo.year }),
    alt: t("photoAlt", { year: photo.year }),
    siteName: SITE_NAME,
  });
}

/** Photo permalink: the year's gallery with this photo open in the lightbox. */
export default async function PhotoPermalinkPage({ params }: PageProps) {
  const { locale: requestedLocale, id } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const photo = await loadPhoto(id);
  return <PhotoGalleryView locale={locale} year={photo.year} initialPhotoId={photo.id} />;
}

export const dynamic = "force-dynamic";
