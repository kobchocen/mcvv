import { startTimeForBib, type StartModel } from "@/lib/race/start-time";

/** Režim tisku: celá startovka (po dávkách), vybraná čísla, prázdná čísla (rezerva). */
export type BibPrintMode = "all" | "selected" | "blank";

export type BibColor = "black" | "green" | "red";

export type BibCard = {
  bib: number;
  /** Prázdné číslo (rezerva pro přihlášky na místě) – bez jména a kategorie. */
  blank: boolean;
  color: BibColor;
  /** Velké příjmení (první slovo jména, velkými písmeny). */
  surname: string;
  /** „PŘÍJMENÍ JMÉNO“ velkými písmeny. */
  fullName: string;
  category: string;
  startTime: string;
  registrationId: number | null;
  /** Počet startů veterána (vpravo dole), jinak null. */
  veteranStarts: number | null;
  /** Index loga partnera: `cislo % počet_log` (legacy `cislo % počet_reklam`). */
  logoIndex: number | null;
  /** Nápis dole – legacy barva podle režimu. */
  titleColor: [number, number, number];
  title: string;
};

export type BibEntryRow = {
  bib: number;
  runnerId: string;
  name: string;
  categoryId: string;
  /** Null u běžce jen v `mcvv_start` (přihláška na místě, bez řádku přihlášky). */
  registrationId: number | null;
};

/** Na čísla jdou jen loga partnerů kategorie 1 a 2 (generální a hlavní partneři). */
export const BIB_PARTNER_CATEGORIES = [1, 2] as const;

export const MAX_BIBS_PER_PDF = 400;
export const MAX_BIB = 9999;

/** Legacy barvy nápisu „MALÁ CENA VELKÉ VERANDY“: startovka modrá, rezerva červená, výběr zelená. */
const TITLE_COLORS: Record<BibPrintMode, [number, number, number]> = {
  all: [0x35, 0xa9, 0xe1],
  blank: [0xdd, 0x11, 0x22],
  selected: [0x74, 0xb8, 0xa2],
};

/**
 * Minimální počet startů pro „veterána“ – stejně jako legacy tisk i stránka Statistiky:
 * víc než `round(ročníků / 2 + 0.5) - 1` startů.
 */
export function veteranMinStarts(yearCount: number): number {
  return Math.round(yearCount / 2 + 0.5);
}

/**
 * Seznam čísel z UI: „321, 1, 41-45; 600“ → [1, 41, 42, 43, 44, 45, 321, 600].
 * Vrací null při chybě (neplatný token, rozsah obráceně, víc než MAX_BIBS_PER_PDF čísel).
 */
export function parseBibList(input: string | null | undefined): number[] | null {
  const text = (input ?? "").trim();
  if (!text) {
    return [];
  }
  const result = new Set<number>();
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const match = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(token);
    if (!match) {
      return null;
    }
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to < from || to > MAX_BIB || to - from >= MAX_BIBS_PER_PDF) {
      return null;
    }
    for (let bib = from; bib <= to; bib += 1) {
      result.add(bib);
      if (result.size > MAX_BIBS_PER_PDF) {
        return null;
      }
    }
  }
  return [...result].sort((a, b) => a - b);
}

function upper(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("cs-CZ");
}

/** Legacy: velké příjmení = text před první mezerou jména „Příjmení Jméno“. */
export function bibSurname(name: string): string {
  const full = upper(name);
  const space = full.indexOf(" ");
  return space > 0 ? full.slice(0, space) : full;
}

export type BuildBibOptions = {
  mode: BibPrintMode;
  year: number;
  model: StartModel;
  championBibs: readonly number[];
  /** bezec_id → počet startů (jen veteráni). */
  veterans: ReadonlyMap<string, number>;
  logoCount: number;
};

function base(bib: number, options: BuildBibOptions) {
  return {
    bib,
    startTime: startTimeForBib(options.model, bib),
    logoIndex: options.logoCount > 0 ? bib % options.logoCount : null,
    titleColor: TITLE_COLORS[options.mode],
    title:
      options.mode === "blank"
        ? "MALÁ CENA VELKÉ VERANDY"
        : `MALÁ CENA VELKÉ VERANDY ${options.year}`,
  };
}

export function buildBibCard(row: BibEntryRow, options: BuildBibOptions): BibCard {
  const starts = options.veterans.get(row.runnerId) ?? null;
  const color: BibColor = options.championBibs.includes(row.bib)
    ? "red"
    : starts !== null
      ? "green"
      : "black";
  return {
    ...base(row.bib, options),
    blank: false,
    color,
    surname: bibSurname(row.name),
    fullName: upper(row.name),
    category: row.categoryId,
    registrationId: row.registrationId,
    veteranStarts: starts,
  };
}

export function buildBlankBibCard(bib: number, options: BuildBibOptions): BibCard {
  return {
    ...base(bib, options),
    blank: true,
    color: "black",
    surname: "",
    fullName: "",
    category: "",
    registrationId: null,
    veteranStarts: null,
  };
}

export type BibOrder = "registration" | "bib";

/** Legacy pořadí startovky: podle přihlášky, pak čísla (rodiny a oddíly pohromadě). */
export function sortBibRows(rows: BibEntryRow[], order: BibOrder): BibEntryRow[] {
  const registration = (row: BibEntryRow) => row.registrationId ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) =>
    order === "bib" ? a.bib - b.bib : registration(a) - registration(b) || a.bib - b.bib,
  );
}

export function bibFilename(mode: BibPrintMode, year: number, first?: number, last?: number) {
  const range = first && last ? `-${first}-${last}` : "";
  const kind = mode === "blank" ? "rezerva" : mode === "selected" ? "vyber" : "startovka";
  return `mcvv-${year}-cisla-${kind}${range}.pdf`;
}

export type BibPrintRequest = {
  mode: BibPrintMode;
  /** Vybraná / prázdná čísla. */
  bibs: number[];
  order: BibOrder;
  /** Dávka celé startovky: přeskočit `offset`, vzít `limit`. */
  offset: number;
  limit: number;
  /** Červená čísla obhájců; null = parametr `red` chybí → čísla obhájců z ročníku. */
  championBibs: number[] | null;
};

export const DEFAULT_BATCH = 100;

function intParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  if (!/^\d{1,5}$/.test(value.trim())) {
    return null;
  }
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/** Parametry GET /api/admin/tisk/cisla → požadavek, nebo null při neplatném vstupu. */
export function parseBibPrintParams(params: URLSearchParams): BibPrintRequest | null {
  const rawMode = params.get("mode") ?? "all";
  if (rawMode !== "all" && rawMode !== "selected" && rawMode !== "blank") {
    return null;
  }
  const mode: BibPrintMode = rawMode;
  const order: BibOrder = params.get("order") === "bib" ? "bib" : "registration";
  const offset = intParam(params.get("offset"), 0, 0, MAX_BIB);
  const limit = intParam(params.get("limit"), DEFAULT_BATCH, 1, MAX_BIBS_PER_PDF);
  const bibs = parseBibList(params.get("bibs"));
  const red = params.has("red");
  const champions = red ? parseBibList(params.get("red")) : null;
  if (offset === null || limit === null || bibs === null || (red && champions === null)) {
    return null;
  }
  if (mode !== "all" && bibs.length === 0) {
    return null;
  }
  return { mode, order, offset, limit, bibs: mode === "all" ? [] : bibs, championBibs: champions };
}
