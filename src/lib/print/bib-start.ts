/**
 * Adaptér startovky (#114/#115/#119) pro tisk startovních čísel (#118).
 *
 * Tisk nemá vlastní model startu ani vlastní seznam čísel:
 * - startovní čas na čísle = `startTimeForBib` z `@/lib/race/start-time` s modelem ročníku
 *   (`startModelFromEdition`: nula, interval, 1. číslo 2. startu z `mcvv_info`),
 * - čísla, jména a kategorie = stejný zdroj jako veřejná startovka a PDF startovky
 *   (`loadPublicStartList`): po importu z prezentace (#119) `mcvv_start`, předtím čísla
 *   z řádků přihlášek (`mcvv_prihlaska_radek.cislo`, zámky/skupiny v `mcvv_start_radek`),
 * - výchozí červená čísla = čísla obhájců z ročníku (`st_obhajce_m`, `st_obhajce_z`).
 */
import type { ChampionBibs } from "@/lib/race/start-settings";
import type { PublicStartRow } from "@/lib/race/startlist-load";

import type { BibEntryRow } from "./bibs-core";

/** Čísla obhájců ročníku jako výchozí červená čísla (bez nevyplněných, bez duplicit). */
export function championBibList(champions: ChampionBibs): number[] {
  return [...new Set([champions.men, champions.women].filter((bib): bib is number => bib != null))];
}

/**
 * Řádky startovky → řádky tisku. Číslo přihlášky (pořadí „podle přihlášky“ a „(id)“ na
 * čísle) se dohledá podle běžce; běžec jen v `mcvv_start` (přihláška na místě) ho nemá.
 */
export function bibRowsFromStartList(
  rows: readonly PublicStartRow[],
  registrationOf: ReadonlyMap<string, number>,
): BibEntryRow[] {
  return rows
    .filter((row) => Number.isInteger(row.bib) && row.bib > 0)
    .map((row) => ({
      bib: row.bib,
      runnerId: row.runnerId,
      name: row.name,
      categoryId: row.categoryId,
      registrationId: registrationOf.get(row.runnerId) ?? null,
    }));
}
