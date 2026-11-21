import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { RECEIPT_FONT_DIR } from "@/lib/receipts/fonts";

import {
  BIB_CREAM,
  BIB_FOREST,
  BIB_GOLD,
  BIB_GREEN,
  BIB_ORANGE,
  sealCountText,
  type BibSeal,
} from "./bibs-core";
import { profilePoints, type CoursePoint } from "./course-profile";
import sealNumberLayout from "../../assets/print/seal-number-layout.json";

/** Velikost primární pečeti na A5 @ 300 dpi (v15). */
export const SEAL_SIZE_PX = 268;
/** Zmenšená veteránská pečeť mezi QR a standardní pečetí. */
export const SEAL_SMALL_PX = 154;
export const SEAL_RIGHT_PX = 100;
/** Horní okraj primární pečeti: spodek 1186 sedí u účaří čísla (1172). */
export const SEAL_PRIMARY_TOP_PX = 918;
export const SEAL_VB = 240;
const NUMBER_SIZE = 128;
const PROFILE_FLAT = 0.48;
const COURSE_U0 = 0.22;
const COURSE_U1 = 0.78;

export function sealCacheKey(seal: BibSeal): string {
  return `${seal.kind}-${seal.count}-${seal.placement}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function flattenedWave(
  profile: readonly CoursePoint[],
  x0: number,
  x1: number,
  yb: number,
  fs: number,
) {
  const offY0 = yb - ((64 - 32) / 70) * fs;
  const offY1 = yb - ((64 - 54) / 70) * fs;
  const mid = (offY0 + offY1) / 2;
  const unit = profilePoints(profile, 14, 0, 1, 0, 1, 1);
  const pts: { x: number; y: number }[] = [];
  for (const p of unit) {
    const u = p.x;
    if (u + 1e-9 < COURSE_U0) {
      continue;
    }
    if (u - 1e-9 > COURSE_U1) {
      break;
    }
    const xx = x0 + ((u - COURSE_U0) / (COURSE_U1 - COURSE_U0)) * (x1 - x0);
    const yy = mid + PROFILE_FLAT * (offY0 + p.y * (offY1 - offY0) - mid);
    pts.push({ x: xx, y: yy });
  }
  if (pts.length === 0) {
    pts.push({ x: x0, y: mid }, { x: x1, y: mid });
  }
  if (Math.abs(pts[0].x - x0) > 0.05) {
    pts.unshift({ x: x0, y: pts[0].y });
  }
  if (Math.abs(pts[pts.length - 1].x - x1) > 0.05) {
    pts.push({ x: x1, y: pts[pts.length - 1].y });
  }
  return pts;
}

export type SealNumberLayout = {
  yb: number;
  tx: number;
  adv: number;
  bounds: number[];
  d: string;
  transform: string;
};

/** Oficiální v15 place_number: vycentrovaný ink bbox mezi MCVV a popiskem. */
export function sealNumberPlacement(count: string): SealNumberLayout {
  const entry = (sealNumberLayout as { layout: Record<string, SealNumberLayout> }).layout[count];
  if (!entry) {
    throw new Error(`Missing official seal layout for ${count}`);
  }
  return entry;
}

export function sealSvg(
  seal: BibSeal,
  profile: readonly CoursePoint[],
  fontDataUri: string,
): string {
  const count = sealCountText(seal.count);
  const ring = BIB_CREAM;
  const fill = seal.fill;
  const fillTop = BIB_CREAM;
  const fillBot = seal.kind === "veteran" ? BIB_ORANGE : BIB_FOREST;
  // Oficiální bib15.py: gap = 2.6 / 70 * fs (ne 2.6 z kroužku).
  const gap = (2.6 / 70) * NUMBER_SIZE;
  const uid = `cut-${seal.kind}-${count}`;
  const placed = sealNumberPlacement(count);
  const [x0, , x1] = placed.bounds;
  const wave = flattenedWave(profile, x0 - 6, x1 + 6, placed.yb, NUMBER_SIZE);
  const line = wave.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const px0 = wave[0].x;
  const px1 = wave[wave.length - 1].x;
  const poly = `${line} ${px1.toFixed(2)},${placed.yb + 36} ${px0.toFixed(2)},${placed.yb + 36}`;
  const label = escapeXml(seal.label);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SEAL_VB}" height="${SEAL_VB}" viewBox="0 0 ${SEAL_VB} ${SEAL_VB}">
  <style>@font-face{font-family:Oswald;src:url('${fontDataUri}');font-weight:600 700}</style>
  <defs>
    <clipPath id="${uid}"><polygon points="${poly}"/></clipPath>
    <clipPath id="${uid}-g"><path transform="${placed.transform}" d="${placed.d}"/></clipPath>
  </defs>
  <circle cx="120" cy="120" r="120" fill="${fill}"/>
  <circle cx="120" cy="120" r="111" fill="none" stroke="${ring}" stroke-width="2.6"/>
  <circle cx="120" cy="120" r="104" fill="none" stroke="${ring}" stroke-width="1" opacity=".55"/>
  <text x="120" y="50" text-anchor="middle" font-family="Oswald" font-weight="600" font-size="15" letter-spacing="4.5" fill="${ring}">MCVV</text>
  <g transform="${placed.transform}"><path d="${placed.d}" fill="${fillTop}"/></g>
  <g clip-path="url(#${uid})">
    <g transform="${placed.transform}"><path d="${placed.d}" fill="${fillBot}"/></g>
  </g>
  <g clip-path="url(#${uid}-g)">
    <polyline fill="none" stroke="${fill}" stroke-width="${gap.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" points="${line}"/>
  </g>
  <text x="120" y="204" text-anchor="middle" font-family="Oswald" font-weight="600" font-size="18" letter-spacing="3.2" fill="${ring}">${label}</text>
</svg>`;
}

export async function renderBibSealPng(
  seal: BibSeal,
  profile: readonly CoursePoint[],
  options?: { root?: string; sizePx?: number },
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const font = await readFile(
    path.join(options?.root ?? process.cwd(), RECEIPT_FONT_DIR, "Oswald-Bold.ttf"),
  );
  const fontDataUri = `data:font/ttf;base64,${font.toString("base64")}`;
  const svg = Buffer.from(sealSvg(seal, profile, fontDataUri));
  const sizePx =
    options?.sizePx ?? (seal.placement === "secondary" ? SEAL_SMALL_PX : SEAL_SIZE_PX) * 2;
  const { data, info } = await sharp(svg, { density: 300 })
    .resize({ width: sizePx })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

export const SEAL_COLORS = { green: BIB_GREEN, gold: BIB_GOLD } as const;
