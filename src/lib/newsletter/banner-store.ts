import { prisma } from "@/lib/db/client";

import { NEWSLETTER_BANNER_PRESETS, NEWSLETTER_BANNER_TYPE } from "./banner";

export type BannerOption = { value: string; label: string };

async function bannerTypeId(): Promise<number> {
  const existing = await prisma.webImageType.findFirst({
    where: { desc: NEWSLETTER_BANNER_TYPE },
    select: { id: true },
  });
  if (existing) return existing.id;
  // Migrace typ zakládá; tady jen pojistka pro DB bez dat číselníku.
  const created = await prisma.webImageType.create({ data: { desc: NEWSLETTER_BANNER_TYPE } });
  return created.id;
}

/** Uloží nahraný (už zmenšený) banner do `webimages` a vrátí jeho id. Řádek se pak nemění. */
export async function storeBannerImage(data: Buffer, alt: string): Promise<number> {
  const typeId = await bannerTypeId();
  const row = await prisma.webImage.create({
    data: {
      typeId,
      desc: (alt || "banner newsletteru").slice(0, 128),
      year: new Date().getFullYear(),
      image: new Uint8Array(data),
    },
    select: { id: true },
  });
  return row.id;
}

export async function bannerImageExists(id: number): Promise<boolean> {
  const row = await prisma.webImage.findFirst({
    where: { id, type: { desc: NEWSLETTER_BANNER_TYPE } },
    select: { id: true },
  });
  return Boolean(row);
}

/** Volby pro výběr banneru: připravené bannery a dříve nahrané (nejnovější první). */
export async function loadBannerOptions(): Promise<BannerOption[]> {
  const uploaded = await prisma.webImage.findMany({
    where: { type: { desc: NEWSLETTER_BANNER_TYPE } },
    orderBy: { id: "desc" },
    take: 20,
    select: { id: true, desc: true, year: true },
  });
  return [
    { value: "", label: "Bez banneru" },
    ...NEWSLETTER_BANNER_PRESETS.map((preset) => ({
      value: `preset:${preset.key}`,
      label: `Připravený: ${preset.label}`,
    })),
    ...uploaded.map((row) => ({
      value: `image:${row.id}`,
      label: `Nahraný #${row.id}${row.year ? ` (${row.year})` : ""}: ${row.desc.slice(0, 60)}`,
    })),
  ];
}
