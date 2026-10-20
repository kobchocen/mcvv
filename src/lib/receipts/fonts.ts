import { readFile } from "node:fs/promises";
import path from "node:path";

export type ReceiptFonts = { regular: string; bold: string };

/**
 * DejaVu Sans (čeština) přibalené v repozitáři – žádné stahování z CDN.
 * Soubory se do standalone buildu dostanou přes `outputFileTracingIncludes`.
 */
export const RECEIPT_FONT_DIR = path.join("src", "assets", "fonts");

let cached: Promise<ReceiptFonts> | null = null;

export function loadReceiptFonts(root: string = process.cwd()): Promise<ReceiptFonts> {
  if (!cached) {
    const read = (name: string) =>
      readFile(path.join(root, RECEIPT_FONT_DIR, name)).then((buf) => buf.toString("base64"));
    cached = Promise.all([read("DejaVuSans.ttf"), read("DejaVuSans-Bold.ttf")])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
