"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type PhotoTileProps = {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  /** Eager-load and preload (first visible row). */
  priority?: boolean;
};

/**
 * Archive photos from /api/fotka are already small JPEGs (≈450–800 px, ≈60–100 kB),
 * so they bypass the Next image optimizer (re-encoding on a small container added
 * seconds under load) and are served directly with long immutable caching.
 * A shimmer placeholder is shown until the image is decoded, then it fades in.
 */
export function PhotoTile({ src, alt, sizes, className, priority = false }: PhotoTileProps) {
  const [loaded, setLoaded] = useState(false);
  const isArchivePhoto = src.startsWith("/api/fotka");

  return (
    <>
      {loaded ? null : <span aria-hidden="true" className="photo-shimmer absolute inset-0" />}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={isArchivePhoto}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={cn(
          "transition-opacity duration-500 ease-out motion-reduce:transition-none",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}
