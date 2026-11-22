/**
 * Testovací režim závodu (architektura B+, návrh /workspace/mcvv-testmode/navrh.md):
 * stínový ročník 9026 pro průběh (start, mezičasy, cíl) a tabulky `mcvv_test_*` pro
 * testovací startovku a dohlášky. Ostré přihlášky, běžce a kluby test jen čte.
 *
 * Tady jsou výchozí hodnoty a jejich parsování; otevřené otázky návrhu (§9) jsou
 * nastavitelné v administraci (Den závodu → Testovací režim). Čistá logika, bez DB.
 */

/** Stínový ročník testu – veřejné výstupy nikdy nečtou roky ≥ 9000. */
export const TEST_SHADOW_YEAR = 9026;
export const SHADOW_YEAR_FLOOR = 9000;

export function isShadowYear(year: number): boolean {
  return year >= SHADOW_YEAR_FLOOR;
}

/** Klíč nastavení (mcvv_setting) s konfigurací testovacího režimu. */
export const TEST_MODE_CONFIG_KEY = "testmode_config";

export type TestModeConfig = {
  /** Automatické spouštění podle `times`. Výchozí vypnuto – zapíná se v administraci. */
  enabled: boolean;
  /** Q2: kolik fiktivních běžců přidat k zaplaceným přihláškám (0 = jen ostré přihlášky). */
  fictionalRunners: number;
  /** Q3: od kterého dne (MM-DD, ročník závodu) test kopíruje ostrou startovku místo losování. */
  copyLiveFrom: string;
  /** Q4: pravidelné časy testů (HH:MM, Europe/Prague). */
  times: string[];
  /** Q4: test neběží dva dny před závodem (uzávěrka, losování, výkon DB). */
  blockBeforeRace: boolean;
  /** Q5: test končí pevně po N hodinách od nuly. */
  durationH: number;
  /** Q5: likvidace dat testu N hodin od nuly. */
  cleanupAfterH: number;
};

/**
 * Pevná rozhodnutí (Pavel): jen zaplacené přihlášky, simulované platby dohlášek, žádná
 * uzávěrka dohlášek v testu, hlavní scénář = cíl se stopkami a čísly (#252), report jen
 * v administraci, bez ruční zálohy.
 */
export const TEST_MODE_FIXED = {
  paidOnly: true,
  simulatedPayments: true,
  lateEntryCutoff: false,
  mainScenario: "252",
  reportInAdminOnly: true,
} as const;

export const DEFAULT_TEST_MODE_CONFIG: TestModeConfig = {
  enabled: false,
  fictionalRunners: 30,
  copyLiveFrom: "12-03",
  times: ["10:15", "20:15"],
  blockBeforeRace: true,
  durationH: 3,
  cleanupAfterH: 5,
};

export const FICTIONAL_MAX = 300;

const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Časy testů z textu („10:15, 20:15“) – platné HH:MM, bez duplicit, seřazené, nejvýš 6. */
export function parseTimes(value: unknown): string[] | null {
  const raw = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? value.split(/[,;\s]+/)
      : null;
  if (!raw) return null;
  const list = [...new Set(raw.map((x) => x.trim()).filter((x) => HHMM.test(x)))].sort();
  return list.length ? list.slice(0, 6) : null;
}

/** Konfigurace z JSON nastavení nebo formuláře; neplatné položky = výchozí hodnota. */
export function parseTestModeConfig(raw: unknown): TestModeConfig {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = {};
    }
  }
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const d = DEFAULT_TEST_MODE_CONFIG;
  const durationH = int(v.durationH, 1, 6, d.durationH);
  const cleanupAfterH = int(v.cleanupAfterH, durationH, 24, Math.max(d.cleanupAfterH, durationH));
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
    fictionalRunners: int(v.fictionalRunners, 0, FICTIONAL_MAX, d.fictionalRunners),
    copyLiveFrom:
      typeof v.copyLiveFrom === "string" && MMDD.test(v.copyLiveFrom.trim())
        ? v.copyLiveFrom.trim()
        : d.copyLiveFrom,
    times: parseTimes(v.times) ?? [...d.times],
    blockBeforeRace: typeof v.blockBeforeRace === "boolean" ? v.blockBeforeRace : d.blockBeforeRace,
    durationH,
    cleanupAfterH,
  };
}

export function serializeTestModeConfig(config: TestModeConfig): string {
  return JSON.stringify(parseTestModeConfig(config));
}

/* ---------- plán jednoho testu ---------- */

/** Nula testu (start) = T + 60 min; mezi T a nulou je „kancelář“ (dohlášky). */
export const TEST_START_OFFSET_MIN = 60;

