"use client";

import Image from "next/image";
import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type PhotoGalleryItem = {
  id: number;
  caption: string;
  alt: string;
};

export type PhotoGalleryGridProps = {
  photos: PhotoGalleryItem[];
  loadMoreLabel: string;
  closeLabel: string;
};

const PAGE_SIZE = 20;

export function PhotoGalleryGrid({ photos, loadMoreLabel, closeLabel }: PhotoGalleryGridProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [active, setActive] = useState<PhotoGalleryItem | null>(null);
  const shown = photos.slice(0, visible);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((photo) => (
          <button
            key={photo.id}
            type="button"
            title={photo.caption}
            onClick={() => setActive(photo)}
            className="relative aspect-[3/4] cursor-zoom-in overflow-hidden border border-race-line/60 bg-race-forest text-left"
          >
            <Image
              src={`/api/fotka?id=${photo.id}`}
              alt={photo.alt}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent
          aria-modal="true"
          className="max-h-[92vh] overflow-auto border-race-line bg-race-deep p-3 sm:max-w-5xl"
        >
          <DialogTitle className="pr-8 font-display text-xl text-foreground dark:text-white">
            {active?.caption ?? ""}
          </DialogTitle>
          {active ? (
            <div className="relative">
              {/* Native img so the modal can show the photo at natural size. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/fotka?id=${active.id}`}
                alt={active.alt}
                className="mx-auto max-h-[75vh] w-auto max-w-full"
              />
              <p className="mt-3 text-sm leading-6 text-race-muted">{active.caption}</p>
              <p className="sr-only">{closeLabel}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
