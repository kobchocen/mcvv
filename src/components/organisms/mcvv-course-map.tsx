import { readFileSync } from "node:fs";
import { join } from "node:path";

import styles from "./mcvv-course-map.module.css";

let cachedMarkup: string | null = null;

function getCourseMapMarkup() {
  if (cachedMarkup) {
    return cachedMarkup;
  }

  const raw = readFileSync(join(process.cwd(), "public/images/mcvv-trasa.svg"), "utf8");
  cachedMarkup = raw
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<!DOCTYPE[^>]*>/, "")
    .trim();
  return cachedMarkup;
}

export type McvvCourseMapProps = {
  alt: string;
};

export function McvvCourseMap({ alt }: McvvCourseMapProps) {
  return (
    <div
      className={`${styles.wrap} mcvv-course-map`}
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: getCourseMapMarkup() }}
    />
  );
}
