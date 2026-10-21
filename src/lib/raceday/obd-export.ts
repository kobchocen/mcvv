/**
 * Export podkladů pro OBD (časomíra LuM) – 1:1 s legacy `data/prihl2obd.php` (#117).
 *
 * Čisté funkce bez DB: data dostanou už seřazená stejnými SQL dotazy jako legacy
 * (viz `obd-export-data.ts`), tady se jen formátuje přesně jako PHP:
 *
 * ```
 * \n#kategorie\n{id};{trim(jmeno)};{floor(rekord/60)}:{%02d rekord%60}\n …
 * \n#oddily\n{id};{trim(jmeno)}\n …          (jen první řádek každého id, ORDER BY id, rok DESC)
 * \n#bezci\n{id};{trim(jmeno)}\n …
 * \n#startovka\n{bezec};{klub};{kateg};{rok};{%03d cislo}\n …
 * ```
 *
 * Oddělovač `;`, konec řádku `\n`, bez hlavičky a uvozovek, kódování windows-1250.
 */
import {
  encodeWindows1250,
  transliterateToWindows1250,
  unencodableChars,
} from "@/lib/encoding/windows-1250";

export type ObdCategory = { id: string; name: string; record: number };
export type ObdClub = { id: string; name: string };
export type ObdRunner = { id: string; name: string };
export type ObdStart = {
  runnerId: string;
  clubId: string;
  categoryId: string;
  year: number;
  bib: number;
};

export type ObdExportData = {
  year: number;
  /** `SELECT id, jmeno, rekord FROM cis_mcvv_kateg ORDER BY id` */
  categories: ObdCategory[];
  /** `SELECT id, jmeno FROM cis_klub ORDER BY id, rok DESC` (všechny roky) */
  clubs: ObdClub[];
  /** `SELECT id, jmeno FROM cis_bezec ORDER BY id` */
  runners: ObdRunner[];
  /** `… FROM mcvv_prihlaska_radek WHERE rok = {rok} AND cislo > 0 ORDER BY cislo, kateg_id, bezec_id` */
  starts: ObdStart[];
};

/** PHP `trim()` – jen " \t\n\r\0\x0B" (ne Unicode mezery jako JS `trim`). */
export function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");
}

const PHP_NUMERIC = /^[ \t\n\r\v\f]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[ \t\n\r\v\f]*$/;

/** PHP 8 `$a != $b` pro dva řetězce: číselné řetězce se porovnávají jako čísla ("010" == "10"). */
export function phpLooseEquals(left: string, right: string): boolean {
  if (PHP_NUMERIC.test(left) && PHP_NUMERIC.test(right)) {
    return Number(left) === Number(right);
  }
  return left === right;
}

