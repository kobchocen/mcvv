import type { BibRange } from "./start-settings";
import { startSeriesForBib, startSlot, type StartModel } from "./start-time";
import { inOrganizerBlock } from "./startlist-check";

/**
 * Speciální start běžce (Pavel, 30. 10. 2026) – jen administrace, nic ve veřejné části.
 *
 * - `organizer`: pořadatel → blok pořadatelů (čísla před prvním oknem kategorie startu), stejně
 *   jako řádky přihlášky č. 1;
 * - `early`: start co nejdřív → první volná čísla za pořadateli ve vlastním startu;
 * - `late`: start co nejpozději → poslední volná čísla v oknech kategorií vlastního startu
 *   (rezervu generátor nepřiděluje);
 * - `with`: start spolu s jiným přihlášeným běžcem s časovým posunem (0 = stejný čas, tedy
 *   druhý start; +2:00 = o dvě minuty později…).
 */
export const SPECIAL_START_KINDS = ["organizer", "early", "late", "with"] as const;
export type SpecialStartKind = (typeof SPECIAL_START_KINDS)[number];

export type SpecialStartSpec = {
  kind: SpecialStartKind;
  /** Jen u `with`. */
  partnerId: string | null;
  /** Jen u `with`: posun vůči partnerovi v sekundách. */
  offsetSeconds: number;
};

/** Největší povolený posun (± 30 min) – víc nedává smysl a vejde se do SMALLINT. */
export const MAX_OFFSET_SECONDS = 30 * 60;

export function isSpecialStartKind(value: unknown): value is SpecialStartKind {
  return typeof value === "string" && (SPECIAL_START_KINDS as readonly string[]).includes(value);
}

/**
 * Posun z formuláře: minuty, volitelně `:ss` a znaménko. „0“, „+2“, „-1“, „+1:30“, „-0:15“.
 * Vrací sekundy, nebo null pro neplatný / příliš velký vstup. Prázdný vstup = 0.
 */
export function parseOffset(raw: string | null | undefined): number | null {
  const value = (raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^\u2212/, "-");
  if (value === "") {
    return 0;
  }
  const match = /^([+-])?(\d{1,2})(?::([0-5]\d))?$/.exec(value);
  if (!match) {
    return null;
  }
  const seconds = Number(match[2]) * 60 + Number(match[3] ?? 0);
  const signed = match[1] === "-" ? -seconds : seconds;
  return Math.abs(signed) > MAX_OFFSET_SECONDS ? null : signed;
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
  /** Pořadatel z přihlášky č. 1 nebo obhájce – nejsou „běžní“ pro brzy / pozdě. */
  exempt: boolean;
  special: SpecialStartSpec | null;
};

export type SpecialCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "noBib" | "partnerMissing" | "block" | "notEarliest" | "notLatest" | "offset";
      /** U `offset`: skutečný posun v sekundách. */
      actualSeconds?: number;
    };

/**
 * Splněno / porušeno pro aktuální čísla (zelená / červená na startovce):
 * - pořadatel: číslo v bloku pořadatelů;
 * - brzy: nikdo „běžný“ (bez spec. startu, ne pořadatel, ne obhájce) ve stejném startu
 *   nestartuje dřív;
 * - pozdě: nikdo běžný ve stejném startu nestartuje později;
 * - spolu s: oba mají číslo a rozdíl startovních časů = posun (zaokrouhlený na interval).
 */
export function checkSpecialStarts(
  model: StartModel,
  ranges: BibRange[],
  rows: SpecialCheckRow[],
): Map<string, SpecialCheck> {
  const result = new Map<string, SpecialCheck>();
  const active = rows.filter((row) => row.active);
  const byId = new Map(active.map((row) => [row.runnerId, row]));
  const regular = active.filter((row) => row.bib != null && !row.exempt && !row.special);
  const extreme = (series: 1 | 2, pick: (a: number, b: number) => number): number | null => {
    const slots = regular
      .filter((row) => startSeriesForBib(model, row.bib!) === series)
      .map((row) => startSlot(model, row.bib!));
    return slots.length > 0 ? slots.reduce((a, b) => pick(a, b)) : null;
  };
  const earliest = { 1: extreme(1, Math.min), 2: extreme(2, Math.min) } as const;
  const latest = { 1: extreme(1, Math.max), 2: extreme(2, Math.max) } as const;

  for (const row of rows) {
    const special = row.special;
    if (!special) {
      continue;
    }
    if (row.bib == null || !row.active) {
      result.set(row.runnerId, { ok: false, reason: "noBib" });
      continue;
    }
    const series = startSeriesForBib(model, row.bib);
    const slot = startSlot(model, row.bib);
    switch (special.kind) {
      case "organizer":
        result.set(
          row.runnerId,
          inOrganizerBlock(model, ranges, row.bib) ? { ok: true } : { ok: false, reason: "block" },
        );
        break;
      case "early": {
        const first = earliest[series];
        result.set(
          row.runnerId,
          first == null || slot <= first ? { ok: true } : { ok: false, reason: "notEarliest" },
        );
        break;
      }
      case "late": {
        const last = latest[series];
        result.set(
          row.runnerId,
          last == null || slot >= last ? { ok: true } : { ok: false, reason: "notLatest" },
        );
        break;
      }
      case "with": {
        const partner = special.partnerId ? byId.get(special.partnerId) : undefined;
        if (!partner || partner.runnerId === row.runnerId || partner.bib == null) {
          result.set(row.runnerId, { ok: false, reason: "partnerMissing" });
          break;
        }
        const diff = slot - startSlot(model, partner.bib);
        result.set(
          row.runnerId,
          diff === offsetSlots(model, special.offsetSeconds)
            ? { ok: true }
            : { ok: false, reason: "offset", actualSeconds: diff * model.intervalSeconds },
        );
        break;
      }
    }
  }
  return result;
}
