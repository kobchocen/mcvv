"use client";

import { useState } from "react";

import { PhotoTile } from "./photo-tile";
import { PhotoLightbox } from "./photo-lightbox";

export type PhotoGalleryItem = {
  id: number;
  caption: string;
  alt: string;
};

export type PhotoGalleryGridProps = {
  photos: PhotoGalleryItem[];
  loadMoreLabel: string;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
};

const PAGE_SIZE = 20;

export function PhotoGalleryGrid({
  photos,
  loadMoreLabel,
  closeLabel,
  previousLabel,
  nextLabel,
}: PhotoGalleryGridProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const shown = photos.slice(0, visible);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            title={photo.caption}
            onClick={() => setActiveIndex(index)}
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
        onActiveIndexChange={(index) => {
          // Keep the grid in sync when arrows move past the loaded page.
          if (index !== null && index >= visible) setVisible(index + 1);
          setActiveIndex(index);
        }}
        closeLabel={closeLabel}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
      />
    </>
  );
}
