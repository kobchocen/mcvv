/**
 * Počasí ročníku (bod 7 nočního balíku): jeden typ počasí s emoji, štítky stavu trati
 * a volitelná teplota (sloupec `temp`). Původní volný text (`weather`) zůstává jako poznámka.
 * Čistá logika – popisky jsou v překladech (namespace `Weather`, 5 jazyků).
 */

export const WEATHER_KINDS = [
  "clear",
  "partly_cloudy",
  "cloudy",
  "overcast",
  "fog",
  "drizzle",
  "rain",
  "showers",
  "snow",
  "snow_showers",
] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const WEATHER_EMOJI: Record<WeatherKind, string> = {
  clear: "☀️",
  partly_cloudy: "⛅",
  cloudy: "🌥️",
  overcast: "☁️",
  fog: "🌫️",
  drizzle: "🌦️",
  rain: "🌧️",
  showers: "🌦️",
  snow: "🌨️",
  snow_showers: "🌨️",
};

export const COURSE_TAGS = [
  "dry",
  "hard",
  "wet",
  "mud",
  "frost",
  "ice",
  "snow_dusting",
  "snow_patches",
  "snow_cover",
] as const;
export type CourseTag = (typeof COURSE_TAGS)[number];

export const COURSE_TAG_EMOJI: Record<CourseTag, string> = {
  dry: "🟫",
  hard: "🪨",
  wet: "💧",
  mud: "🥾",
  frost: "🥶",
  ice: "🧊",
  snow_dusting: "❄️",
  snow_patches: "🌨️",
  snow_cover: "⛄",
};

export function isWeatherKind(value: unknown): value is WeatherKind {
  return typeof value === "string" && (WEATHER_KINDS as readonly string[]).includes(value);
}

export function parseWeatherKind(value: unknown): WeatherKind | null {
  return isWeatherKind(value) ? value : null;
}

/** Štítky trati z uloženého řetězce nebo pole (čárkami); neznámé se zahodí, pořadí podle číselníku. */
export function parseCourseTags(value: unknown): CourseTag[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const set = new Set(raw.map((x) => String(x).trim()));
  return COURSE_TAGS.filter((t) => set.has(t));
}

/** Zápis štítků do sloupce (`null` = žádné). */
export function formatCourseTags(tags: readonly CourseTag[]): string | null {
  const list = parseCourseTags([...tags]);
  return list.length ? list.join(",") : null;
}

/** Teplota z formuláře: celé °C v rozumném rozsahu, jinak null (nepovinná). */
export function parseTemperature(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= -40 && n <= 40 ? Math.round(n) : null;
}

export type WeatherView = {
  kind: WeatherKind | null;
  tags: CourseTag[];
  temp: number | null;
  /** Původní text (poznámka), zobrazí se, když chybí typ. */
  note: string | null;
};

export function weatherView(edition: {
  weatherKind?: string | null;
  courseTags?: string | null;
  temp?: number | null;
  weather?: string | null;
}): WeatherView {
  return {
    kind: parseWeatherKind(edition.weatherKind),
    tags: parseCourseTags(edition.courseTags),
    temp: edition.temp ?? null,
    note: edition.weather?.trim() || null,
  };
}

/** Řádek počasí: „☁️ Zataženo · 🥾 Blátivo · 2 °C“; bez typu původní text. */
export function formatWeatherLine(
  view: WeatherView,
  label: (key: string) => string,
  options: { emoji?: boolean } = {},
): string {
  const emoji = options.emoji ?? true;
  const parts: string[] = [];
  if (view.kind) {
    parts.push(`${emoji ? `${WEATHER_EMOJI[view.kind]} ` : ""}${label(`kind.${view.kind}`)}`);
    for (const tag of view.tags) {
      parts.push(`${emoji ? `${COURSE_TAG_EMOJI[tag]} ` : ""}${label(`tag.${tag}`)}`);
    }
  } else if (view.note) {
    parts.push(view.note);
  }
  if (view.temp !== null) parts.push(`${view.temp} °C`);
  return parts.join(" · ");
}

/* ---------- převod původních textů (skript scripts/weather/convert-editions.ts) ---------- */

export type WeatherGuess = {
  kind: WeatherKind | null;
  tags: CourseTag[];
  /** Nejasné = převod nechat na člověku (skript ho jen vypíše). */
  unclear: boolean;
  reasons: string[];
};

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

type Rule = { re: RegExp; kind?: WeatherKind; tags?: CourseTag[]; cover?: boolean };

