import type { jsPDF } from "jspdf";

/**
 * Oficiální logo MCVV (export 15. 11. 2026) — konstanty a kreslení do PDF.
 * Řez profilem tratě je díra v kresbě, podklad musí prosvítat.
 * Tento modul je použitelný i v prohlížeči (bez node:fs).
 */

export type OfficialLogoSurface = "dark" | "light";

export type OfficialLogoImage = {
  data: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
};

/** ViewBox oficiálního znaku (214,07 × 102,52). */
export const OFFICIAL_LOGO_VIEWBOX_WIDTH = 214.07;
export const OFFICIAL_LOGO_VIEWBOX_HEIGHT = 102.52;
export const OFFICIAL_LOGO_ASPECT = OFFICIAL_LOGO_VIEWBOX_WIDTH / OFFICIAL_LOGO_VIEWBOX_HEIGHT;

/** Minimální šířka znaku (inkoust, ne včetně ochranné zóny ve viewBoxu) podle brandmanuálu. */
export const OFFICIAL_LOGO_MIN_INK_WIDTH_MM = 25;

/**
 * Inkoustový rámeček rastru 1600×767 z oficiálního SVG (15. 11. 2026),
 * jako podíl strany obrázku. Ověřuje test přes sharp.trim.
 */
export const OFFICIAL_LOGO_INK = {
  x: 165 / 1600,
  y: 165 / 767,
  width: 1270 / 1600,
  height: 437 / 767,
} as const;

/** Šířka celého assetu (včetně paddingu ve viewBoxu), aby inkoust měl aspoň 25 mm. */
export function officialLogoPrintWidthMm(
  minInkWidthMm: number = OFFICIAL_LOGO_MIN_INK_WIDTH_MM,
): number {
  return minInkWidthMm / OFFICIAL_LOGO_INK.width;
}

export function officialLogoSize(widthMm: number = officialLogoPrintWidthMm()): {
  width: number;
  height: number;
} {
  return { width: widthMm, height: widthMm / OFFICIAL_LOGO_ASPECT };
}

/** Standardní tmavý pruh statistik, 1. strany startovky a výsledků. */
export const PRINT_HEADER_BAND_MM = 34;
/** Úzký pruh prezentace a dalších stran startovky — logo i ochranná zóna se vejdou. */
export const PRINT_HEADER_BAND_COMPACT_MM = 28;

export const OFFICIAL_LOGO_PUBLIC_PATHS = {
  dark: "/images/logo/mcvv-logo-barevne-na-tmave.png",
  light: "/images/logo/mcvv-logo-barevne-na-svetle.png",
} as const;

export const OFFICIAL_OG_IMAGE_PATH = "/images/og/mcvv-og.png";
export const OFFICIAL_OG_IMAGE_WIDTH = 1200;
export const OFFICIAL_OG_IMAGE_HEIGHT = 630;

/** Šířka loga v e-mailu (px); viditelný znak zůstává nad minimem 120 px. */
export const OFFICIAL_LOGO_EMAIL_WIDTH_PX = 180;
export const OFFICIAL_LOGO_EMAIL_HEIGHT_PX = Math.round(
  OFFICIAL_LOGO_EMAIL_WIDTH_PX / OFFICIAL_LOGO_ASPECT,
);

/** Veřejná HTTPS adresa loga (e-maily, Open Graph). Žádné CID ani data URI. */
export function officialAssetUrl(site: string, assetPath: string): string {
  return `${site.replace(/\/$/, "")}${assetPath}`;
}

export function officialLogoEmailUrl(site: string): string {
  return officialAssetUrl(site, OFFICIAL_LOGO_PUBLIC_PATHS.dark);
}

export function officialOgImageUrl(site: string): string {
  return officialAssetUrl(site, OFFICIAL_OG_IMAGE_PATH);
}

export function drawOfficialLogo(
  doc: jsPDF,
  image: OfficialLogoImage,
  x: number,
  y: number,
  widthMm: number,
  alias: string,
): { width: number; height: number } {
  const height = widthMm * (image.pixelHeight / image.pixelWidth);
  doc.addImage(image.data, "PNG", x, y, widthMm, height, alias, "FAST");
  return { width: widthMm, height };
}
