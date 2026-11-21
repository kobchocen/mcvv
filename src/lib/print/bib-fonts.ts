import { readFile } from "node:fs/promises";
import path from "node:path";

import { RECEIPT_FONT_DIR } from "@/lib/receipts/fonts";

/** Oswald (SIL OFL 1.1) přibalený v repozitáři – statické řezy z variable fontu. */
export type BibFonts = {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

let cached: Promise<BibFonts> | null = null;

export function loadBibFonts(root: string = process.cwd()): Promise<BibFonts> {
  if (!cached) {
    const read = (name: string) =>
      readFile(path.join(root, RECEIPT_FONT_DIR, name)).then((buf) => buf.toString("base64"));
    cached = Promise.all([
      read("Oswald-Regular.ttf"),
      read("Oswald-Medium.ttf"),
      read("Oswald-SemiBold.ttf"),
      read("Oswald-Bold.ttf"),
    ])
      .then(([regular, medium, semibold, bold]) => ({ regular, medium, semibold, bold }))
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
