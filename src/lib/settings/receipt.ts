import { prisma } from "@/lib/db/client";

import {
  RECEIPT_ISSUER_ADDRESS_KEY,
  RECEIPT_ISSUER_ICO_KEY,
  RECEIPT_ISSUER_NAME_KEY,
  RECEIPT_SETTING_KEYS,
  RECEIPT_VAT_NOTE_KEY,
  normalizeReceiptIssuer,
  receiptIssuerFromRows,
  type ReceiptIssuer,
} from "./receipt-core";

export * from "./receipt-core";

async function rows() {
  return prisma.setting.findMany({
    where: { key: { in: [...RECEIPT_SETTING_KEYS] } },
    select: { key: true, text: true },
  });
}

/** Vystavitel na dokladu (uložené údaje doplněné výchozími). */
export async function getReceiptIssuer(): Promise<ReceiptIssuer> {
  return receiptIssuerFromRows(await rows());
}

/** Uložené hodnoty pro formulář v nastavení (prázdné = výchozí). */
export async function getStoredReceiptIssuer(): Promise<ReceiptIssuer> {
  const map = new Map((await rows()).map((row) => [row.key, row.text]));
  return normalizeReceiptIssuer({
    name: map.get(RECEIPT_ISSUER_NAME_KEY),
    address: map.get(RECEIPT_ISSUER_ADDRESS_KEY),
    ico: map.get(RECEIPT_ISSUER_ICO_KEY),
    vatNote: map.get(RECEIPT_VAT_NOTE_KEY),
  });
}

export async function saveReceiptIssuer(input: Partial<ReceiptIssuer>): Promise<void> {
  const value = normalizeReceiptIssuer(input);
  const entries: [string, string][] = [
    [RECEIPT_ISSUER_NAME_KEY, value.name],
    [RECEIPT_ISSUER_ADDRESS_KEY, value.address],
    [RECEIPT_ISSUER_ICO_KEY, value.ico],
    [RECEIPT_VAT_NOTE_KEY, value.vatNote],
  ];
  await prisma.$transaction(
    entries.map(([key, text]) =>
      prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } }),
    ),
  );
}
