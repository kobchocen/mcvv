import { startTimeForBib, type StartModel } from "@/lib/race/start-time";

/** Režim tisku: celá startovka (po dávkách), vybraná čísla, prázdná čísla (rezerva). */
export type BibPrintMode = "all" | "selected" | "blank";

/**
 * Barva velkého startovního čísla (Pavel 21. 11. 2026):
 * černá základ, zelená veterán, oranžová historický absolutní vítěz, zlatá obhájce.
 */
export type BibColor = "black" | "green" | "orange" | "gold";

/** Forest zůstává inkoustem typografie (logo, START V), ne barvou čísla. */
export const BIB_FOREST = "#07210e";
/** Světlejší zelená z brandmanuálu – jasně jiná než černá i než forest. K potvrzení na Pretexu. */
export const BIB_GREEN = "#294B31";
export const BIB_ORANGE = "#fb5d1e";
/** Zlato na čísle i v pečeti vítězů/obhájců. Není v brandmanuálu – k potvrzení na Pretexu. */
export const BIB_GOLD = "#A07C1A";
export const BIB_DEEP = "#031106";
export const BIB_CREAM = "#eef4ee";

export type BibSealKind = "veteran" | "winner";
export type BibSealLabel = "STARTŮ" | "VÝHRA" | "VÝHRY" | "VÝHER";

export type BibSeal = {
  kind: BibSealKind;
  /** Skutečný počet startů / výher; na pečeti se tiskne dvouciferně. */
  count: number;
  label: BibSealLabel;
  fill: string;
  /**
   * `primary` sedí na účaří velkého čísla.
   * `secondary` je zmenšená veteránská pečeť mezi standardní pečetí a QR.
   */
  placement: "primary" | "secondary";
};

/** Počet na pečeti bez úvodní nuly (3, 35, 100). */
export function sealCountText(count: number): string {
  return String(Math.max(0, Math.round(count)));
}

/** @deprecated Použij sealCountText — bez úvodní nuly. */
export function twoDigitCount(count: number): string {
  return sealCountText(count);
}

/** Popisek pečeti výher: 1 VÝHRA, 2–4 VÝHRY, 5 a víc VÝHER. */
export function winnerSealLabel(count: number): "VÝHRA" | "VÝHRY" | "VÝHER" {
  const n = Math.max(0, Math.round(count));
  if (n === 1) {
    return "VÝHRA";
  }
  if (n >= 2 && n <= 4) {
    return "VÝHRY";
  }
  return "VÝHER";
}

export type BibCard = {
  bib: number;
  /** Prázdné číslo (rezerva pro přihlášky na místě) – bez jména a kategorie. */
  blank: boolean;
  color: BibColor;
  /** Velké příjmení (první slovo jména, velkými písmeny). */
  surname: string;
  /** „PŘÍJMENÍ JMÉNO“ velkými písmeny. */
  fullName: string;
  /** Kategorie slovy, velká písmena („MUŽI NAD 40 LET“). */
  category: string;
  startTime: string;
  registrationId: number | null;
  /** Počet startů veterána (v pečeti STARTŮ), jinak null. */
  veteranStarts: number | null;
  /** Počet historických absolutních vítězství (v pečeti VÝHER), jinak null. */
  winCount: number | null;
  /** Loňský vítěz mužů/žen – má rezervované zlaté číslo obhájce. */
  isDefender: boolean;
  seals: BibSeal[];
  /** Ročník narození (první 4 znaky bezec_id), jinak null. */
  birthYear: string | null;
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
  /** Název kategorie z číselníku („muži nad 40 let“), jinak kód. */
  categoryName: string;
  /** Ročník narození, typicky první 4 znaky bezec_id. */
  birthYear: string | null;
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

/** Kategorie na čísle slovy, velkými písmeny. */
export function bibCategoryLabel(nameOrId: string): string {
  return upper(nameOrId);
}

/**
 * Celé jméno pro drobný řádek: „Jméno Příjmení“ z uloženého „Příjmení Jméno“.
 * První slovo je příjmení (stejně jako `bibSurname`).
 */
export function bibGivenNameFirst(name: string): string {
  const full = upper(name);
  const space = full.indexOf(" ");
  return space > 0 ? `${full.slice(space + 1)} ${full.slice(0, space)}` : full;
}

/**
 * Přiřazení barvy čísla a pečetí.
 * Priorita barvy: obhájce (zlato) → historický vítěz (oranž) → veterán (zeleň) → černá.
 * Obhájce i historický vítěz mají zlatou pečeť VÝHER; veterán zelenou STARTŮ.
 * Když je vítěz i veterán, zůstává barva podle vítězství a přidá se zmenšená veteránská pečeť.
 */
export function bibAppearance(input: {
  isDefender: boolean;
  winCount: number | null;
  veteranStarts: number | null;
}): { color: BibColor; seals: BibSeal[]; winCount: number | null } {
  const veteranStarts = input.veteranStarts;
  const isVeteran = veteranStarts != null && veteranStarts > 0;
  const historicalWins = input.winCount != null && input.winCount > 0 ? input.winCount : 0;
  // Obhájce je loňský vítěz: když výsledky výhru nemají, na pečeti ukážeme alespoň 1.
  const winCount = input.isDefender ? Math.max(historicalWins, 1) : historicalWins || null;
  const isWinner = input.isDefender || historicalWins > 0;

  let color: BibColor = "black";
  if (input.isDefender) {
    color = "gold";
  } else if (historicalWins > 0) {
    color = "orange";
  } else if (isVeteran) {
    color = "green";
  }

  const seals: BibSeal[] = [];
  if (isWinner && winCount) {
    seals.push({
      kind: "winner",
      count: winCount,
      label: winnerSealLabel(winCount),
      fill: BIB_GOLD,
      placement: "primary",
    });
  }
  if (isVeteran && veteranStarts) {
    seals.push({
      kind: "veteran",
      count: veteranStarts,
      label: "STARTŮ",
      fill: BIB_GREEN,
      placement: isWinner ? "secondary" : "primary",
    });
  }
  return { color, seals, winCount };
}

export function participationHex(color: BibColor): string {
  if (color === "green") {
    return BIB_GREEN;
  }
  if (color === "orange") {
    return BIB_ORANGE;
  }
  if (color === "gold") {
    return BIB_GOLD;
  }
  return "#000000";
}

export type BuildBibOptions = {
  mode: BibPrintMode;
  year: number;
  model: StartModel;
  championBibs: readonly number[];
  /** bezec_id → počet startů (jen veteráni). */
  veterans: ReadonlyMap<string, number>;
  /** bezec_id → počet historických absolutních vítězství. */
  winnerCounts: ReadonlyMap<string, number>;
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
  const isDefender = options.championBibs.includes(row.bib);
  const rawWins = options.winnerCounts.get(row.runnerId) ?? null;
  const appearance = bibAppearance({
    isDefender,
    winCount: rawWins,
    veteranStarts: starts,
  });
  return {
    ...base(row.bib, options),
    blank: false,
    color: appearance.color,
    surname: bibSurname(row.name),
    fullName: upper(row.name),
    category: bibCategoryLabel(row.categoryName || row.categoryId),
    registrationId: row.registrationId,
    veteranStarts: starts,
    winCount: appearance.winCount,
    isDefender,
    seals: appearance.seals,
    birthYear: row.birthYear,
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
    winCount: null,
    isDefender: false,
    seals: [],
    birthYear: null,
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
