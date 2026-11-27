import { readFileSync } from "node:fs";
import path from "node:path";

import { loadOfficialLogoFromBytes } from "./official-logo-bytes";
import type { OfficialLogoImage, OfficialLogoSurface } from "./official-logo-shared";

export * from "./official-logo-shared";

const PRINT_FILES: Record<OfficialLogoSurface, string> = {
  dark: "mcvv-logo-barevne-na-tmave.png",
  light: "mcvv-logo-barevne-na-svetle.png",
};

const cache = new Map<string, OfficialLogoImage>();

/**
 * Načte rastr oficiálního loga z interních tiskových assetů (stejný soubor je i v public/
 * kvůli e-mailům a PDF výsledků v prohlížeči). Jen na serveru / v Node.
 */
export function loadOfficialLogoPng(
  surface: OfficialLogoSurface,
  root: string = process.cwd(),
): OfficialLogoImage {
  const key = `${root}:${surface}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const file = path.join(root, "src", "assets", "print", PRINT_FILES[surface]);
  const image = loadOfficialLogoFromBytes(new Uint8Array(readFileSync(file)));
  cache.set(key, image);
  return image;
}
