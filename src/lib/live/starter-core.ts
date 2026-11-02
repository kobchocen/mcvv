/**
 * Startér (obrazovka `/start`) – čistá logika bez DB a bez prohlížeče.
 *
 * Startér obsluhuje jeden koridor (1 = čísla 1 … st_druhy_od − 1, 2 = od st_druhy_od podle
 * modelu startu ročníku). Vidí frontu nejbližších čísel podle plánovaného startu: zelená =
 * startuje teď (aktuální interval, ≤ 15 s), oranžová = další interval (16–30 s), šedá = později.
 * Ťuknutím označí závodníka „na startu“ (druhé ťuknutí před startem označení vrátí). Kdo není
 * v okamžiku startu označený, na chvíli zčervená a pak spadne mezi „Nevyběhli“.
 *
 * Do výsledků se vždy počítá plánovaný čas ze startovky; skutečný okamžik pozdního startu
 * a příznak „pozdě“ jsou jen informace. Priorita zápisů: admin > startér (a stanoviště Start
 * v mezičasech) > automatické doplnění z mezičasu / cíle.
 */

export type Corridor = 1 | 2;
export const CORRIDORS: readonly Corridor[] = [1, 2];

/** Výchozí první číslo 2. startu, když ročník nemá model (stejné jako `DEFAULT_START_MODEL`). */
export const DEFAULT_SECOND_START_FROM = 601;

export function parseCorridor(raw: unknown): Corridor | null {
  const value = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return value === 1 || value === 2 ? value : null;
}

/** Koridor čísla podle hranice z modelu startu ročníku. */
export function corridorOf(bib: number, secondStartFrom: number): Corridor {
  return bib >= secondStartFrom ? 2 : 1;
}

/** Rozsah čísel koridoru: 1 → 1 … hranice − 1, 2 → od hranice (bez horní meze). */
export function corridorRange(
  corridor: Corridor,
  secondStartFrom: number,
): { first: number; last: number | null } {
  return corridor === 1
    ? { first: 1, last: secondStartFrom - 1 }
    : { first: secondStartFrom, last: null };
}

/**
 * Plánovaný start čísla v ms epoch: nula + interval · (n′ − 1), n′ = pořadí v rámci startu
 * (stejné pravidlo jako `src/lib/race/start-time.ts`, hranice z modelu ročníku).
 */
export function plannedStartMs(
  zeroMs: number,
  bib: number,
  intervalS: number,
  secondStartFrom: number,
): number {
  const slot = bib >= secondStartFrom ? bib - (secondStartFrom - 1) : bib;
  return zeroMs + intervalS * 1000 * (slot - 1);
}

// --- nastavení (admin, `mcvv_setting`) ---

export const STARTER_SOUND_KEY = "starter_sound";
export const STARTER_RED_PHASE_KEY = "starter_red_phase";
export const STARTER_DNS_WINDOW_KEY = "starter_dns_window";

export const STARTER_SOUND_MODES = ["off", "beep", "voice_ready", "voice_count"] as const;
export type StarterSoundMode = (typeof STARTER_SOUND_MODES)[number];
export const DEFAULT_STARTER_SOUND: StarterSoundMode = "beep";
/** Jak dlouho zůstane neoznačený závodník po startu červený (s). */
export const DEFAULT_RED_PHASE_S = 5;
/** Jak staré „nevyběhlé“ ukazuje pruh Nevyběhli (s). */
export const DEFAULT_DNS_WINDOW_S = 5 * 60;
export const RED_PHASE_MAX_S = 120;
export const DNS_WINDOW_MAX_S = 6 * 3600;

export function parseSoundMode(raw: unknown): StarterSoundMode {
  return (STARTER_SOUND_MODES as readonly string[]).includes(String(raw))
    ? (raw as StarterSoundMode)
    : DEFAULT_STARTER_SOUND;
}

