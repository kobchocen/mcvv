/**
 * Texty Rozpisu v legacy znění (rozpis.php) – čisté pomocné funkce bez DB.
 *
 * Odstavce v i18n smějí obsahovat odkazy ve tvaru `<tag>text</tag>` (např. `<online>Online</online>`);
 * šablona Rozpisu je mapuje na cíle odkazů. Nový řádek (`\n`) = zalomení řádku jako `<br />` v legacy.
 */

export type RozpisSegment = { text: string; tag?: string };

const TAG_PATTERN = /<(\w+)>(.*?)<\/\1>/g;

/** Rozdělí odstavec na prostý text a odkazy `<tag>…</tag>`. */
export function splitRozpisMarkup(text: string): RozpisSegment[] {
  const segments: RozpisSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ text: text.slice(last, index) });
    }
    segments.push({ tag: match[1], text: match[2] ?? "" });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last) });
  }
  return segments;
}

const CS_WEEKDAY_GENITIVE: Record<string, string> = {
  pondělí: "pondělí",
  úterý: "úterý",
  středa: "středy",
  čtvrtek: "čtvrtka",
  pátek: "pátku",
  sobota: "soboty",
  neděle: "neděle",
};

/**
 * Termín online přihlášek (`mcvv_info.prihl_datum`, sloupec DATE → UTC půlnoc).
 * cs: „2. 12. 2026“, s dnem „středy 2. 12. 2026“ (2. pád jako legacy `csDen(…, 2)`);
 * en: „2 December 2026“, s dnem „Wednesday 2 December 2026“.
 */
export function formatRozpisDeadline(
  date: Date | null | undefined,
  locale: string,
  withWeekday: boolean,
): string {
  if (!date) {
    return "";
  }
  const cs = locale !== "en";
  const day = new Intl.DateTimeFormat(cs ? "cs-CZ" : "en-GB", {
    day: "numeric",
    month: cs ? "numeric" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  if (!withWeekday) {
    return day;
  }
  const weekday = new Intl.DateTimeFormat(cs ? "cs-CZ" : "en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
  return `${cs ? (CS_WEEKDAY_GENITIVE[weekday] ?? weekday) : weekday} ${day}`;
}
