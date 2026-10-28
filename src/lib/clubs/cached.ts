import { unstable_cache } from "next/cache";

import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

import { createClubResolver, type ClubNameRow } from "./core";
import { computeClubDirectory, type ClubDirectoryRow } from "./directory";
import { computeClubProfile, type ClubProfile } from "./profile";
import { loadClubDirectoryInput, loadClubNames, loadClubResults } from "./queries";

/**
 * Cached club data for the public pages (/kluby, /kluby/[slug]). Results change only with a
 * result import, a club merge or a club name edit in the admin; all of them revalidate the
 * "stats" tag. The hour is a safety net, the same as the statistics overview.
 */
const CLUB_CACHE = { revalidate: 3600, tags: [STATS_CACHE_TAG] };

export type ClubIndex = { names: ClubNameRow[] };

async function loadClubIndex(): Promise<ClubIndex> {
  return { names: await loadClubNames() };
}

/** Uncached club names (a club id created since the cache was filled). */
export const loadFreshClubIndex = loadClubIndex;

export const getClubIndex = unstable_cache(loadClubIndex, ["club-index-v2"], CLUB_CACHE);

/** Profile of a club id, computed from that club's results only (uncached). */
export async function loadClubProfile(id: string, index: ClubIndex): Promise<ClubProfile | null> {
  const resolver = createClubResolver(index);
  return computeClubProfile(await loadClubResults(resolver.mainId(id)), resolver, id);
}

/** Cached profile of a club id. */
export const getClubProfile = unstable_cache(
  async (mainId: string): Promise<ClubProfile | null> =>
    loadClubProfile(mainId, await getClubIndex()),
  ["club-profile-v4"],
  CLUB_CACHE,
);

export const getClubDirectory = unstable_cache(
  async (): Promise<ClubDirectoryRow[]> => {
    const [index, rows] = await Promise.all([getClubIndex(), loadClubDirectoryInput()]);
    return computeClubDirectory(rows, createClubResolver(index));
  },
  ["club-directory-v2"],
  CLUB_CACHE,
);
