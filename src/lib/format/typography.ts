/**
 * Conservative typography helpers for plain-text user-facing strings.
 *
 * - `nbspUnits` joins a number and a following unit with a non-breaking
 *   space (U+00A0): "15 s", "5 km", "100 Kč", "10 %".
 * - `czTypo` additionally joins Czech one-letter prepositions/conjunctions
 *   (v, k, s, z, o, u, a, i) with the following word.
 *
 * Intended for plain text only — never apply to HTML attributes, URLs or
 * markup-bearing strings.
 */

export const NBSP = "\u00A0";

const UNITS = [
  "Kč",
  "EUR",
  "€",
  "km",
  "m",
  "cm",
  "mm",
  "min",
  "h",
  "s",
  "kg",
  "g",
  "l",
  "%",
  "°C",
  "ks",
  "let",
];

const UNIT_RE = new RegExp(
  `(\\d|\\})[ ](${UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[\\s.,;:!?)\\]…/"“”])`,
  "gu",
);

// One-letter word at start or after whitespace/opening punctuation, but not a
// unit following a number ("15 s od" must not become "15 s\u00A0od").
const CZ_ONE_LETTER_RE = /(?<=^|[\s(„"“])(?<![\d}][ \u00A0])([vkszouaiVKSZOUAI]) (?=\S)/gu;

export function nbspUnits(text: string): string {
  return text.replace(UNIT_RE, `$1${NBSP}$2`);
}

export function czTypo(text: string): string {
  return nbspUnits(text.replace(CZ_ONE_LETTER_RE, `$1${NBSP}`));
}

export function typoForLocale(text: string, locale: string): string {
  return locale === "cs" ? czTypo(text) : nbspUnits(text);
}
