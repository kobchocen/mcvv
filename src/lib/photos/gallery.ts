export type PhotoMeta = { id: number; width: number | null; height: number | null };

/** Portrait when known; unknown dimensions return null (no blob reads to find out). */
export function isPortraitMeta(photo: PhotoMeta): boolean | null {
  if (!photo.width || !photo.height) return null;
  return photo.height > photo.width;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick gallery ids from metadata only. Prefers known-portrait photos; when there
 * are not enough of them, falls back to photos with unknown orientation (never
 * known-landscape unless nothing else is available).
 */
export function pickGalleryPhotoIds(
  photos: readonly PhotoMeta[],
  count = 7,
  random: () => number = Math.random,
): number[] {
  const portrait = photos.filter((p) => isPortraitMeta(p) === true);
  if (portrait.length >= count)
    return shuffle(portrait, random)
      .slice(0, count)
      .map((p) => p.id);
  const unknown = photos.filter((p) => isPortraitMeta(p) === null);
  const landscape = photos.filter((p) => isPortraitMeta(p) === false);
  return [...shuffle(portrait, random), ...shuffle(unknown, random), ...shuffle(landscape, random)]
    .slice(0, count)
    .map((p) => p.id);
}
