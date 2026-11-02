import { bibForSlot, startSlot, type StartModel } from "./start-time";

/**
 * Speciální start běžce – jen administrace, nic ve veřejné části (rozhodnutí Pavla 30. 10.
 * a 2. 11. 2026, Q220–Q237).
 *
 * - `organizer`: pořadatel → čísla 1–40 / 601–640 (Q236). Pořadatel je jen běžec s tímto
 *   typem – přihláška č. 1 už pořadatele neurčuje (Q220, data převedla migrace);
 * - `early`: start brzy → čísla 41–99 / 641–699 (Q221);
 * - `late`: start pozdě → čísla 261–299 / 861–899 (Q222), rezervu generátor nepoužívá;
 * - `with`: start „spolu s“ jiným přihlášeným běžcem: čas partnera + posun (Q224/Q235),
 *   posun je libovolný násobek intervalu, kladný i záporný (0 = stejný čas → druhý start).
 *
 * Rozsahy jsou pořadí ve startu (sloty), takže platí stejně pro 1. i 2. start; číslo dává
 * `bibForSlot` z modelu ročníku (601 = 1. slot 2. startu).
 */
export const SPECIAL_START_KINDS = ["organizer", "early", "late", "with"] as const;
export type SpecialStartKind = (typeof SPECIAL_START_KINDS)[number];

/** Typy s pevným rozsahem čísel. */
export type RangedSpecialKind = Exclude<SpecialStartKind, "with">;
export const RANGED_SPECIAL_KINDS: readonly RangedSpecialKind[] = ["organizer", "early", "late"];

/** Rozsahy spec. startů ve slotech startu (Q236, Q221, Q222). */
export const SPECIAL_SLOT_RANGES: Record<RangedSpecialKind, { from: number; to: number }> = {
  organizer: { from: 1, to: 40 },
  early: { from: 41, to: 99 },
  late: { from: 261, to: 299 },
};

export type SpecialStartSpec = {
  kind: SpecialStartKind;
  /** Jen u `with`. */
  partnerId: string | null;
  /** Jen u `with`: posun vůči partnerovi v sekundách (násobek intervalu). */
  offsetSeconds: number;
};

/** Největší povolený posun (± 60 min, Q235) – vejde se do SMALLINT. */
export const MAX_OFFSET_SECONDS = 60 * 60;

export function isSpecialStartKind(value: unknown): value is SpecialStartKind {
  return typeof value === "string" && (SPECIAL_START_KINDS as readonly string[]).includes(value);
}

export function isRangedSpecialKind(value: unknown): value is RangedSpecialKind {
  return typeof value === "string" && (RANGED_SPECIAL_KINDS as readonly string[]).includes(value);
}

/** Rozsah čísel typu v daném startu: organizer v 2. startu = 601–640. */
export function specialBibRange(
  model: StartModel,
  kind: RangedSpecialKind,
  series: 1 | 2,
): { from: number; to: number } {
  const slots = SPECIAL_SLOT_RANGES[kind];
  return { from: bibForSlot(model, series, slots.from), to: bibForSlot(model, series, slots.to) };
}

/** Číslo leží v rozsahu typu (v kterémkoli startu). */
export function inSpecialRange(model: StartModel, kind: RangedSpecialKind, bib: number): boolean {
  const slot = startSlot(model, bib);
  const range = SPECIAL_SLOT_RANGES[kind];
  return slot >= range.from && slot <= range.to;
}

/** Číslo leží v rozsahu některého spec. startu. */
export function inAnySpecialRange(model: StartModel, bib: number): boolean {
  return RANGED_SPECIAL_KINDS.some((kind) => inSpecialRange(model, kind, bib));
}

/** Text rozsahu pro hlášky: „41–99 / 641–699“. */
export function specialRangeText(model: StartModel, kind: RangedSpecialKind): string {
  return ([1, 2] as const)
    .map((series) => {
      const range = specialBibRange(model, kind, series);
      return `${range.from}–${range.to}`;
    })
    .join(" / ");
}

export type ParsedOffset =
  { ok: true; seconds: number } | { ok: false; reason: "format" | "range" | "step" };

