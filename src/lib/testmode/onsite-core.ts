/**
 * Testovací dohláška (B+): jen `mcvv_test_onsite` + doplnění do `mcvv_test_start`. Žádná
 * přihláška, běžec, klub, prodejka ani platba – platba je jen simulovaná. Čistá logika.
 */
import { z } from "zod";

import type { BibRange } from "@/lib/race/start-settings";
import { bibForSlot, startSeriesForBib, startSlot, type StartModel } from "@/lib/race/start-time";

export const TEST_PAYMENTS = ["sim_cash", "sim_qr"] as const;
export type TestPayment = (typeof TEST_PAYMENTS)[number];

export const testOnsiteSchema = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().min(1).max(39),
  birthYear: z.coerce.number().int().min(1900).max(2100),
  sex: z.enum(["M", "F"]),
  categoryId: z.string().trim().length(1),
  clubName: z.string().trim().max(80).optional().default(""),
  bib: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(1).max(9999).optional(),
  ),
  payment: z.enum(TEST_PAYMENTS).default("sim_cash"),
});
export type TestOnsiteInput = z.infer<typeof testOnsiteSchema>;

/**
 * Nejbližší volné číslo testu ve startovní řadě kategorie (stejná pravidla jako dohláška #222):
 * nejnižší volné v okně kategorie, pak nejbližší za oknem / před ním ve stejné řadě, mimo okna
 * jiných kategorií a čísla obhájců.
 */
export function nextFreeTestBib(input: {
  model: StartModel;
  categoryId: string;
  ranges: readonly BibRange[];
  taken: ReadonlySet<number>;
  champions: readonly (number | null | undefined)[];
}): number | null {
  const { model } = input;
  const range = input.ranges.find((r) => r.categoryId === input.categoryId) ?? null;
  const series: 1 | 2 = range ? startSeriesForBib(model, range.bibFrom) : 1;
  const champions = new Set(input.champions.filter((v): v is number => v != null && v > 0));
  const free = (bib: number) =>
    bib >= 1 &&
    startSeriesForBib(model, bib) === series &&
    !input.taken.has(bib) &&
    !champions.has(bib);
  if (range) {
    for (let bib = range.bibFrom; bib <= range.bibTo; bib += 1) if (free(bib)) return bib;
  }
  const other = (bib: number) =>
    input.ranges.some(
      (r) => r.categoryId !== input.categoryId && bib >= r.bibFrom && bib <= r.bibTo,
    );
  const first = range ? startSlot(model, range.bibFrom) : 1;
  const last = range ? startSlot(model, range.bibTo) : 0;
  for (let d = 1; d <= 999; d += 1) {
    for (const slot of [last + d, first - d]) {
      if (slot < 1 || slot > 999) continue;
      const bib = bibForSlot(model, series, slot);
      if (free(bib) && !other(bib)) return bib;
    }
  }
  return null;
}
