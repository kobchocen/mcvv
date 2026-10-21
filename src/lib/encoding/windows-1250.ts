/**
 * Kódování windows-1250 (cp1250) pro výměnu souborů s OBD (časomíra LuM).
 * Vlastní tabulka (bez závislosti na ICU v běhovém prostředí). Bajty 0x00–0x7F = ASCII.
 * Bajty 0x81, 0x83, 0x88, 0x90, 0x98 nejsou v cp1250 definované (0 v tabulce).
 */
// prettier-ignore
const HIGH: readonly number[] = [
  0x20ac, 0x0000, 0x201a, 0x0000, 0x201e, 0x2026, 0x2020, 0x2021,
  0x0000, 0x2030, 0x0160, 0x2039, 0x015a, 0x0164, 0x017d, 0x0179,
  0x0000, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x0000, 0x2122, 0x0161, 0x203a, 0x015b, 0x0165, 0x017e, 0x017a,
  0x00a0, 0x02c7, 0x02d8, 0x0141, 0x00a4, 0x0104, 0x00a6, 0x00a7,
  0x00a8, 0x00a9, 0x015e, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x017b,
  0x00b0, 0x00b1, 0x02db, 0x0142, 0x00b4, 0x00b5, 0x00b6, 0x00b7,
  0x00b8, 0x0105, 0x015f, 0x00bb, 0x013d, 0x02dd, 0x013e, 0x017c,
  0x0154, 0x00c1, 0x00c2, 0x0102, 0x00c4, 0x0139, 0x0106, 0x00c7,
  0x010c, 0x00c9, 0x0118, 0x00cb, 0x011a, 0x00cd, 0x00ce, 0x010e,
  0x0110, 0x0143, 0x0147, 0x00d3, 0x00d4, 0x0150, 0x00d6, 0x00d7,
  0x0158, 0x016e, 0x00da, 0x0170, 0x00dc, 0x00dd, 0x0162, 0x00df,
  0x0155, 0x00e1, 0x00e2, 0x0103, 0x00e4, 0x013a, 0x0107, 0x00e7,
  0x010d, 0x00e9, 0x0119, 0x00eb, 0x011b, 0x00ed, 0x00ee, 0x010f,
  0x0111, 0x0144, 0x0148, 0x00f3, 0x00f4, 0x0151, 0x00f6, 0x00f7,
  0x0159, 0x016f, 0x00fa, 0x0171, 0x00fc, 0x00fd, 0x0163, 0x02d9,
];

const TO_BYTE = new Map<number, number>();
HIGH.forEach((codePoint, index) => {
  if (codePoint !== 0) TO_BYTE.set(codePoint, 0x80 + index);
});

/** Lze znak (jeden code point) zapsat ve windows-1250? */
export function isWindows1250Char(char: string): boolean {
  const codePoint = char.codePointAt(0)!;
  return codePoint < 0x80 || TO_BYTE.has(codePoint);
}

/** Znaky textu, které ve windows-1250 nejdou zapsat (bez duplicit, v pořadí výskytu). */
export function unencodableChars(text: string): string[] {
  const found: string[] = [];
  for (const char of text) {
    if (!isWindows1250Char(char) && !found.includes(char)) found.push(char);
  }
  return found;
}

/**
 * Zakóduje text do windows-1250. Nezapsatelný znak vyhodí chybu – volající musí
 * problémy vyřešit předem (žádné tiché „?“).
 */
export function encodeWindows1250(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint < 0x80) {
      bytes.push(codePoint);
      continue;
    }
    const byte = TO_BYTE.get(codePoint);
    if (byte === undefined) {
      throw new RangeError(
        `Character U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} is not in windows-1250`,
      );
    }
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

/** Dekóduje windows-1250. Nedefinovaný bajt vyhodí chybu (soubor není windows-1250). */
export function decodeWindows1250(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    if (byte < 0x80) {
      text += String.fromCharCode(byte);
      continue;
    }
    const codePoint = HIGH[byte - 0x80]!;
    if (codePoint === 0) {
      throw new RangeError(
        `Byte 0x${byte.toString(16).toUpperCase()} at offset ${index} is not defined in windows-1250`,
      );
    }
    text += String.fromCodePoint(codePoint);
  }
  return text;
}

/**
 * Přepis nezapsatelných znaků: rozklad NFD a odstranění diakritiky, která ve windows-1250
 * není (např. „ő“ zůstane, „ș“ → „s“). Co ani tak nejde zapsat, nahradí `?` – volající
 * takové případy hlásí uživateli (náhrada nikdy není tichá).
 */
export function transliterateToWindows1250(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    if (isWindows1250Char(char)) {
      out += char;
      continue;
    }
    const base = char.normalize("NFD").replace(/\p{M}+/gu, "");
    // Samostatná kombinující značka (base "") se vypustí.
    out += [...base].every(isWindows1250Char) ? base : "?";
  }
  return out;
}
