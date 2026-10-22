import { prisma } from "@/lib/db/client";

import { createClubResolver, type ClubNameRow, type ClubResolver } from "./core";

/** All cis_klub rows (id, year, name): a few thousand short rows, read per request. */
export async function loadClubNames(): Promise<ClubNameRow[]> {
  return prisma.club.findMany({ select: { id: true, year: true, name: true } });
}

export async function getClubResolver(): Promise<ClubResolver> {
  return createClubResolver({ names: await loadClubNames() });
}
