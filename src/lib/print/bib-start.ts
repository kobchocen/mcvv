/**
 * Startovní čas z čísla pro tisk čísel (#118).
 *
 * Pravidlo je 1:1 s legacy `tiskcisel.php` a se zadáním #114:
 *   n' = cislo >= prvni_cislo_2_startu ? cislo - (prvni_cislo_2_startu - 1) : cislo
 *   start = nula + interval * (n' - 1)
 *
 * Nastavení ročníku z #114 (nula, 2. start, čísla obhájců) zatím na develop není –
 * do jeho sloučení se bere výchozí model (10:15:00, 2. start od 601) a interval
 * z `mcvv_info.st_interval`. Po sloučení #114 nahradit voláním `startTimeForBib`
 * z `@/lib/race/start-time` (stejný tvar `StartModel`).
 */
export type BibStartModel = {
  /** Nulový čas v sekundách od půlnoci (Europe/Prague). */
  zeroSeconds: number;
  intervalSeconds: number;
  secondStartFrom: number;
};

export const DEFAULT_BIB_START_MODEL: BibStartModel = {
  zeroSeconds: 10 * 3600 + 15 * 60,
  intervalSeconds: 15,
  secondStartFrom: 601,
};

/** Výchozí červená čísla obhájců (legacy natvrdo 400 a 950); v UI tisku jdou změnit. */
export const DEFAULT_CHAMPION_BIBS = [400, 950] as const;

export function bibStartModel(edition: { startInterval?: number | null } | null): BibStartModel {
  const interval = edition?.startInterval;
  return {
    ...DEFAULT_BIB_START_MODEL,
    intervalSeconds: interval && interval > 0 ? interval : DEFAULT_BIB_START_MODEL.intervalSeconds,
  };
}

function clock(seconds: number): string {
  const day = ((seconds % 86400) + 86400) % 86400;
  return [Math.floor(day / 3600), Math.floor((day % 3600) / 60), day % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** „HH:MM:SS“, nebo "" pro neplatné číslo. */
export function bibStartTime(model: BibStartModel, bib: number): string {
  if (!Number.isInteger(bib) || bib <= 0) {
    return "";
  }
  const slot = bib >= model.secondStartFrom ? bib - (model.secondStartFrom - 1) : bib;
  return clock(model.zeroSeconds + model.intervalSeconds * (slot - 1));
}
