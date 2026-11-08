import type { ReactNode } from "react";

/**
 * Documented Mapy.com point URL (lon,lat). Zoom 17 keeps the pin local;
 * marker is required or the map only recentres.
 * https://developer.mapy.com/cs/dalsi-vyuziti-mapy-cz/url-mapy-cz/
 */
function mapyPoint(lon: string, lat: string): string {
  return `https://mapy.com/fnc/v1/showmap?center=${lon},${lat}&zoom=17&marker=true`;
}

/** DMS strings printed in Pokyny, converted to the same point. */
export const GPS_HREFS = {
  "49°59'45\"N, 16°12'10\"E": mapyPoint("16.2027778", "49.9958333"),
  "49°59'36.018\"N, 16°12'15.656\"E": mapyPoint("16.2043489", "49.9933383"),
  "49°59'40.238\"N, 16°12'45.698\"E": mapyPoint("16.2126939", "49.9945106"),
} as const;

/** Same file McvvCourseMap loads (`public/images/mcvv-trasa.svg`). */
export const COURSE_MAP_HREF = "/images/mcvv-trasa.svg";

export const instructionLinkClass =
  "font-medium text-race-accent underline-offset-2 hover:underline";

const externalLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

export function instructionParts(text: string): Array<{ text: string; href?: string }> {
  const keys = Object.keys(GPS_HREFS).sort((a, b) => b.length - a.length);
  const parts: Array<{ text: string; href?: string }> = [];
  let rest = text;
  while (rest.length > 0) {
    let foundAt = -1;
    let foundKey = "";
    for (const key of keys) {
      const at = rest.indexOf(key);
      if (at !== -1 && (foundAt === -1 || at < foundAt)) {
        foundAt = at;
        foundKey = key;
      }
    }
    if (foundAt === -1 || foundKey === "") {
      parts.push({ text: rest });
      break;
    }
    if (foundAt > 0) parts.push({ text: rest.slice(0, foundAt) });
    parts.push({ text: foundKey, href: GPS_HREFS[foundKey as keyof typeof GPS_HREFS] });
    rest = rest.slice(foundAt + foundKey.length);
  }
  return parts;
}

export function InstructionText({ text }: { text: string }) {
  const parts = instructionParts(text);
  return parts.map((part, index) =>
    part.href ? (
      <a
        key={`${part.href}-${index}`}
        href={part.href}
        className={instructionLinkClass}
        {...externalLinkProps}
      >
        {part.text}
      </a>
    ) : (
      <span key={`t-${index}`}>{part.text}</span>
    ),
  );
}

export function CourseMapLink({ label }: { label: string }): ReactNode {
  return (
    <a href={COURSE_MAP_HREF} className={instructionLinkClass} {...externalLinkProps}>
      {label}
    </a>
  );
}
