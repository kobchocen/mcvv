import { unstable_cache } from "next/cache";

import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

import { createClubResolver, type ClubMergeRef, type ClubNameRow } from "./core";
import { computeClubDirectory, type ClubDirectoryRow } from "./directory";
import { computeClubProfile, type ClubProfile } from "./profile";
import { loadClubDirectoryInput, loadClubMerges, loadClubNames, loadClubResults } from "./queries";

/**
 * Cached club data for the public pages (/kluby, /kluby/[slug]). Results change only with a
 * result import, a club merge or a club name edit in the admin; all of them revalidate the
 * "stats" tag. The hour is a safety net, the same as the statistics overview.
 */
const CLUB_CACHE = { revalidate: 3600, tags: [STATS_CACHE_TAG] };

export type ClubIndex = { names: ClubNameRow[]; merges: ClubMergeRef[] };

async function loadClubIndex(): Promise<ClubIndex> {
  const [names, merges] = await Promise.all([loadClubNames(), loadClubMerges()]);
  return { names, merges };
}

/** Uncached club names and merges (a club id created since the cache was filled). */
export const loadFreshClubIndex = loadClubIndex;

export const getClubIndex = unstable_cache(loadClubIndex, ["club-index"], CLUB_CACHE);

/** Profile of a main id, computed from that club's results only (uncached). */
export async function loadClubProfile(
  mainId: string,
  index: ClubIndex,
): Promise<ClubProfile | null> {
  const resolver = createClubResolver(index);
  const results = await loadClubResults(resolver.members(mainId));
  return computeClubProfile(results, resolver, mainId);
}

/** Cached profile of a main id. */
export const getClubProfile = unstable_cache(
  async (mainId: string): Promise<ClubProfile | null> =>
    loadClubProfile(mainId, await getClubIndex()),
  ["club-profile-v2"],
  CLUB_CACHE,
);

export const getClubDirectory = unstable_cache(
  async (): Promise<ClubDirectoryRow[]> => {
    const [index, rows] = await Promise.all([getClubIndex(), loadClubDirectoryInput()]);
    return computeClubDirectory(rows, createClubResolver(index));
  },
  ["club-directory"],
  CLUB_CACHE,
);
