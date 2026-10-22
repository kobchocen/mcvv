import { prisma } from "@/lib/db/client";
import { nextNumericClubIdFrom } from "@/lib/entries/club-id";

export const EMPTY_CLUB_ID = "000";

export async function ensureEmptyClub(year: number): Promise<string> {
  const existing = await prisma.club.findUnique({
    where: { id_year: { id: EMPTY_CLUB_ID, year } },
    select: { id: true },
  });
  if (existing) {
    return EMPTY_CLUB_ID;
  }
  await prisma.club.create({
    data: { id: EMPTY_CLUB_ID, year, name: "", author: "web" },
  });
  return EMPTY_CLUB_ID;
}

export async function resolveClubId(name: string, year: number): Promise<string> {
  return (await resolveClub(name, year)).id;
}

/**
 * Klub podle názvu v ročníku. `created` = v ročníku založen nový klub (pro souhrn změn #130).
 */
export async function resolveClub(
  name: string,
  year: number,
): Promise<{ id: string; name: string; created: boolean }> {
  const label = name.trim().slice(0, 50);
  if (!label) {
    return { id: await ensureEmptyClub(year), name: "", created: false };
  }
  const thisYear = await prisma.club.findFirst({
    where: { year, name: label },
    select: { id: true },
  });
  if (thisYear) {
    return { id: thisYear.id, name: label, created: false };
  }
  const historic = await prisma.club.findFirst({
    where: { name: label },
    orderBy: { year: "desc" },
    select: { id: true },
  });
  const id = historic?.id ?? (await nextNumericClubId());
  await prisma.club.create({
    data: { id, year, name: label, author: "web" },
  });
  return { id, name: label, created: true };
}

async function nextNumericClubId(): Promise<string> {
  const rows = await prisma.club.findMany({ select: { id: true }, distinct: ["id"] });
  return nextNumericClubIdFrom(rows.map((row) => row.id));
}