function boundedSeconds(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const value = (raw ?? "").trim();
  if (!/^\d+$/.test(value)) return fallback;
  const seconds = Number(value);
  return seconds >= min && seconds <= max ? seconds : fallback;
}

export function redPhaseFromSetting(raw: string | null | undefined): number {
  return boundedSeconds(raw, DEFAULT_RED_PHASE_S, 0, RED_PHASE_MAX_S);
}

export function dnsWindowFromSetting(raw: string | null | undefined): number {
  return boundedSeconds(raw, DEFAULT_DNS_WINDOW_S, 1, DNS_WINDOW_MAX_S);
}

export type StarterSettings = {
  sound: StarterSoundMode;
  redPhaseS: number;
  dnsWindowS: number;
};

export const DEFAULT_STARTER_SETTINGS: StarterSettings = {
  sound: DEFAULT_STARTER_SOUND,
  redPhaseS: DEFAULT_RED_PHASE_S,
  dnsWindowS: DEFAULT_DNS_WINDOW_S,
};

// --- zóny fronty ---

/** Zelená: startuje v aktuálním intervalu (≤ 15 s do startu). */
export const ZONE_NOW_S = 15;
/** Oranžová: další interval (16–30 s do startu). */
export const ZONE_NEXT_S = 30;
/** Pozdní start: víc než 15 s po plánu (jen informace). */
export const LATE_AFTER_S = 15;
/** Nejvýš tolik řádků ve frontě. */
export const QUEUE_SIZE = 4;

export type Zone = "now" | "next" | "later" | "red" | "gone";

/** Celé sekundy do startu (zaokrouhleno nahoru – 14,2 s = „15“, start = 0). */
export function secondsToStart(plannedMs: number, nowMs: number): number {
  return Math.ceil((plannedMs - nowMs) / 1000);
}

/**
 * Zóna řádku podle času do plánovaného startu. Po startu je neoznačený `redPhaseS` sekund
 * červený („red“), pak „gone“ (patří mezi Nevyběhli).
 */
export function zoneFor(plannedMs: number, nowMs: number, redPhaseS: number): Zone {
  const left = secondsToStart(plannedMs, nowMs);
  if (left > ZONE_NEXT_S) return "later";
  if (left > ZONE_NOW_S) return "next";
  if (nowMs < plannedMs) return "now";
  return nowMs < plannedMs + redPhaseS * 1000 ? "red" : "gone";
}

/** Pozdní start (víc než 15 s po plánu). */
export function isLateStart(realMs: number, plannedMs: number): boolean {
  return realMs - plannedMs > LATE_AFTER_S * 1000;
}

/** Odchylka v celých sekundách (+ = později), pro list potvrzení. */
export function offsetSeconds(realMs: number, plannedMs: number): number {
  return Math.round((realMs - plannedMs) / 1000);
}

/** `0:12` / `-0:03` – odpočet do startu (záporný = po startu). */
export function formatCountdown(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = String(abs % 60).padStart(2, "0");
  return h > 0 ? `${sign}${h}:${String(m).padStart(2, "0")}:${s}` : `${sign}${m}:${s}`;
}

// --- stav čísla ---

export type StarterSource = "admin" | "starter" | "web" | "split";

/** Řádek `mcvv_start_check` tak, jak ho vidí startér (bez příznaku „neoznačen“). */
export type StarterMark = {
  bib: number;
  source: string;
  /** Okamžik ťuknutí startéra (ms), u jiných zdrojů null. */
  markedAt: number | null;
  late: boolean;
};

export type StarterRunner = {
  bib: number;
  name: string;
  club: string | null;
  plannedMs: number;
};

export type QueueRow = StarterRunner & {
  zone: Zone;
  marked: boolean;
  secondsLeft: number;
};

export type StarterView = {
  queue: QueueRow[];
  /** Nevyběhli v okně (nejnovější první). */
  missing: StarterRunner[];
  counts: { toStart: number; missing: number };
};

