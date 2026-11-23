import { prisma } from "@/lib/db/client";

import { liveTeamCompetition } from "./live";
import type { LiveTeamSource } from "./live";
import {
  makeAnnouncement,
  parseAnnouncement,
  announcementSettingKey,
  type TeamAnnouncement,
} from "./snapshot";

export async function loadTeamAnnouncement(year: number): Promise<TeamAnnouncement | null> {
  const row = await prisma.setting.findUnique({
    where: { key: announcementSettingKey(year) },
    select: { text: true },
  });
  return parseAnnouncement(row?.text);
}

export async function saveTeamAnnouncement(announcement: TeamAnnouncement): Promise<void> {
  const key = announcementSettingKey(announcement.year);
  const text = JSON.stringify(announcement);
  await prisma.setting.upsert({
    where: { key },
    update: { text },
    create: { key, text },
  });
}

/** Capture current live standings as the 12:20 announcement; no-op if one already exists. */
export async function captureTeamAnnouncementIfMissing(
  year: number,
  source: LiveTeamSource,
  now = new Date(),
): Promise<TeamAnnouncement | null> {
  const existing = await loadTeamAnnouncement(year);
  if (existing) return existing;
  const competition = liveTeamCompetition(source);
  if (competition.official.length === 0) return null;
  const announcement = makeAnnouncement(year, competition, now);
  await saveTeamAnnouncement(announcement);
  return announcement;
}