/**
 * Posun z formuláře (Q235): `m:ss` se znaménkem („+1:30“, „−0:15“, „0“), samotné minuty
 * („+2“ = 2:00) nebo počet intervalů s „i“ („+6i“ = 6 × interval). Prázdný vstup = 0.
 * Musí být násobkem intervalu startu a nejvýš ± 60 min.
 */
export function parseOffset(
  raw: string | null | undefined,
  intervalSeconds: number = 15,
): ParsedOffset {
  const value = (raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^[\u2212\u2013]/, "-");
  if (value === "") {
    return { ok: true, seconds: 0 };
  }
  let signed: number;
  const steps = /^([+-])?(\d{1,3})[i×x]$/i.exec(value);
  const clock = /^([+-])?(\d{1,2})(?::([0-5]\d))?$/.exec(value);
  if (steps) {
    const seconds = Number(steps[2]) * intervalSeconds;
    signed = steps[1] === "-" ? -seconds : seconds;
  } else if (clock) {
    const seconds = Number(clock[2]) * 60 + Number(clock[3] ?? 0);
    signed = clock[1] === "-" ? -seconds : seconds;
  } else {
    return { ok: false, reason: "format" };
  }
  if (Math.abs(signed) > MAX_OFFSET_SECONDS) {
    return { ok: false, reason: "range" };
  }
  if (intervalSeconds > 0 && signed % intervalSeconds !== 0) {
    return { ok: false, reason: "step" };
  }
  return { ok: true, seconds: signed === 0 ? 0 : signed };
}

/** Zobrazení posunu: „0“, „+2:00“, „−1:30“. */
export function formatOffset(seconds: number): string {
  if (seconds === 0) {
    return "0";
  }
  const abs = Math.abs(seconds);
  const text = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  return `${seconds < 0 ? "\u2212" : "+"}${text}`;
}

/** Posun v počtu startovních intervalů (generátor i kontrola počítají stejně). */
export function offsetSlots(model: StartModel, seconds: number): number {
  return Math.round(seconds / model.intervalSeconds);
}

export type SpecialCheckRow = {
  runnerId: string;
  bib: number | null;
  /** Řádek se počítá do startovky (platná, nezrušená přihláška). */
  active: boolean;
  special: SpecialStartSpec | null;
};

export type SpecialCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "noBib" | "partnerMissing" | "range" | "offset";
      /** U `offset`: skutečný posun v sekundách. */
      actualSeconds?: number;
    };

/**
 * Splněno / porušeno pro aktuální čísla (zelená / červená na startovce):
 * - pořadatel / brzy / pozdě: číslo v rozsahu typu (1–40, 41–99, 261–299 a totéž od 601);
 * - spolu s: oba mají číslo a rozdíl startovních časů = posun.
 */
export function checkSpecialStarts(
  model: StartModel,
  rows: SpecialCheckRow[],
): Map<string, SpecialCheck> {
  const result = new Map<string, SpecialCheck>();
  const byId = new Map(rows.filter((row) => row.active).map((row) => [row.runnerId, row]));

  for (const row of rows) {
    const special = row.special;
    if (!special) {
      continue;
    }
    if (row.bib == null || !row.active) {
      result.set(row.runnerId, { ok: false, reason: "noBib" });
      continue;
    }
    if (special.kind !== "with") {
      result.set(
        row.runnerId,
        inSpecialRange(model, special.kind, row.bib)
          ? { ok: true }
          : { ok: false, reason: "range" },
      );
      continue;
    }
    const partner = special.partnerId ? byId.get(special.partnerId) : undefined;
    if (!partner || partner.runnerId === row.runnerId || partner.bib == null) {
      result.set(row.runnerId, { ok: false, reason: "partnerMissing" });
      continue;
    }
    const diff = startSlot(model, row.bib) - startSlot(model, partner.bib);
    result.set(
      row.runnerId,
      diff === offsetSlots(model, special.offsetSeconds)
        ? { ok: true }
        : { ok: false, reason: "offset", actualSeconds: diff * model.intervalSeconds },
    );
  }
  return result;
}