/** Legacy `timeConv`: sekundy → `m:ss` (minuty bez doplnění). */
export function timeConv(seconds: number): string {
  const whole = Math.trunc(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** PHP `sprintf("%03d", n)`. */
export function bib3(bib: number): string {
  const whole = Math.trunc(bib);
  return whole < 0 ? `-${String(-whole).padStart(2, "0")}` : String(whole).padStart(3, "0");
}

/** Vynechá opakované id (legacy: `if ($row['id'] != $oldid)` s volným porovnáním PHP). */
function firstPerId<T extends { id: string }>(rows: readonly T[]): T[] {
  const out: T[] = [];
  let previous = "";
  for (const row of rows) {
    if (!phpLooseEquals(row.id, previous)) {
      out.push(row);
      previous = row.id;
    }
  }
  return out;
}

/** Řádky sekce `#oddily` (jeden na id, nejnovější rok). */
export function firstClubRows(clubs: readonly ObdClub[]): ObdClub[] {
  return firstPerId(clubs);
}

/** Textová podoba exportu přesně tak, jak ji legacy skript vypisoval (`echo`). */
export function buildObdExportText(data: ObdExportData): string {
  let out = "\n#kategorie\n";
  for (const row of firstPerId(data.categories)) {
    out += `${row.id};${phpTrim(row.name)};${timeConv(row.record)}\n`;
  }
  out += "\n#oddily\n";
  for (const row of firstPerId(data.clubs)) {
    out += `${row.id};${phpTrim(row.name)}\n`;
  }
  out += "\n#bezci\n";
  for (const row of data.runners) {
    out += `${row.id};${phpTrim(row.name)}\n`;
  }
  out += "\n#startovka\n";
  for (const row of data.starts) {
    out += `${row.runnerId};${row.clubId};${row.categoryId};${row.year};${bib3(row.bib)}\n`;
  }
  return out;
}

/** Statický obal legacy HTML stránky (přesně bajty mimo PHP bloky souboru prihl2obd.php). */
export const LEGACY_HTML_PREFIX =
  "<!DOCTYPE html>\n" +
  '<html lang="en">    \n' +
  "    <head>\n" +
  "        <title>MCVV - export dat</title>\n" +
  "        <!-- META TAGS -->\n" +
  '\t\t<meta http-equiv="Content-Type" content="text/html; charset=windows-1250">\n' +
  "    </head>    \n" +
  "    <body>\n" +
  "\t\t<pre>\n" +
  "\t\t";
export const LEGACY_HTML_SUFFIX = "</pre>\n</body>\n</html>";

/** Celá legacy HTML stránka (`<pre>` s exportem), jak ji vracelo `data/prihl2obd.php`. */
export function buildObdLegacyHtml(text: string): string {
  return LEGACY_HTML_PREFIX + text + LEGACY_HTML_SUFFIX;
}

export type ObdEncodingIssue = {
  section: "kategorie" | "oddily" | "bezci";
  id: string;
  name: string;
  chars: string[];
  replacement: string;
};

/** Záznamy, jejichž jméno nejde zapsat ve windows-1250 (export je pak potřeba vyřešit). */
export function findEncodingIssues(data: ObdExportData): ObdEncodingIssue[] {
  const issues: ObdEncodingIssue[] = [];
  const check = (section: ObdEncodingIssue["section"], id: string, raw: string) => {
    const name = phpTrim(raw);
    const chars = unencodableChars(`${id}${name}`);
    if (chars.length > 0) {
      issues.push({ section, id, name, chars, replacement: transliterateToWindows1250(name) });
    }
  };
  for (const row of firstPerId(data.categories)) check("kategorie", row.id, row.name);
  for (const row of firstPerId(data.clubs)) check("oddily", row.id, row.name);
  for (const row of data.runners) check("bezci", row.id, row.name);
  return issues;
}

/** Data s přepsanými (transliterovanými) jmény – jen na výslovnou žádost uživatele. */
export function withTransliteratedNames(data: ObdExportData): ObdExportData {
  const fix = <T extends { id: string; name: string }>(rows: T[]): T[] =>
    rows.map((row) => ({
      ...row,
      id: transliterateToWindows1250(row.id),
      name: transliterateToWindows1250(row.name),
    }));
  return {
    ...data,
    categories: fix(data.categories),
    clubs: fix(data.clubs),
    runners: fix(data.runners),
  };
}

export type ObdExportFormat = "txt" | "html";

export type ObdExportFile = {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
};

/** Hotový soubor ve windows-1250 (`txt` = jen data, `html` = legacy stránka 1:1). */
export function renderObdExport(data: ObdExportData, format: ObdExportFormat): ObdExportFile {
  const text = buildObdExportText(data);
  if (format === "html") {
    return {
      bytes: encodeWindows1250(buildObdLegacyHtml(text)),
      filename: `prihl2obd-${data.year}.html`,
      contentType: "text/html; charset=windows-1250",
    };
  }
  return {
    bytes: encodeWindows1250(text),
    filename: `prihl2obd-${data.year}.txt`,
    contentType: "text/plain; charset=windows-1250",
  };
}

export type ObdStartWarning =
  | { kind: "duplicate_bib"; bib: number; runnerIds: string[] }
  | { kind: "cancelled_registration"; bib: number; runnerId: string };

/** Kontroly startovky před exportem (export je i tak 1:1, jen upozorní). */
export function startWarnings(
  starts: readonly ObdStart[],
  cancelledRunnerIds: ReadonlySet<string> = new Set(),
): ObdStartWarning[] {
  const warnings: ObdStartWarning[] = [];
  const byBib = new Map<number, string[]>();
  for (const row of starts) {
    byBib.set(row.bib, [...(byBib.get(row.bib) ?? []), row.runnerId]);
    if (cancelledRunnerIds.has(row.runnerId)) {
      warnings.push({ kind: "cancelled_registration", bib: row.bib, runnerId: row.runnerId });
    }
  }
  for (const [bib, runnerIds] of byBib) {
    if (runnerIds.length > 1) warnings.push({ kind: "duplicate_bib", bib, runnerIds });
  }
  return warnings;
}
