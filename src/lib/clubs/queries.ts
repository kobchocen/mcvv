import { prisma } from "@/lib/db/client";

import { createClubResolver, type ClubMergeRef, type ClubNameRow, type ClubResolver } from "./core";

/** All cis_klub rows (id, year, name): a few thousand short rows, read per request. */
export async function loadClubNames(): Promise<ClubNameRow[]> {
  return prisma.club.findMany({ select: { id: true, year: true, name: true } });
}

/** Manual merges (merged id → main id). Small table. */
export async function loadClubMerges(): Promise<ClubMergeRef[]> {
  return prisma.clubMerge.findMany({ select: { clubId: true, mainClubId: true } });
}

export async function getClubResolver(): Promise<ClubResolver> {
  const [names, merges] = await Promise.all([loadClubNames(), loadClubMerges()]);
  return createClubResolver({ names, merges });
}
