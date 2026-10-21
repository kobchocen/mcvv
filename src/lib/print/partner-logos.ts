import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { prisma } from "@/lib/db/client";
import { partnerLogoSrc } from "@/lib/partners/logos";

import { BIB_PARTNER_CATEGORIES } from "./bibs-core";
import type { BibLogo } from "./render-bibs";

/** Výška rastru loga v px (pruh 28 mm ≈ 400 dpi) – ostré i při tisku. */
const LOGO_HEIGHT_PX = 440;

async function logoBytes(row: {
  image: string | null;
  logo: Uint8Array | null;
  logoType: string | null;
}): Promise<Buffer | null> {
  if (row.logo && row.logoType) {
    return Buffer.from(row.logo);
  }
  const src = partnerLogoSrc(row.image);
  if (!src) {
    return null;
  }
  return readFile(join(process.cwd(), "public", src));
}

/** Logo (PNG/JPEG/WebP/SVG) → PNG s průhledností, pevná výška; null při chybě. */
export async function rasterizeLogo(input: Buffer): Promise<BibLogo | null> {
  try {
    const { data, info } = await sharp(input, { density: 600 })
      .trim({ threshold: 4 })
      .resize({ height: LOGO_HEIGHT_PX, withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  } catch (error) {
    console.error("[print] partner logo rasterize failed", error);
    return null;
  }
}

/**
 * Aktivní partneři kategorie 1 a 2 ve stejném pořadí jako na webu (kategorie, pořadí, id).
 * Logo bere nahrané v adminu (včetně SVG), jinak statický soubor z public/partners.
 */
export async function loadBibPartnerLogos(): Promise<{ name: string; logo: BibLogo }[]> {
  const rows = await prisma.sponsor.findMany({
    where: { active: true, category: { in: [...BIB_PARTNER_CATEGORIES] } },
    orderBy: [{ category: "asc" }, { order: "asc" }, { id: "asc" }],
    select: { id: true, name: true, image: true, logo: true, logoType: true },
  });
  const result: { name: string; logo: BibLogo }[] = [];
  for (const row of rows) {
    const bytes = await logoBytes(row).catch(() => null);
    const logo = bytes ? await rasterizeLogo(bytes) : null;
    if (logo) {
      result.push({ name: row.name?.trim() || `Partner ${row.id}`, logo });
    }
  }
  return result;
}
