"use client";

import type { KeyboardEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { stepLightboxIndex, type LightboxDirection } from "@/lib/photos/lightbox";

export type PhotoLightboxItem = {
  id: number;
  alt: string;
  title: string;
  caption?: string;
};

export type PhotoLightboxProps = {
  photos: PhotoLightboxItem[];
  /** Index of the open photo; null keeps the lightbox closed. */
  activeIndex: number | null;
  onActiveIndexChange: (index: number | null) => void;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
  /** Cycle from the last photo to the first (and back). Default: stop at the ends. */
  wrap?: boolean;
};

const navButtonClass =
  "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center border border-race-line/60 bg-black/60 text-white transition-opacity hover:border-race-accent focus-visible:outline-2 focus-visible:outline-race-accent disabled:pointer-events-none disabled:opacity-0";

export function PhotoLightbox({
  photos,
  activeIndex,
  onActiveIndexChange,
  closeLabel,
  previousLabel,
  nextLabel,
  wrap = false,
}: PhotoLightboxProps) {
  const active = activeIndex === null ? null : (photos[activeIndex] ?? null);
  const step = (direction: LightboxDirection) =>
    activeIndex === null ? null : stepLightboxIndex(activeIndex, photos.length, direction, wrap);
  const previousIndex = step(-1);
  const nextIndex = step(1);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target =
      event.key === "ArrowLeft"
        ? previousIndex
        : event.key === "ArrowRight"
          ? nextIndex
          : undefined;
    if (target === undefined) return;
    event.preventDefault();
    if (target !== null) onActiveIndexChange(target);
  };

  return (
    <Dialog open={active !== null} onOpenChange={(open) => !open && onActiveIndexChange(null)}>
      <DialogContent
        aria-modal="true"
        onKeyDown={onKeyDown}
        className="max-h-[92vh] overflow-auto border-race-line bg-race-deep p-3 sm:max-w-5xl"
      >
        <DialogTitle className="pr-8 font-display text-xl text-foreground dark:text-white">
          {active?.title ?? ""}
        </DialogTitle>
        {active ? (
          <div className="relative">
            {/* Native img so the modal can show the photo at natural size. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={active.id}
              src={`/api/fotka?id=${active.id}`}
              alt={active.alt}
              className="mx-auto max-h-[75vh] w-auto max-w-full"
            />
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  aria-label={previousLabel}
                  title={previousLabel}
                  disabled={previousIndex === null}
                  onClick={() => previousIndex !== null && onActiveIndexChange(previousIndex)}
                  className={`${navButtonClass} left-1`}
                >
                  <ChevronLeftIcon className="size-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={nextLabel}
                  title={nextLabel}
                  disabled={nextIndex === null}
                  onClick={() => nextIndex !== null && onActiveIndexChange(nextIndex)}
                  className={`${navButtonClass} right-1`}
                >
                  <ChevronRightIcon className="size-6" aria-hidden="true" />
                </button>
              </>
            ) : null}
            {active.caption ? (
              <p className="mt-3 text-sm leading-6 text-race-muted">{active.caption}</p>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {`${(activeIndex ?? 0) + 1} / ${photos.length}`}
            </p>
            <p className="sr-only">{closeLabel}</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
