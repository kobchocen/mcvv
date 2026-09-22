import { existsSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@/lib/db/client";

const EXTENSIONS = [".svg", ".webp", ".png", ".jpg", ".jpeg", ".gif"] as const;

export function partnerLogoSrc(image: string | null | undefined): string | null {
  if (!image) {
    return null;
  }

  const dir = join(process.cwd(), "public/partners");
  const slug = image.replace(/^\/+/, "");

  if (slug.includes(".") && existsSync(join(dir, slug))) {
    return `/partners/${slug}`;
  }

  for (const ext of EXTENSIONS) {
    if (existsSync(join(dir, `${slug}${ext}`))) {
      return `/partners/${slug}${ext}`;
    }
  }

  return null;
}

export function partnerHref(link: string | null | undefined): string | null {
  if (!link) {
    return null;
  }
  const trimmed = link.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export async function loadPartners() {
  try {
    const rows = await prisma.sponsor.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { name: true, link: true, image: true },
    });
    return rows
      .map((row) => ({
        name: row.name?.trim() || "Partner",
        href: partnerHref(row.link),
        logoSrc: partnerLogoSrc(row.image),
      }))
      .filter((row, index, list) => list.findIndex((item) => item.name === row.name) === index);
  } catch (error) {
    console.error("[partners] load failed", error);
    return [];
  }
}
