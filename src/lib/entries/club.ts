import { prisma } from "@/lib/db/client";

function numericClubId(id: string): number | null {
  const trimmed = id.trim();
  if (trimmed >= "AAA" || !/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

export async function resolveClubId(name: string, year: number): Promise<string | null> {
  const label = name.trim().slice(0, 50);
  if (!label) {
    return null;
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
