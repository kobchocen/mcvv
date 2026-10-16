import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db/client";
import type { PhotoMeta } from "./gallery";

const REVALIDATE_SECONDS = 600;
export const PHOTOS_CACHE_TAG = "photos";

/** Homepage candidates: metadata only, served by index (rok, has_image). Never reads blobs. */
export const getHomepagePhotoCandidates = unstable_cache(
  async (minYear: number): Promise<PhotoMeta[]> =>
    prisma.photo.findMany({
      where: { hasImage: true, year: { gte: minYear } },
      select: { id: true, width: true, height: true },
    }),
  ["homepage-photo-candidates"],
  { revalidate: REVALIDATE_SECONDS, tags: [PHOTOS_CACHE_TAG] },
);

/** Photo counts per year for the gallery year switcher. */
export const getPhotoYearCounts = unstable_cache(
  async (): Promise<{ year: number; count: number }[]> => {
    const rows = await prisma.photo.groupBy({
      by: ["year"],
      where: { hasImage: true },
      _count: { id: true },
      orderBy: { year: "desc" },
    });
    return rows.map((row) => ({ year: row.year, count: row._count.id }));
  },
  ["photo-year-counts"],
  { revalidate: REVALIDATE_SECONDS, tags: [PHOTOS_CACHE_TAG] },
);

/** Gallery listing for one year (no image column). */
export const getGalleryPhotos = unstable_cache(
  async (year: number) =>
    prisma.photo.findMany({
      where: { year, hasImage: true },
      select: {
        id: true,
        year: true,
        debugText: true,
        location: { select: { desc: true } },
        runners: {
          select: { runner: { select: { name: true } } },
          orderBy: { orderFromLeft: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
  ["gallery-photos"],
  { revalidate: REVALIDATE_SECONDS, tags: [PHOTOS_CACHE_TAG] },
);
