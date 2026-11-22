/**
 * Návrh startovního čísla pro dohlášku na místě (#222) – čistá funkce bez DB.
 *
 * Pravidla (stejná jako losování startovky, `startlist-generator.ts`):
 * - startovní řada (1. start od 1, 2. start od `secondStartFrom`, typicky 601) je řada okna
 *   kategorie; bez rozsahu kategorie 1. start;
 * - nejdřív nejnižší volné číslo v okně kategorie;
 * - když je okno plné, nejbližší volné číslo za oknem, pak před ním – ve stejné řadě, mimo
 *   okna jiných kategorií;
 * - nikdy číslo obhájce ani číslo, které už má někdo v ročníku (přihlášky, startovka);
 * - v den závodu jen čísla, jejichž start je nejdřív za `minLeadSeconds` (výchozí 15 min).
 *
 * Návrh je jen předvyplnění: pokladní ho smí přepsat. Při uložení se v automatickém režimu
 * vybírá znovu pod zámkem čísel (`BIB_LOCK`), takže souběžné prodeje nedostanou stejné číslo.
 */
import type { BibRange } from "@/lib/race/start-settings";
import {
  bibForSlot,
  startInstantForBib,
  startSeriesForBib,
  startSlot,
  type StartModel,
} from "@/lib/race/start-time";

/** Nejmenší odstup startu od dohlášení (návrh v2, otázka 8). */
export const ONSITE_MIN_LEAD_SECONDS = 15 * 60;
/** Nejvyšší pořadí ve startu, které návrh zkouší (1. start 1–600 při hranici 601). */
const SLOT_LIMIT = 999;

export type OnsiteBibSuggestionInput = {
  model: StartModel;
  categoryId: string;
  ranges: readonly BibRange[];
  taken: ReadonlySet<number>;
  champions: readonly (number | null | undefined)[];
  /** Den závodu (UTC půlnoc) a teď – pro vynechání čísel, jejichž start už je moc blízko. */
  raceDate?: Date | null;
  now?: Date;
  minLeadSeconds?: number;
};

export type OnsiteBibSuggestion = { bib: number; series: 1 | 2; outsideCategory: boolean };

export function suggestOnsiteBib(input: OnsiteBibSuggestionInput): OnsiteBibSuggestion | null {
  const { model } = input;
  const range = input.ranges.find((row) => row.categoryId === input.categoryId) ?? null;
  const series: 1 | 2 = range ? startSeriesForBib(model, range.bibFrom) : 1;
  const champions = new Set(input.champions.filter((v): v is number => v != null && v > 0));
  const lead = input.minLeadSeconds ?? ONSITE_MIN_LEAD_SECONDS;
  const earliest = input.raceDate && input.now ? new Date(input.now.getTime() + lead * 1000) : null;
  const tooSoon = (bib: number) => {
    if (!earliest || !input.raceDate) return false;
    const at = startInstantForBib(model, input.raceDate, bib);
    return at !== null && at.getTime() < earliest.getTime();
  };
  const inSeries = (bib: number) =>
    bib >= 1 && startSeriesForBib(model, bib) === series && startSlot(model, bib) <= SLOT_LIMIT;
  const free = (bib: number) =>
    inSeries(bib) && !input.taken.has(bib) && !champions.has(bib) && !tooSoon(bib);

  if (range) {
    for (let bib = range.bibFrom; bib <= range.bibTo; bib += 1) {
      if (free(bib)) return { bib, series, outsideCategory: false };
    }
  }
  const otherWindow = (bib: number) =>
    input.ranges.some(
      (row) => row.categoryId !== input.categoryId && bib >= row.bibFrom && bib <= row.bibTo,
    );
  const first = range ? startSlot(model, range.bibFrom) : 1;
  const last = range ? startSlot(model, range.bibTo) : 0;
  for (let distance = 1; distance <= SLOT_LIMIT; distance += 1) {
    for (const slot of [last + distance, first - distance]) {
      if (slot < 1 || slot > SLOT_LIMIT) continue;
      const bib = bibForSlot(model, series, slot);
      if (free(bib) && !otherWindow(bib)) return { bib, series, outsideCategory: true };
    }
  }
  return null;
}
