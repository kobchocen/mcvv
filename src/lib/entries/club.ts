import { prisma } from "@/lib/db/client";

export const EMPTY_CLUB_ID = "000";

function numericClubId(id: string): number | null {
  const trimmed = id.trim();
  if (trimmed >= "AAA" || !/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

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
  const label = name.trim().slice(0, 50);
  if (!label) {
    return ensureEmptyClub(year);
  }
  const thisYear = await prisma.club.findFirst({
    where: { year, name: label },
    select: { id: true },
  });
  if (thisYear) {
    return thisYear.id;
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
  return id;
}

async function nextNumericClubId(): Promise<string> {
  const rows = await prisma.club.findMany({ select: { id: true } });
  const numbers = rows
    .map((row) => numericClubId(row.id))
    .filter((value): value is number => value !== null);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 111;
  if (next > 999) {
    return "111";
  }
  return String(next);
}
