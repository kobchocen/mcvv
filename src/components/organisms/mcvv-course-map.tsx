"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./mcvv-course-map.module.css";

/**
 * The course map SVG is ~1.1 MB. It used to be inlined into the server-rendered HTML
 * (and duplicated in the RSC payload because it was passed to the client lightbox),
 * which made the homepage document ~3.6 MB. It is now fetched once by the browser
 * (gzip ~270 kB, HTTP-cached) when the map approaches the viewport, and injected inline
 * so the theme CSS overrides in mcvv-course-map.module.css still apply.
 */
const MAP_URL = "/images/mcvv-trasa.svg";

let markupPromise: Promise<string> | null = null;

function loadCourseMapMarkup(): Promise<string> {
  markupPromise ??= fetch(MAP_URL)
    .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
    .then((raw) =>
      raw
        .replace(/<\?xml[^>]*>/, "")
        .replace(/<!DOCTYPE[^>]*>/, "")
        .trim(),
    )
    .catch((error: unknown) => {
      markupPromise = null;
      throw error;
    });
  return markupPromise;
}

export type McvvCourseMapProps = {
  alt: string;
};

export function McvvCourseMap({ alt }: McvvCourseMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    let cancelled = false;
    const load = () => {
      loadCourseMapMarkup()
        .then((value) => {
          if (!cancelled) {
            setMarkup(value);
          }
        })
        .catch(() => undefined);
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.wrap} mcvv-course-map`}
      role="img"
      aria-label={alt}
      style={markup ? undefined : { aspectRatio: "1779 / 1396" }}
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
    />
  );
}
