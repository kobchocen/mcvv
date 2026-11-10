import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { RECEIPT_FONT_DIR } from "@/lib/receipts/fonts";

import type { CoursePoint } from "./course-profile";
import type { BibLogo } from "./render-bibs";

export const PRINT_ASSET_DIR = path.join("src", "assets", "print");

/** Logo MCVV 2A světlé (maska), rastr 2× šířky 720 px na čísle. */
const LOGO_WIDTH_PX = 1440;

/** Odznak roku včetně přesahu šikmých číslic (bib12 overflow:visible). */
export const YEAR_BADGE_PAD_X = 50;
export const YEAR_BADGE_PAD_Y = 20;
export const YEAR_BADGE_W = 450 + 50 + 50;
export const YEAR_BADGE_H = 250 + 20 + 20;
const YEAR_BADGE_SCALE = 2;

let logoCache: Promise<BibLogo> | null = null;
let profileCache: Promise<CoursePoint[]> | null = null;
let waveCache: Promise<CoursePoint[]> | null = null;
const yearCache = new Map<number, Promise<BibLogo>>();

export function loadMcvvLogo(root: string = process.cwd()): Promise<BibLogo> {
  if (!logoCache) {
    logoCache = readFile(path.join(root, PRINT_ASSET_DIR, "mcvv-logo.svg"))
      .then((svg) =>
        sharp(svg, { density: 600 })
          .resize({ width: LOGO_WIDTH_PX })
          .png()
          .toBuffer({ resolveWithObject: true }),
      )
      .then(({ data, info }) => ({
        data: new Uint8Array(data),
        width: info.width,
        height: info.height,
      }))
      .catch((error: unknown) => {
        logoCache = null;
        throw error;
      });
  }
  return logoCache;
}

export function loadCourseProfileData(root: string = process.cwd()): Promise<CoursePoint[]> {
  if (!profileCache) {
    profileCache = readFile(path.join(root, PRINT_ASSET_DIR, "course-profile.json"), "utf8")
      .then((text) => JSON.parse(text) as CoursePoint[])
      .catch((error: unknown) => {
        profileCache = null;
        throw error;
      });
  }
  return profileCache;
}

/** Vlnitá linka ročního čísla v souřadnicích SVG 450×250 z schváleného návrhu (bib12). */
export function loadYearWave(root: string = process.cwd()): Promise<CoursePoint[]> {
  if (!waveCache) {
    waveCache = readFile(path.join(root, PRINT_ASSET_DIR, "year-wave.json"), "utf8")
      .then((text) => JSON.parse(text) as CoursePoint[])
      .catch((error: unknown) => {
        waveCache = null;
        throw error;
      });
  }
  return waveCache;
}

function yearBadgeSvg(year: number, wave: readonly CoursePoint[], fontDataUri: string): string {
  const line = wave.map(([x, y]) => `${x},${y}`).join(" ");
  const clip = `-105,260 ${line} 560,260`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${YEAR_BADGE_W}" height="${YEAR_BADGE_H}" viewBox="-50 -20 ${YEAR_BADGE_W} ${YEAR_BADGE_H}">
  <style>@font-face{font-family:Oswald;src:url('${fontDataUri}');font-weight:700}</style>
  <defs>
    <clipPath id="yb"><polygon points="${clip}"/></clipPath>
  </defs>
  <g transform="translate(225,0) skewX(-12) translate(-225,0)" font-family="Oswald" font-weight="700" font-size="215" text-anchor="middle" letter-spacing="2">
    <text x="225" y="225" fill="#07210e">${year}</text>
  </g>
  <g clip-path="url(#yb)">
    <g transform="translate(225,0) skewX(-12) translate(-225,0)" font-family="Oswald" font-weight="700" font-size="215" text-anchor="middle" letter-spacing="2">
      <text x="225" y="225" fill="#fb5d1e">${year}</text>
    </g>
  </g>
  <polyline fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" points="${line}"/>
</svg>`;
}

/** Rok ve stejném stylu jako logo MCVV (kurzíva, forest/oranžová, bílá vlna). */
export function loadYearBadge(year: number, root: string = process.cwd()): Promise<BibLogo> {
  const cached = yearCache.get(year);
  if (cached) {
    return cached;
  }
  const pending = (async () => {
    const [font, wave] = await Promise.all([
      readFile(path.join(root, RECEIPT_FONT_DIR, "Oswald-Bold.ttf")),
      loadYearWave(root),
    ]);
    const fontDataUri = `data:font/ttf;base64,${font.toString("base64")}`;
    const svg = Buffer.from(yearBadgeSvg(year, wave, fontDataUri));
    const { data, info } = await sharp(svg, { density: 192 })
      .resize({ width: YEAR_BADGE_W * YEAR_BADGE_SCALE })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  })().catch((error: unknown) => {
    yearCache.delete(year);
    throw error;
  });
  yearCache.set(year, pending);
  return pending;
}
