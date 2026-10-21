import { prisma } from "@/lib/db/client";

import { createClubResolver, type ClubAliasRef, type ClubResolver } from "./core";

/** Confirmed aliases (written name key → canonical club). Small table, read per request. */
export async function loadClubAliases(): Promise<ClubAliasRef[]> {
  const rows = await prisma.clubAlias.findMany({
    select: { key: true, club: { select: { id: true, slug: true, name: true } } },
  });
  return rows.map((row) => ({ key: row.key, club: row.club }));
}

export async function getClubResolver(): Promise<ClubResolver> {
  return createClubResolver(await loadClubAliases());
}
