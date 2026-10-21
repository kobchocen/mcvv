/**
 * Code 128 (sada B) – věrný přepis legacy `admin/barcode.php` (David S. Tufts, 2003),
 * kterým starý web tiskl čárový kód na startovní čísla:
 * `barcode.php?text={cislo}&sizefactor=2&size=60&orientation=vertical`.
 *
 * Kód nese číslo bez úvodních nul (např. „41“), sada B, kontrolní znak mod 103,
 * bez textu pod kódem. Pořadí vzorů odpovídá hodnotám 0–106 standardu Code 128,
 * takže čtečky (OBD/LuM) čtou nový tisk stejně jako legacy.
 */

/** Šířky prvků (čára, mezera, …) pro hodnoty 0–105 Code 128 – stejné pořadí jako legacy pole. */
const PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
] as const;

const START_B = "211214";
const STOP = "2331112";
const START_B_VALUE = 104;

/** Tiché zóny legacy: kreslení začíná na modulu 10 a délka je součet šířek + 20. */
export const LEGACY_QUIET_MODULES = 10;

/**
 * Řetězec šířek prvků (střídavě čára/mezera, začíná čárou) – totéž, co legacy skládá
 * do `$code_string`. Znaky mimo ASCII 32–126 nejsou v sadě B – pro čísla nenastane.
 */
export function code128BPattern(text: string): string {
  let checksum = START_B_VALUE;
  let body = "";
  for (let i = 0; i < text.length; i += 1) {
    const value = text.charCodeAt(i) - 32;
    if (value < 0 || value > 94) {
      throw new RangeError(`Code 128B nepodporuje znak ${JSON.stringify(text[i])}`);
    }
    body += PATTERNS[value];
    checksum += value * (i + 1);
  }
  return START_B + body + PATTERNS[checksum % 103] + STOP;
}

/** Text kódu na startovním čísle: číslo bez úvodních nul, jako legacy `text=$cislo`. */
export function bibBarcodeText(bib: number): string {
  if (!Number.isInteger(bib) || bib <= 0) {
    throw new RangeError(`Neplatné startovní číslo ${bib}`);
  }
  return String(bib);
}

export type BarcodeBar = { start: number; width: number };

/** Čáry v modulech od začátku symbolu (bez tiché zóny). */
export function patternBars(pattern: string): { bars: BarcodeBar[]; modules: number } {
  const bars: BarcodeBar[] = [];
  let position = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const width = Number(pattern[i]);
    if (i % 2 === 0) {
      bars.push({ start: position, width });
    }
    position += width;
  }
  return { bars, modules: position };
}
