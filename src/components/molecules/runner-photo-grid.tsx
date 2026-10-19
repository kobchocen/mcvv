"use client";

import { useState } from "react";

import { PhotoTile } from "./photo-tile";
import { PhotoLightbox } from "./photo-lightbox";

export type RunnerPhotoItem = {
  id: number;
  year: number;
  caption: string;
};

export type RunnerPhotoGridProps = {
  photos: RunnerPhotoItem[];
  name: string;
  loadMoreLabel: string;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
};

const PAGE_SIZE = 12;

export function RunnerPhotoGrid({
  photos,
  name,
  loadMoreLabel,
  closeLabel,
  previousLabel,
  nextLabel,
}: RunnerPhotoGridProps) {
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
            onClick={() => setActiveIndex(index)}
            className="relative aspect-[3/4] cursor-zoom-in overflow-hidden border border-race-line/60 bg-race-forest text-left"
          >
            <PhotoTile
              src={`/api/fotka?id=${photo.id}`}
              alt={`${name} ${photo.year}`}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={index < 4}
              className="object-cover"
            />
            <span className="absolute right-1 bottom-1 bg-black/65 px-1.5 py-0.5 text-xs font-semibold text-white">
              {photo.year}
            </span>
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
          alt: `${name} ${photo.year}`,
          title: `${photo.year}${photo.caption ? ` — ${photo.caption}` : ""}`,
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
