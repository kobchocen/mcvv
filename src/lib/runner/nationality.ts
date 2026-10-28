/**
 * Státní příslušnost běžce (#200): ISO 3166-1 alpha-2 kód v `cis_bezec.statni_prislusnost`,
 * NULL = neuvedeno (historická data). Čisté funkce bez DB – sdílí je formuláře, výpisy,
 * statistiky i testy.
 */

/** Domácí stát závodu: v seznamech výsledků se vlaječka ukazuje jen u ostatních států. */
export const HOME_COUNTRY = "CZ";

/** ISO 3166-1 alpha-2 (oficiálně přidělené kódy). */
export const COUNTRY_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/** Nejčastější státy nahoře ve výběru (sousedé a česká komunita). */
export const COMMON_COUNTRIES: readonly CountryCode[] = ["CZ", "SK", "PL", "DE", "AT", "UA"];

const CODE_SET = new Set<string>(COUNTRY_CODES);

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && CODE_SET.has(value);
}

/** Vstup z formuláře → platný kód, nebo null (prázdné / neznámé = neuvedeno). */
export function normalizeNationality(value: unknown): CountryCode | null {
  if (typeof value !== "string") {
    return null;
  }
  const code = value.trim().toUpperCase();
  return isCountryCode(code) ? code : null;
}

/** Vlaječka jako emoji z regionálních indikátorů (🇨🇿); neplatný kód → "". */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !isCountryCode(code)) {
    return "";
  }
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/** Lokalizovaný název státu (Intl), fallback kód. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export type CountryOption = { code: CountryCode; label: string };

/** Nabídka pro select: časté státy nahoře, pak ostatní abecedně podle jazyka. */
export function countryOptions(locale: string): {
  common: CountryOption[];
  other: CountryOption[];
} {
  const option = (code: CountryCode) => ({ code, label: countryName(code, locale) });
  const collator = new Intl.Collator(locale);
  return {
    common: COMMON_COUNTRIES.map(option),
    other: COUNTRY_CODES.filter((code) => !COMMON_COUNTRIES.includes(code))
      .map(option)
      .sort((a, b) => collator.compare(a.label, b.label)),
  };
}

/** Vlaječka ve výpisech (výsledky, startovka…): jen u jiného než domácího státu. */
export function listFlag(code: string | null | undefined): CountryCode | null {
  return isCountryCode(code) && code !== HOME_COUNTRY ? code : null;
}

export type NationalityResult = { year: number; runnerId: string; time: number };

export type CountryStatRow = {
  code: CountryCode;
  runners: number;
  starts: number;
  firstYear: number;
  lastYear: number;
  best: { runnerId: string; time: number; year: number };
};

export type CountryYearRow = {
  year: number;
  /** Počet různých států mezi běžci s uvedenou příslušností. */
  countries: number;
  /** Běžci z jiného než domácího státu. */
  foreign: number;
  /** Běžci bez uvedené příslušnosti. */
  unknown: number;
};

export type NationalityStats = {
  countries: CountryStatRow[];
  years: CountryYearRow[];
  /** Různí běžci s výsledkem bez uvedené příslušnosti. */
  unknownRunners: number;
};

/**
 * Statistika států z výsledků: po státech (běžci, starty, první/poslední ročník, nejlepší čas)
 * a po ročnících (počet států, cizinci, neuvedení). Běžci bez příslušnosti se do států nepočítají.
 */
export function computeNationalityStats(
  results: NationalityResult[],
  nationalities: ReadonlyMap<string, string>,
): NationalityStats {
  const byCountry = new Map<CountryCode, CountryStatRow & { ids: Set<string> }>();
  const byYear = new Map<
    number,
    { codes: Set<string>; foreign: Set<string>; unknown: Set<string> }
  >();
  const unknown = new Set<string>();

  for (const row of results) {
    const raw = nationalities.get(row.runnerId);
    const code = isCountryCode(raw) ? raw : null;
    const year = byYear.get(row.year) ?? {
      codes: new Set<string>(),
      foreign: new Set<string>(),
      unknown: new Set<string>(),
    };
    byYear.set(row.year, year);
    if (!code) {
      unknown.add(row.runnerId);
      year.unknown.add(row.runnerId);
      continue;
    }
    year.codes.add(code);
    if (code !== HOME_COUNTRY) {
      year.foreign.add(row.runnerId);
    }
    const entry = byCountry.get(code);
    if (!entry) {
      byCountry.set(code, {
        code,
        runners: 0,
        starts: 1,
        firstYear: row.year,
        lastYear: row.year,
        best: { runnerId: row.runnerId, time: row.time, year: row.year },
        ids: new Set([row.runnerId]),
      });
      continue;
    }
    entry.starts += 1;
    entry.ids.add(row.runnerId);
    entry.firstYear = Math.min(entry.firstYear, row.year);
    entry.lastYear = Math.max(entry.lastYear, row.year);
    if (row.time > 0 && (entry.best.time <= 0 || row.time < entry.best.time)) {
      entry.best = { runnerId: row.runnerId, time: row.time, year: row.year };
    }
  }

  const countries = [...byCountry.values()]
    .map(({ ids, ...rest }) => ({ ...rest, runners: ids.size }))
    .sort((a, b) => b.runners - a.runners || b.starts - a.starts || a.code.localeCompare(b.code));
  const years = [...byYear.entries()]
    .map(([year, data]) => ({
      year,
      countries: data.codes.size,
      foreign: data.foreign.size,
      unknown: data.unknown.size,
    }))
    .sort((a, b) => b.year - a.year);
  return { countries, years, unknownRunners: unknown.size };
}