// Pořadí: srážky před oblačností; text je bez diakritiky a malými písmeny.
const RULES: Rule[] = [
  { re: /snehove prehanky/, kind: "snow_showers" },
  { re: /snezeni/, kind: "snow" },
  { re: /destove prehanky|prehanky/, kind: "showers" },
  { re: /mrholeni|drobny dest|destik/, kind: "drizzle" },
  { re: /dest/, kind: "rain" },
  { re: /mlha/, kind: "fog" },
  { re: /polojasno/, kind: "partly_cloudy", cover: true },
  { re: /jasno|slunecno|slunick|slunce/, kind: "clear", cover: true },
  { re: /oblacno/, kind: "cloudy", cover: true },
  { re: /zatazeno/, kind: "overcast", cover: true },
  { re: /blativ/, tags: ["mud"] },
  { re: /tvrda trat|zmrzla (trat|zem)/, tags: ["hard"] },
  { re: /naledi|\bled\b/, tags: ["ice"] },
  { re: /mraz|jinovatka/, tags: ["frost"] },
  { re: /mokra trat|mokro/, tags: ["wet"] },
  { re: /sucho|sucha trat/, tags: ["dry"] },
  { re: /poprasek/, tags: ["snow_dusting"] },
  { re: /zbytky (zmrzleho )?snehu/, tags: ["snow_patches"] },
  { re: /\d+\s*cm .*snehu|vrstv\w* .*snehu/, tags: ["snow_cover"] },
];

/** Odhad typu a štítků z volného textu ročníku; nejasné případy označí s důvodem. */
export function guessWeather(text: string | null | undefined): WeatherGuess {
  const reasons: string[] = [];
  if (!text?.trim()) return { kind: null, tags: [], unclear: true, reasons: ["prázdný text"] };
  const parts = strip(text)
    .split(/,|;|(?<=[a-z])-(?=[a-z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  const covers = new Set<WeatherKind>();
  const precip = new Set<WeatherKind>();
  const tags = new Set<CourseTag>();
  for (const part of parts) {
    let matched = false;
    // typ počasí: první shoda (např. „sněhové přeháňky“ není zároveň „přeháňky“)
    const kindRule = RULES.find((rule) => rule.kind && rule.re.test(part));
    if (kindRule?.kind) {
      matched = true;
      (kindRule.cover ? covers : precip).add(kindRule.kind);
    }
    // štítky trati: všechny shody („15 cm sněhu na blátivé podložce“ = sníh + bláto)
    for (const rule of RULES) {
      if (rule.kind || !rule.re.test(part)) continue;
      matched = true;
      for (const t of rule.tags ?? []) tags.add(t);
    }
    if (!matched) reasons.push(`nerozpoznáno: „${part}“`);
  }
  if (covers.size > 1) reasons.push(`víc typů oblačnosti: ${[...covers].join(" + ")}`);
  if (precip.size > 1) reasons.push(`víc druhů srážek: ${[...precip].join(" + ")}`);
  if (precip.size && covers.has("clear")) reasons.push("srážky i jasno / slunce");
  const kind = [...precip][0] ?? [...covers][0] ?? null;
  if (!kind) reasons.push("chybí typ počasí");
  return {
    kind,
    tags: COURSE_TAGS.filter((t) => tags.has(t)),
    unclear: reasons.length > 0,
    reasons,
  };
}

export type ConversionRow = {
  id: number;
  year: number;
  text: string | null;
  guess: WeatherGuess;
  /** set = zapsat typ + štítky; skip_* = nechat být (už má typ / nejasné / bez textu). */
  action: "set" | "skip_has_kind" | "skip_unclear" | "skip_empty";
};

/** Plán převodu ročníků: jen ročníky bez typu a s jednoznačným textem se zapíšou. */
export function planWeatherConversion(
  editions: readonly {
    id: number;
    date: Date;
    weather: string | null;
    weatherKind: string | null;
  }[],
): ConversionRow[] {
  return [...editions]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => {
      const guess = guessWeather(e.weather);
      const action: ConversionRow["action"] = parseWeatherKind(e.weatherKind)
        ? "skip_has_kind"
        : !e.weather?.trim()
          ? "skip_empty"
          : guess.unclear
            ? "skip_unclear"
            : "set";
      return { id: e.id, year: e.date.getUTCFullYear(), text: e.weather, guess, action };
    });
}

export function parseConversionArgs(argv: readonly string[]): {
  apply: boolean;
  allowRemote: boolean;
} {
  return { apply: argv.includes("--apply"), allowRemote: argv.includes("--allow-remote") };
}
