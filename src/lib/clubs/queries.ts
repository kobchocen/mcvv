import { prisma } from "@/lib/db/client";
import { runnerNameFor } from "@/lib/format/runner-name";
import type { RawResult } from "@/lib/stats/core";

import { createClubResolver, type ClubNameRow, type ClubResolver } from "./core";
import type { ClubDirectoryInput } from "./directory";

/** All cis_klub rows (id, year, name): a few thousand short rows, read per request. */
export async function loadClubNames(): Promise<ClubNameRow[]> {
  return prisma.club.findMany({ select: { id: true, year: true, name: true } });
}

export async function getClubResolver(): Promise<ClubResolver> {
  return createClubResolver({ names: await loadClubNames() });
}

type ClubResultSqlRow = {
  year: number | bigint;
  time: number | bigint;
  runnerId: string;
  runnerName: string | null;
  runnerRegistryName: string | null;
  clubId: string;
  clubName: string | null;
  clubRegistryName: string | null;
};

/**
 * Results of one club id only, as `loadAllResults` maps them: one indexed query
 * (mcvv_time_klub_id_rok_fkey) joined with the club and runner registries, instead of all
 * results plus two large IN lookups.
 */
export async function loadClubResults(id: string): Promise<RawResult[]> {
  if (!id) return [];
  const rows = await prisma.$queryRaw<ClubResultSqlRow[]>`
    SELECT t.rok AS year, t.time AS time, t.bezec_id AS runnerId, t.bezec_name AS runnerName,
           b.jmeno AS runnerRegistryName, t.klub_id AS clubId, t.klub_name AS clubName,
           k.jmeno AS clubRegistryName
    FROM mcvv_time t
    LEFT JOIN cis_klub k ON k.id = t.klub_id AND k.rok = t.rok
    LEFT JOIN cis_bezec b ON b.id = t.bezec_id
    WHERE t.klub_id = ${id}`;
  return rows.map((row) => ({
    year: Number(row.year),
    time: Number(row.time),
    runnerId: row.runnerId,
    runnerName: runnerNameFor("stats", row.runnerName, row.runnerRegistryName),
    clubId: row.clubId,
    clubName: row.clubRegistryName || row.clubName || null,
  }));
}

type DirectorySqlRow = {
  year: number | bigint;
  runnerId: string;
  clubId: string;
  clubName: string | null;
  clubRegistryName: string | null;
};

/** One light row per result for the club list (no runner names, no times). */
export async function loadClubDirectoryInput(): Promise<ClubDirectoryInput[]> {
  const rows = await prisma.$queryRaw<DirectorySqlRow[]>`
    SELECT t.rok AS year, t.bezec_id AS runnerId, t.klub_id AS clubId, t.klub_name AS clubName,
           k.jmeno AS clubRegistryName
    FROM mcvv_time t
    LEFT JOIN cis_klub k ON k.id = t.klub_id AND k.rok = t.rok`;
  return rows.map((row) => ({
    year: Number(row.year),
    runnerId: row.runnerId,
    clubId: row.clubId,
    clubName: row.clubRegistryName || row.clubName || null,
  }));
}