/**
 * Fronta, pruh Nevyběhli a počítadla. `runners` = čísla koridoru ze startovky (prázdná
 * rezervní čísla ve startovce nejsou, takže se přeskočí sama), `marks` = aktuální stav
 * (server + neodeslané akce zařízení).
 */
export function buildStarterView(
  runners: readonly StarterRunner[],
  marks: ReadonlyMap<number, StarterMark>,
  nowMs: number,
  settings: Pick<StarterSettings, "redPhaseS" | "dnsWindowS">,
): StarterView {
  const sorted = [...runners].sort((a, b) => a.plannedMs - b.plannedMs || a.bib - b.bib);
  const queue: QueueRow[] = [];
  const missing: StarterRunner[] = [];
  let toStart = 0;
  let missingCount = 0;
  for (const runner of sorted) {
    const marked = marks.has(runner.bib);
    const zone = zoneFor(runner.plannedMs, nowMs, settings.redPhaseS);
    const started = nowMs >= runner.plannedMs;
    if (marked && started) continue; // odstartoval
    if (zone === "gone") {
      missingCount += 1;
      if (runner.plannedMs >= nowMs - settings.dnsWindowS * 1000) missing.push(runner);
      continue;
    }
    toStart += 1; // ještě neodstartoval (i označený před startem a červená fáze)
    if (queue.length < QUEUE_SIZE) {
      queue.push({ ...runner, zone, marked, secondsLeft: secondsToStart(runner.plannedMs, nowMs) });
    }
  }
  missing.reverse();
  return { queue, missing, counts: { toStart, missing: missingCount } };
}

export type ListFilter = "all" | "pending" | "missing";

export type ListRow = StarterRunner & {
  state: "pending" | "marked" | "started" | "red" | "missing";
  late: boolean;
};

/** Celá startovka koridoru s filtrem Vše / Ke startu / Nevyběhli (podle plánovaného startu). */
export function buildStarterList(
  runners: readonly StarterRunner[],
  marks: ReadonlyMap<number, StarterMark>,
  nowMs: number,
  redPhaseS: number,
  filter: ListFilter,
): ListRow[] {
  return [...runners]
    .sort((a, b) => a.plannedMs - b.plannedMs || a.bib - b.bib)
    .map((runner): ListRow => {
      const mark = marks.get(runner.bib);
      const before = nowMs < runner.plannedMs;
      const zone = zoneFor(runner.plannedMs, nowMs, redPhaseS);
      const state = mark
        ? before
          ? "marked"
          : "started"
        : before
          ? "pending"
          : zone === "red"
            ? "red"
            : "missing";
      return { ...runner, state, late: mark?.late ?? false };
    })
    .filter((row) =>
      filter === "all"
        ? true
        : filter === "pending"
          ? row.state === "pending" || row.state === "marked" || row.state === "red"
          : row.state === "missing",
    );
}

// --- akce startéra a priorita zápisů ---

export const STARTER_ACTIONS = ["mark", "unmark", "ontime", "late"] as const;
export type StarterAction = (typeof STARTER_ACTIONS)[number];

/** Akce na ťuknutí podle času: před startem označit / odznačit, v červené fázi start včas. */
export function tapAction(
  plannedMs: number,
  nowMs: number,
  marked: boolean,
  redPhaseS: number,
): StarterAction | null {
  if (nowMs < plannedMs) return marked ? "unmark" : "mark";
  if (marked) return null;
  return nowMs < plannedMs + redPhaseS * 1000 ? "ontime" : "late";
}

const RANK: Record<string, number> = { admin: 3, starter: 2, web: 2, split: 1 };

export function sourceRank(source: string): number {
  return RANK[source] ?? 2;
}

export type ExistingStart = { source: string; markedAt: Date | null } | null;

export type StarterDecision = "insert" | "update" | "delete" | "ignored";

