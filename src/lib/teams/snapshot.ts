import type { TeamCompetition, TeamStanding } from "./scoring";

export type AnnouncementRow = {
  rank: number | null;
  team: string;
  points: number;
  finishers: number;
};

export type TeamAnnouncement = {
  year: number;
  /** ISO timestamp in UTC; display in Europe/Prague. */
  capturedAt: string;
  source: "live";
  official: AnnouncementRow[];
};

export const announcementSettingKey = (year: number) => `teams.announce.${year}`;

export function compactOfficial(competition: TeamCompetition): AnnouncementRow[] {
  return competition.official.map((row) => ({
    rank: row.rank,
    team: row.team,
    points: row.points,
    finishers: row.finishers,
  }));
}

export function makeAnnouncement(
  year: number,
  competition: TeamCompetition,
  capturedAt: Date,
): TeamAnnouncement {
  return {
    year,
    capturedAt: capturedAt.toISOString(),
    source: "live",
    official: compactOfficial(competition),
  };
}

export function parseAnnouncement(raw: string | null | undefined): TeamAnnouncement | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TeamAnnouncement;
    if (
      typeof value?.year !== "number" ||
      typeof value.capturedAt !== "string" ||
      !Array.isArray(value.official)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export type AnnouncementDiff = {
  changed: boolean;
  announced: AnnouncementRow[];
  official: AnnouncementRow[];
};

function rowKey(row: AnnouncementRow): string {
  return `${row.rank ?? "-"}|${row.team}|${row.points}|${row.finishers}`;
}

export function announcementDiff(
  announced: readonly AnnouncementRow[],
  official: readonly TeamStanding[] | readonly AnnouncementRow[],
): AnnouncementDiff {
  const compact = official.map((row) => ({
    rank: row.rank,
    team: row.team,
    points: row.points,
    finishers: row.finishers,
  }));
  const left = announced.map(rowKey).join("\n");
  const right = compact.map(rowKey).join("\n");
  return { changed: left !== right, announced: [...announced], official: compact };
}
