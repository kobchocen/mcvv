import { readFile } from "node:fs/promises";
import path from "node:path";

import QRCode from "qrcode";
import sharp from "sharp";

/** Obsah QR na čísle: ročník + startovní číslo, např. MCVV2026-173. Prefix ani formát se nemění. */
export function bibQrPayload(year: number, bib: number): string {
  return `MCVV${year}-${bib}`;
}

/** Oficiální vizuál: ECC H a verze 4 kvůli logu V uprostřed; payload zůstává stejný. */
export const BIB_QR_ECC = "H" as const;
export const BIB_QR_ORANGE = "#fb5d1e";
export const BIB_QR_SIZE_PX = 375;
export const BIB_QR_TOP_PX = 380;
export const BIB_QR_RIGHT_PX = 100;
export const BIB_QR_QUIET = 4;
export const BIB_QR_LOGO_FRAC = 0.3;

export type QrMatrix = { size: number; darkAt: (row: number, col: number) => boolean };

export function bibQrMatrix(year: number, bib: number): QrMatrix {
  const qr = QRCode.create(bibQrPayload(year, bib), {
    errorCorrectionLevel: BIB_QR_ECC,
  });
  const size = qr.modules.size;
  return {
    size,
    darkAt: (row, col) => qr.modules.get(row, col) === 1,
  };
}

export function isQrFinderCell(row: number, col: number, size: number): boolean {
  const inBox = (r0: number, c0: number) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
  return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
}

let logoCache: Promise<Buffer> | null = null;

export function loadQrLogo(root: string = process.cwd()): Promise<Buffer> {
  if (!logoCache) {
    logoCache = readFile(path.join(root, "src", "assets", "print", "qr-logo-v.png")).catch(
      (error: unknown) => {
        logoCache = null;
        throw error;
      },
    );
  }
  return logoCache;
}

function finderSvg(x: number, y: number, color: string): string {
  // Standardní 7×7 oko: oranžový rámeček, bílá, oranžový střed, lehce zaoblené.
  const r = 0.45;
  return [
    `<rect x="${x}" y="${y}" width="7" height="7" rx="${r}" fill="${color}"/>`,
    `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="${r * 0.7}" fill="#ffffff"/>`,
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${r * 0.5}" fill="${color}"/>`,
  ].join("");
}

export async function renderBibQrPng(
  year: number,
  bib: number,
  options?: { logo?: Buffer; sizePx?: number; root?: string },
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const matrix = bibQrMatrix(year, bib);
  const n = matrix.size;
  const qz = BIB_QR_QUIET;
  const cells = n + qz * 2;
  const modules: string[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (isQrFinderCell(row, col, n) || !matrix.darkAt(row, col)) {
        continue;
      }
      modules.push(
        `<rect x="${qz + col}" y="${qz + row}" width="1" height="1" rx="0.32" fill="#000000"/>`,
      );
    }
  }
  const finders = [
    finderSvg(qz, qz, BIB_QR_ORANGE),
    finderSvg(qz + n - 7, qz, BIB_QR_ORANGE),
    finderSvg(qz, qz + n - 7, BIB_QR_ORANGE),
  ].join("");
  const logo = options?.logo ?? (await loadQrLogo(options?.root));
  const body = n;
  const side = body * BIB_QR_LOGO_FRAC;
  const pad = side * 0.12;
  const logoBox = side + 2 * pad;
  const cx = qz + body / 2;
  const cy = qz + body / 2;
  const href = `data:image/png;base64,${logo.toString("base64")}`;
  const logoSvg = [
    `<circle cx="${cx}" cy="${cy}" r="${logoBox / 2}" fill="#ffffff"/>`,
    `<image href="${href}" x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}"/>`,
  ].join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1000" height="1000" viewBox="0 0 ${cells} ${cells}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${modules.join("")}
  ${finders}
  ${logoSvg}
</svg>`;
  const sizePx = options?.sizePx ?? BIB_QR_SIZE_PX * 2;
  const { data, info } = await sharp(Buffer.from(svg), { density: 300 })
    .resize({ width: sizePx })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}
