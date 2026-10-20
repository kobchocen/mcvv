/**
 * Údaje vystavitele dokladu o zaplacení (mcvv_setting). Čisté funkce, bez DB.
 * Prázdná / chybějící hodnota = výchozí údaj klubu.
 */
export const RECEIPT_ISSUER_NAME_KEY = "receipt.issuer_name";
export const RECEIPT_ISSUER_ADDRESS_KEY = "receipt.issuer_address";
export const RECEIPT_ISSUER_ICO_KEY = "receipt.issuer_ico";
export const RECEIPT_VAT_NOTE_KEY = "receipt.vat_note";

export const RECEIPT_SETTING_KEYS = [
  RECEIPT_ISSUER_NAME_KEY,
  RECEIPT_ISSUER_ADDRESS_KEY,
  RECEIPT_ISSUER_ICO_KEY,
  RECEIPT_VAT_NOTE_KEY,
] as const;

export type ReceiptIssuer = {
  name: string;
  /** Adresa po řádcích (ulice, PSČ a obec…). */
  address: string;
  ico: string;
  /** Poznámka k DPH, např. „Není plátce DPH“. */
  vatNote: string;
};

export const DEFAULT_RECEIPT_ISSUER: ReceiptIssuer = {
  name: "K.O.B. Choceň, z.s.",
  address: "Vostelčická 256\n565 01 Choceň",
  ico: "15030237",
  vatNote: "Není plátce DPH",
};

export const RECEIPT_TEXT_MAX = 120;
export const RECEIPT_ADDRESS_MAX = 300;

function oneLine(raw: string | null | undefined, max: number): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Víceřádková adresa: ořezané řádky, bez prázdných, max. 4 řádky. */
export function normalizeAddress(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n")
    .slice(0, RECEIPT_ADDRESS_MAX);
}

/** Hodnoty z formuláře → co se uloží (prázdné = výchozí). */
export function normalizeReceiptIssuer(input: Partial<ReceiptIssuer>): ReceiptIssuer {
  return {
    name: oneLine(input.name, RECEIPT_TEXT_MAX),
    address: normalizeAddress(input.address),
    ico: oneLine(input.ico, 20),
    vatNote: oneLine(input.vatNote, RECEIPT_TEXT_MAX),
  };
}

/** Uložené hodnoty s doplněnými výchozími údaji (pro doklad). */
export function receiptIssuerFromRows(rows: { key: string; text: string }[]): ReceiptIssuer {
  const map = new Map(rows.map((row) => [row.key, row.text]));
  const stored = normalizeReceiptIssuer({
    name: map.get(RECEIPT_ISSUER_NAME_KEY),
    address: map.get(RECEIPT_ISSUER_ADDRESS_KEY),
    ico: map.get(RECEIPT_ISSUER_ICO_KEY),
    vatNote: map.get(RECEIPT_VAT_NOTE_KEY),
  });
  return {
    name: stored.name || DEFAULT_RECEIPT_ISSUER.name,
    address: stored.address || DEFAULT_RECEIPT_ISSUER.address,
    ico: stored.ico || DEFAULT_RECEIPT_ISSUER.ico,
    vatNote: stored.vatNote || DEFAULT_RECEIPT_ISSUER.vatNote,
  };
}
