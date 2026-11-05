"use client";

import { useState } from "react";

import { PhotoTile } from "./photo-tile";
import { PhotoLightbox, type PhotoLightboxShare } from "./photo-lightbox";

export type PhotoGalleryItem = {
  id: number;
  caption: string;
  alt: string;
};

export type PhotoGalleryShare = {
  /** Permalink prefix the photo id is appended to, e.g. `/cs/fotogalerie/foto/`. */
  permalinkBase: string;
  /** Address restored when the lightbox closes, e.g. `/cs/fotogalerie?year=2014`. */
  galleryPath: string;
  /** Share-sheet title (same for the whole year). */
  title: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
};

export type PhotoGalleryGridProps = {
  photos: PhotoGalleryItem[];
  loadMoreLabel: string;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
  /** Open this photo in the lightbox on load (photo permalink). */
  initialPhotoId?: number;
  /** Permalinks + "Sdílet" button; the address bar follows the open photo. */
  share?: PhotoGalleryShare;
};

const PAGE_SIZE = 20;

/** Index of the photo a permalink opens, or null. */
export function initialLightboxIndex(
  photos: readonly { id: number }[],
  initialPhotoId?: number,
): number | null {
  if (initialPhotoId === undefined) return null;
  const index = photos.findIndex((photo) => photo.id === initialPhotoId);
  return index === -1 ? null : index;
}

export function PhotoGalleryGrid({
  photos,
  loadMoreLabel,
  closeLabel,
  previousLabel,
  nextLabel,
  initialPhotoId,
  share,
}: PhotoGalleryGridProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(() =>
    initialLightboxIndex(photos, initialPhotoId),
  );
  const [visible, setVisible] = useState(() => Math.max(PAGE_SIZE, (activeIndex ?? 0) + 1));
  const shown = photos.slice(0, visible);

  const open = (index: number | null) => {
    // Keep the grid in sync when arrows move past the loaded page.
    if (index !== null && index >= visible) setVisible(index + 1);
    setActiveIndex(index);
    if (share && typeof window !== "undefined") {
      // The address bar always holds a shareable link to the open photo.
      const photo = index === null ? null : photos[index];
      const next = photo ? `${share.permalinkBase}${photo.id}` : share.galleryPath;
      if (window.location.pathname + window.location.search !== next) {
        window.history.replaceState(null, "", next);
      }
    }
  };

  const lightboxShare: PhotoLightboxShare | undefined = share
    ? {
        urlFor: (id) => `${share.permalinkBase}${id}`,
        titleFor: () => share.title,
        label: share.label,
        copiedLabel: share.copiedLabel,
        failedLabel: share.failedLabel,
      }
    : undefined;

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            title={photo.caption}
            onClick={() => open(index)}
            className="relative aspect-[3/4] cursor-zoom-in overflow-hidden border border-race-line/60 bg-race-forest text-left"
          >
            <PhotoTile
              src={`/api/fotka?id=${photo.id}`}
              alt={photo.alt}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={index < 4}
              className="object-cover"
            />
          </button>
        ))}
      </div>
      {visible < photos.length ? (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
          className="mt-6 border border-race-line/60 bg-race-surface px-4 py-2 text-sm font-semibold text-foreground hover:border-race-accent"
        >
          {loadMoreLabel}
        </button>
      ) : null}

      <PhotoLightbox
        photos={photos.map((photo) => ({
          id: photo.id,
          alt: photo.alt,
          title: photo.caption,
          caption: photo.caption,
        }))}
        activeIndex={activeIndex}
        onActiveIndexChange={open}
        closeLabel={closeLabel}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        share={lightboxShare}
      />
    </>
  );
}
