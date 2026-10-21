/**
 * Čtení souborů z OBD (časomíra LuM) – formáty 1:1 s legacy `admin/import.php`
 * a `admin/importres.php`: oddělovač `;`, bez hlavičky, bez uvozovek (jako `fgetcsv`
 * zvládne i pole v `"…"`), kódování windows-1250. Toleruje UTF-8 s BOM a rozpozná
 * UTF-8 bez BOM (s upozorněním). Čisté funkce bez DB.
 */
import { decodeWindows1250 } from "@/lib/encoding/windows-1250";

export type ObdFileEncoding = "windows-1250" | "utf-8-bom" | "utf-8";

export type DecodedObdFile = { text: string; encoding: ObdFileEncoding };

export class ObdDecodeError extends Error {}

const UTF8_BOM = [0xef, 0xbb, 0xbf];

/**
 * Dekóduje soubor: UTF-8 BOM → UTF-8; jinak windows-1250. Výjimka: obsah je platné
 * UTF-8 s vícebajtovými znaky (česká windows-1250 data téměř nikdy platné UTF-8 netvoří),
 * pak UTF-8 a volající zobrazí upozornění.
 */
export function decodeObdFile(bytes: Uint8Array): DecodedObdFile {
  if (UTF8_BOM.every((byte, index) => bytes[index] === byte)) {
    try {
      return {
        text: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(3)),
        encoding: "utf-8-bom",
      };
    } catch {
      throw new ObdDecodeError("utf8");
    }
  }
  if (bytes.some((byte) => byte >= 0x80)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return { text, encoding: "utf-8" };
    } catch {
      // není UTF-8 → windows-1250
    }
  }
  try {
    return { text: decodeWindows1250(bytes), encoding: "windows-1250" };
  } catch {
    throw new ObdDecodeError("windows-1250");
  }
}

export type ObdLine = { line: number; fields: string[] };

function unquote(field: string): string {
  const trimmed = field.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

/** Řádky souboru rozdělené středníkem; prázdné řádky se přeskočí (čísla řádků od 1). */
export function splitObdLines(text: string): ObdLine[] {
  const out: ObdLine[] = [];
  text.split(/\r\n|\n|\r/).forEach((raw, index) => {
    if (raw.trim() === "") return;
    out.push({ line: index + 1, fields: raw.split(";").map(unquote) });
  });
  return out;
}

export type ObdFileKind = "cis_bezec" | "cis_klub" | "start" | "kon_vysl";

export type ObdRowErrorCode =
  | "columns"
  | "runner_id"
  | "club_id"
  | "category"
  | "year"
  | "bib"
  | "time"
  | "name_empty"
  | "name_long"
  | "duplicate_runner"
  | "duplicate_bib"
  | "duplicate_id"
  | "unknown_runner"
  | "unknown_club";

export type ObdRowError = {
  file: ObdFileKind;
  line: number;
  code: ObdRowErrorCode;
  value?: string;
};

export const RUNNER_ID = /^\d{8}$/;
/** Kód klubu: char(3), 1–3 znaky bez mezer a středníku (např. CHC, 119, 000, ÚOL). */
export const CLUB_ID = /^[^\s;]{1,3}$/u;
export const NAME_MAX = 50;
const SMALLINT_MAX = 32767;

export type DictRow = { line: number; id: string; name: string };

function parseDict(
  file: "cis_bezec" | "cis_klub",
  lines: ObdLine[],
  idPattern: RegExp,
): { rows: DictRow[]; errors: ObdRowError[] } {
  const rows: DictRow[] = [];
  const errors: ObdRowError[] = [];
  const seen = new Map<string, string>();
  for (const { line, fields } of lines) {
    if (fields.length < 2) {
      errors.push({ file, line, code: "columns", value: fields.join(";") });
      continue;
    }
    const [id = "", name = ""] = fields;
    if (!idPattern.test(id)) {
      errors.push({ file, line, code: file === "cis_bezec" ? "runner_id" : "club_id", value: id });
      continue;
    }
    if (!name) {
      // Klub „000“ (bez klubu) má prázdný název – povoleno.
      if (file === "cis_bezec") {
        errors.push({ file, line, code: "name_empty", value: id });
        continue;
      }
    }
    if ([...name].length > NAME_MAX) {
      errors.push({ file, line, code: "name_long", value: id });
      continue;
    }
    const key = id.toUpperCase();
    if (seen.has(key)) {
      if (seen.get(key) !== name) errors.push({ file, line, code: "duplicate_id", value: id });
      continue;
    }
    seen.set(key, name);
    rows.push({ line, id, name });
  }
  return { rows, errors };
}

/** `cis_bezec.csv`: `id;jmeno` (id 8 číslic). */
export function parseRunnersFile(lines: ObdLine[]) {
  return parseDict("cis_bezec", lines, RUNNER_ID);
}

/** `cis_klub.csv`: `id;jmeno` (id char(3)). */
export function parseClubsFile(lines: ObdLine[]) {
  return parseDict("cis_klub", lines, CLUB_ID);
}

export type RaceRow = {
  line: number;
  runnerId: string;
  clubId: string;
  categoryId: string;
  year: number;
  /** start.csv: startovní číslo; kon_vysl.csv: čas v sekundách. */
  value: number;
};

function parseInt16(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= SMALLINT_MAX ? value : null;
}

/**
 * `start.csv`: `bezec_id;klub_id;kateg_id;rok;cislo`
 * `kon_vysl.csv`: `bezec_id;rok;klub_id;kateg_id;time_s` (pořadí podle INSERT v legacy
 * importres.php; potvrzeno daty – legacy bug s `data[1]` jako klubem nechal všechny
 * `klub_name` v mcvv_time prázdné, tedy `data[1]` je rok).
 */
export function parseRaceFile(
  file: "start" | "kon_vysl",
  lines: ObdLine[],
  context: { year: number; categoryIds: ReadonlySet<string> },
): { rows: RaceRow[]; errors: ObdRowError[] } {
  const rows: RaceRow[] = [];
  const errors: ObdRowError[] = [];
  const runners = new Set<string>();
  const values = new Set<number>();
  for (const { line, fields } of lines) {
    if (fields.length < 5) {
      errors.push({ file, line, code: "columns", value: fields.join(";") });
      continue;
    }
    const [runnerId = "", a = "", b = "", c = "", last = ""] = fields;
    const [clubId, categoryId, yearRaw] = file === "start" ? [a, b, c] : [b, c, a];
    const push = (code: ObdRowErrorCode, value: string) => errors.push({ file, line, code, value });
    if (!RUNNER_ID.test(runnerId)) {
      push("runner_id", runnerId);
      continue;
    }
    if (!CLUB_ID.test(clubId)) {
      push("club_id", clubId);
      continue;
    }
    if (!context.categoryIds.has(categoryId)) {
      push("category", categoryId);
      continue;
    }
    if (yearRaw !== String(context.year)) {
      push("year", yearRaw);
      continue;
    }
    const value = parseInt16(last);
    if (value === null) {
      push(file === "start" ? "bib" : "time", last);
      continue;
    }
    if (runners.has(runnerId)) {
      push("duplicate_runner", runnerId);
      continue;
    }
    if (file === "start" && values.has(value)) {
      push("duplicate_bib", String(value));
      continue;
    }
    runners.add(runnerId);
    values.add(value);
    rows.push({ line, runnerId, clubId, categoryId, year: context.year, value });
  }
  return { rows, errors };
}