/**
 * Zápis startéra proti aktuálnímu řádku startu:
 * - admin má přednost – startér jeho záznam nemění,
 * - automatické doplnění ze splitu startér vždy přepíše (i pozdě dorazivší offline ťuknutí),
 * - mezi zařízeními startérů (a stanovištěm Start) platí poslední akce podle času ťuknutí,
 * - odznačení maže jen záznam startéra / stanoviště Start, nikdy admina ani doplnění ze splitu.
 */
export function decideStarterWrite(
  existing: ExistingStart,
  action: StarterAction,
  tapAt: Date,
): StarterDecision {
  if (action === "unmark") {
    if (!existing || sourceRank(existing.source) !== 2) return "ignored";
    if (existing.markedAt && existing.markedAt.getTime() > tapAt.getTime()) return "ignored";
    return "delete";
  }
  if (!existing) return "insert";
  const rank = sourceRank(existing.source);
  if (rank > 2) return "ignored";
  if (rank < 2) return "update";
  if (existing.markedAt && existing.markedAt.getTime() > tapAt.getTime()) return "ignored";
  return "update";
}

/** Zápis ze stanoviště Start v mezičasech: přepíše jen automatické doplnění ze splitu. */
export function decideWebStartWrite(
  existing: { source: string } | null,
): "insert" | "replace" | "duplicate" {
  if (!existing) return "insert";
  return sourceRank(existing.source) < 2 ? "replace" : "duplicate";
}

/** Automatické doplnění startu ze splitu: jen když číslo ještě žádný záznam nemá. */
export function decideAutoMark(existing: { source: string } | null): "insert" | "skip" {
  return existing ? "skip" : "insert";
}

// --- lokální fronta zařízení (offline) ---

export type PendingAction = {
  /** Klientské UUID (idempotence na serveru). */
  id: string;
  bib: number;
  action: StarterAction;
  /** Okamžik ťuknutí v ms podle synchronizovaných hodin. */
  at: number;
};

/**
 * Stav čísel = server + neodeslané akce zařízení v pořadí ťuknutí (optimistické zobrazení).
 * Akce, kterou by server ignoroval (admin), stav nezmění.
 */
export function mergePending(
  server: ReadonlyMap<number, StarterMark>,
  pending: readonly PendingAction[],
  plannedOf: (bib: number) => number | undefined,
): Map<number, StarterMark> {
  const marks = new Map(server);
  for (const op of [...pending].sort((a, b) => a.at - b.at)) {
    const current = marks.get(op.bib) ?? null;
    const existing = current
      ? {
          source: current.source,
          markedAt: current.markedAt === null ? null : new Date(current.markedAt),
        }
      : null;
    const decision = decideStarterWrite(existing, op.action, new Date(op.at));
    if (decision === "ignored") continue;
    if (decision === "delete") {
      marks.delete(op.bib);
      continue;
    }
    const planned = plannedOf(op.bib);
    marks.set(op.bib, {
      bib: op.bib,
      source: "starter",
      markedAt: op.at,
      late: op.action === "late" && planned !== undefined ? isLateStart(op.at, planned) : false,
    });
  }
  return marks;
}

// --- hodiny ---

export type ClockQuality = "good" | "warn" | "none";

/** Zelená do ±100 ms, oranžová nad ±250 ms nebo bez synchronizace 5 min, červená nikdy. */
export const CLOCK_GOOD_MS = 100;
export const CLOCK_WARN_MS = 250;
export const CLOCK_STALE_MS = 5 * 60_000;

/**
 * Kvalita hodin: `uncertaintyMs` = polovina RTT nejlepšího vzorku, `lastSyncAt` = poslední
 * úspěšná synchronizace (ms podle zařízení). Mezi 100 a 250 ms zůstává zelená (jen ukazuje ±).
 */
export function clockQuality(input: {
  uncertaintyMs: number | null;
  lastSyncAt: number | null;
  now: number;
}): ClockQuality {
  if (input.uncertaintyMs === null || input.lastSyncAt === null) return "none";
  if (input.now - input.lastSyncAt > CLOCK_STALE_MS) return "warn";
  if (input.uncertaintyMs > CLOCK_WARN_MS) return "warn";
  return "good";
}

