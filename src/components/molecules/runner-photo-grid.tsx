"use client";

import Image from "next/image";
import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
};

const PAGE_SIZE = 12;

export function RunnerPhotoGrid({ photos, name, loadMoreLabel, closeLabel }: RunnerPhotoGridProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [active, setActive] = useState<RunnerPhotoItem | null>(null);
  const shown = photos.slice(0, visible);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setActive(photo)}
            className="relative aspect-[3/4] cursor-zoom-in overflow-hidden border border-race-line/60 bg-race-forest text-left"
          >
            <Image
              src={`/api/fotka?id=${photo.id}`}
              alt={`${name} ${photo.year}`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent
          aria-modal="true"
          className="max-h-[92vh] overflow-auto border-race-line bg-race-deep p-3 sm:max-w-5xl"
        >
          <DialogTitle className="pr-8 font-display text-xl text-foreground dark:text-white">
            {active ? `${active.year}${active.caption ? ` — ${active.caption}` : ""}` : name}
          </DialogTitle>
          {active ? (
            <div className="relative">
              {/* Native img so the modal can show the photo at natural size. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/fotka?id=${active.id}`}
                alt={`${name} ${active.year}`}
                className="mx-auto max-h-[75vh] w-auto max-w-full"
              />
              <p className="sr-only">{closeLabel}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
