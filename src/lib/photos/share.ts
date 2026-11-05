import type { Metadata } from "next";

/** Locale-prefixed path of a photo permalink, e.g. `/cs/fotogalerie/foto/5039`. */
export function photoPermalinkPath(locale: string, id: number): string {
  return `/${locale}/fotogalerie/foto/${id}`;
}

/** Path prefix the client appends a photo id to (`/cs/fotogalerie/foto/`). */
export function photoPermalinkBase(locale: string): string {
  return `/${locale}/fotogalerie/foto/`;
}

/** Positive integer id in canonical form ("5039"), otherwise null (→ 404). */
export function parsePhotoId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

/** Only photos that are listed in the public gallery may be opened by permalink. */
export function isPublicPhoto(photo: { hasImage: boolean } | null | undefined): boolean {
  return Boolean(photo?.hasImage);
}

export type PhotoShareMetaInput = {
  /** Public origin without trailing slash (siteUrl()). */
  base: string;
  locale: string;
  locales: readonly string[];
  photo: { id: number; year: number; width: number | null; height: number | null };
  title: string;
  description: string;
  alt: string;
  siteName: string;
};

const OG_LOCALE: Record<string, string> = { cs: "cs_CZ", en: "en_US" };

/**
 * Open Graph / Twitter metadata of a photo permalink. Deliberately built from the year
 * only: no runner names, no free-text description (it may name people).
 */
export function photoShareMetadata(input: PhotoShareMetaInput): Metadata {
  const { base, locale, locales, photo, title, description, alt, siteName } = input;
  const url = `${base}${photoPermalinkPath(locale, photo.id)}`;
  const image = {
    url: `${base}/api/fotka?id=${photo.id}`,
    ...(photo.width && photo.height ? { width: photo.width, height: photo.height } : {}),
    alt,
    type: "image/jpeg",
  };
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        locales.map((code) => [code, `${base}${photoPermalinkPath(code, photo.id)}`]),
      ),
    },
    openGraph: {
      type: "website",
      url,
      siteName,
      title,
      description,
      locale: OG_LOCALE[locale] ?? locale,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image.url, alt }],
    },
  };
}
