"use client";

import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type McvvCourseMapLightboxProps = {
  preview: ReactNode;
  expanded: ReactNode;
  expandLabel: string;
};

export function McvvCourseMapLightbox({
  preview,
  expanded,
  expandLabel,
}: McvvCourseMapLightboxProps) {
  return (
    <div className="lg:h-full">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={expandLabel}
            className="relative h-full w-full max-w-sm cursor-zoom-in overflow-hidden border border-race-line/60 bg-race-deep text-left lg:max-w-none [&_.mcvv-course-map_svg]:mx-auto [&_.mcvv-course-map_svg]:max-h-52 lg:[&_.mcvv-course-map_svg]:max-h-none"
          >
            {preview}
          </button>
        </DialogTrigger>
        <DialogContent
          aria-modal="true"
          className="max-h-[92vh] overflow-auto border-race-line bg-race-deep p-2 sm:max-w-5xl"
        >
          <DialogTitle className="sr-only">{expandLabel}</DialogTitle>
          <div className="relative">{expanded}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