/** Nejlepší vzorek (nejmenší RTT) z dávky synchronizace. */
export function bestSample<T extends { rtt: number }>(samples: readonly T[]): T | null {
  return samples.reduce<T | null>(
    (best, s) => (best === null || s.rtt < best.rtt ? s : best),
    null,
  );
}

// --- zvuk ---

export type Cue = { at: number; kind: "short" | "long" | "say"; text?: string };

/**
 * Zvukové signály pro start v `startMs`: pípání = 5 krátkých (−5 … −1 s) a dlouhý ve startu;
 * hlas „připrav se, pozor, start“ (−5, −3, 0) nebo „3, 2, 1, start“.
 */
export function cuesFor(mode: StarterSoundMode, startMs: number): Cue[] {
  if (mode === "off") return [];
  if (mode === "beep") {
    return [
      ...[5, 4, 3, 2, 1].map((s) => ({ at: startMs - s * 1000, kind: "short" as const })),
      { at: startMs, kind: "long" },
    ];
  }
  if (mode === "voice_ready") {
    return [
      { at: startMs - 5000, kind: "say", text: "připrav se" },
      { at: startMs - 3000, kind: "say", text: "pozor" },
      { at: startMs, kind: "say", text: "start" },
    ];
  }
  return [
    { at: startMs - 3000, kind: "say", text: "3" },
    { at: startMs - 2000, kind: "say", text: "2" },
    { at: startMs - 1000, kind: "say", text: "1" },
    { at: startMs, kind: "say", text: "start" },
  ];
}

// --- klávesnice „Jiné číslo“ ---

export type KeypadResult =
  | { kind: "pending"; runner: StarterRunner; marked: boolean }
  | { kind: "missing"; runner: StarterRunner }
  | { kind: "started"; runner: StarterRunner }
  | { kind: "other-corridor"; corridor: Corridor }
  | { kind: "unknown" };

/** Co ukáže klávesnice pro zadané číslo. */
export function keypadLookup(input: {
  bib: number;
  corridor: Corridor;
  secondStartFrom: number;
  runners: ReadonlyMap<number, StarterRunner>;
  marks: ReadonlyMap<number, StarterMark>;
  nowMs: number;
  redPhaseS: number;
}): KeypadResult {
  const { bib, corridor, secondStartFrom, runners, marks, nowMs, redPhaseS } = input;
  const own = corridorOf(bib, secondStartFrom);
  if (own !== corridor) return { kind: "other-corridor", corridor: own };
  const runner = runners.get(bib);
  if (!runner) return { kind: "unknown" };
  const marked = marks.has(bib);
  if (nowMs < runner.plannedMs) return { kind: "pending", runner, marked };
  if (marked) return { kind: "started", runner };
  if (nowMs < runner.plannedMs + redPhaseS * 1000) return { kind: "pending", runner, marked };
  return { kind: "missing", runner };
}

// --- online výsledky ---

/**
 * Štítek „pozdní start“ v online výsledcích (offset v s nebo null): automatické doplnění ze
 * splitu nikdy, zápis startéra jen s příznakem pozdě („Odstartovat teď“ víc než 15 s po plánu),
 * ostatní zdroje (stanoviště Start, admin) beze změny podle prahu #228.
 */
export function publicLateOffset(
  row: { source: string; late: boolean },
  offsetS: number,
  limitS: number,
): number | null {
  if (row.source === "split") return null;
  if (row.source === "starter") return row.late ? offsetS : null;
  return offsetS > limitS ? offsetS : null;
}

/** DNS lhůta online výsledků se řídí jen skutečnými záznamy startu (ne doplněním ze splitu). */
export function countsAsStartRecord(row: { source: string }): boolean {
  return row.source !== "split";
}