export type TestPlan = {
  /** T – losování / kopie startovky, začátek kanceláře. */
  at: Date;
  zero: Date;
  endAt: Date;
  cleanupAt: Date;
  /** copy = kopie ostré startovky (po `copyLiveFrom` a když je vylosovaná), draw = losování. */
  roster: "copy" | "draw";
  blocked: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

/** Datum (UTC půlnoc) dne MM-DD v roce závodu. */
function dayOf(year: number, mmdd: string): number {
  const [m, d] = mmdd.split("-").map(Number);
  return Date.UTC(year, m - 1, d);
}

/** Pražský kalendářní den okamžiku jako UTC půlnoc (pro porovnání dnů). */
export function pragueDay(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const [y, m, d] = parts.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Test je blokovaný v den závodu a později a (volitelně) dva dny před ním. */
export function testDayBlocked(at: Date, raceDate: Date, config: TestModeConfig): boolean {
  const race = Date.UTC(raceDate.getUTCFullYear(), raceDate.getUTCMonth(), raceDate.getUTCDate());
  const day = pragueDay(at);
  if (day >= race) return true;
  return config.blockBeforeRace && day >= race - 2 * DAY;
}

/** Plán testu od T: nula T+1h, konec T+`durationH`, likvidace T+`cleanupAfterH`. */
export function planTestRun(input: {
  at: Date;
  raceDate: Date;
  config: TestModeConfig;
  liveStartListDrawn: boolean;
}): TestPlan {
  const { at, raceDate, config } = input;
  const copyFrom = dayOf(raceDate.getUTCFullYear(), config.copyLiveFrom);
  const t = at.getTime();
  return {
    at,
    zero: new Date(t + TEST_START_OFFSET_MIN * 60_000),
    endAt: new Date(t + config.durationH * 3_600_000),
    cleanupAt: new Date(t + config.cleanupAfterH * 3_600_000),
    roster: input.liveStartListDrawn && pragueDay(at) >= copyFrom ? "copy" : "draw",
    blocked: testDayBlocked(at, raceDate, config),
  };
}

/* ---------- fáze a plánovač ---------- */

export type TestPhase = "office" | "race" | "ended" | "cleanup";

/** Fáze běžícího testu: kancelář (T…nula), závod (nula…konec), konec (zápisy zamčené), likvidace. */
export function testPhase(
  run: { zeroAt: Date; endAt: Date; cleanupAt: Date },
  now: Date,
): TestPhase {
  const n = now.getTime();
  if (n >= run.cleanupAt.getTime()) return "cleanup";
  if (n >= run.endAt.getTime()) return "ended";
  if (n >= run.zeroAt.getTime()) return "race";
  return "office";
}

/** Pražský čas „HH:MM“ okamžiku. */
export function pragueClock(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/** Okno, ve kterém plánovač test ještě spustí (dohnání po výpadku ticku). */
export const AUTO_START_WINDOW_MIN = 5;

/**
 * Má plánovač teď spustit test? Zapnuté automatické spouštění, čas z `times` před nejvýš
 * `AUTO_START_WINDOW_MIN` minutami, den není blokovaný, žádný test není aktivní (nezlikvidovaný)
 * a v tomto okně ještě žádný nezačal. Vrací plánovaný okamžik T, nebo null.
 */
export function dueAutoStart(input: {
  now: Date;
  config: TestModeConfig;
  raceDate: Date;
  activeRun: boolean;
  lastStartedAt: Date | null;
}): Date | null {
  const { now, config } = input;
  if (!config.enabled || input.activeRun) return null;
  if (testDayBlocked(now, input.raceDate, config)) return null;
  const [h, m] = pragueClock(now).split(":").map(Number);
  const minutes = h * 60 + m;
  for (const time of config.times) {
    const [th, tm] = time.split(":").map(Number);
    const diff = minutes - (th * 60 + tm);
    if (diff < 0 || diff >= AUTO_START_WINDOW_MIN) continue;
    const slot = new Date(Math.floor(now.getTime() / 60_000) * 60_000 - diff * 60_000);
    if (input.lastStartedAt && input.lastStartedAt.getTime() >= slot.getTime()) return null;
    return slot;
  }
  return null;
}

/* ---------- formulář administrace ---------- */

export type ConfigFormError =
  "fictionalRunners" | "copyLiveFrom" | "times" | "durationH" | "cleanupAfterH";

/**
 * Formulář → konfigurace. Na rozdíl od `parseTestModeConfig` (tolerantní čtení nastavení)
 * neplatnou hodnotu odmítne, ať admin ví, co opravit.
 */
export function configFromForm(
  get: (name: string) => string | null,
): { ok: true; config: TestModeConfig } | { ok: false; error: ConfigFormError } {
  const num = (name: string) => {
    const raw = (get(name) ?? "").trim();
    return /^\d+$/.test(raw) ? Number(raw) : NaN;
  };
  const fictionalRunners = num("fictionalRunners");
  if (!(fictionalRunners >= 0 && fictionalRunners <= FICTIONAL_MAX)) {
    return { ok: false, error: "fictionalRunners" };
  }
  const copyLiveFrom = (get("copyLiveFrom") ?? "").trim();
  if (!MMDD.test(copyLiveFrom)) return { ok: false, error: "copyLiveFrom" };
  const rawTimes = (get("times") ?? "").trim();
  const times = parseTimes(rawTimes);
  if (!times || times.length !== rawTimes.split(/[,;\s]+/).filter(Boolean).length) {
    return { ok: false, error: "times" };
  }
  const durationH = num("durationH");
  if (!(durationH >= 1 && durationH <= 6)) return { ok: false, error: "durationH" };
  const cleanupAfterH = num("cleanupAfterH");
  if (!(cleanupAfterH >= durationH && cleanupAfterH <= 24)) {
    return { ok: false, error: "cleanupAfterH" };
  }
  return {
    ok: true,
    config: {
      enabled: get("enabled") === "on",
      fictionalRunners,
      copyLiveFrom,
      times,
      blockBeforeRace: get("blockBeforeRace") === "on",
      durationH,
      cleanupAfterH,
    },
  };
}
