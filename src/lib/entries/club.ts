import { prisma } from "@/lib/db/client";
import {
  EMPTY_CLUB_ID,
  resolveClubWith,
  type ClubStore,
  type ResolvedClub,
} from "@/lib/entries/club-core";
import { buildClubOptions, type ClubOption } from "@/lib/entries/club-options";
import { loadClubNames } from "@/lib/clubs/queries";
import { nextNumericClubIdFrom } from "@/lib/entries/club-id";

export { EMPTY_CLUB_ID };

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

/** Nabídka klubů pro přihlášku: všechna id z číselníku s nejnovějším názvem (Q35). */
export async function loadClubOptions(): Promise<ClubOption[]> {
  return buildClubOptions(await loadClubNames());
}

const prismaClubStore: ClubStore = {
  ensureEmptyClub,
  findInYear: (id, year) =>
    prisma.club.findUnique({ where: { id_year: { id, year } }, select: { name: true } }),
  findLatest: (id) =>
    prisma.club.findFirst({ where: { id }, orderBy: { year: "desc" }, select: { name: true } }),
  findInYearByName: (year, name) =>
    prisma.club.findFirst({ where: { year, name }, select: { id: true } }),
  findLatestByName: (name) =>
    prisma.club.findFirst({ where: { name }, orderBy: { year: "desc" }, select: { id: true } }),
  options: loadClubOptions,
  create: async ({ id, year, name }) => {
    await prisma.club.create({ data: { id, year, name, author: "web" } });
  },
  nextNumericId: nextNumericClubId,
};

/**
 * Klub řádku přihlášky podle id z formuláře, volby z nabídky nebo názvu (viz `resolveClubWith`).
 * `created` = založeno nové id klubu (pro souhrn změn #130).
 */
export async function resolveClub(
  name: string,
  year: number,
  clubId?: string | null,
): Promise<ResolvedClub> {
  return resolveClubWith(prismaClubStore, name, year, clubId);
}

async function nextNumericClubId(): Promise<string> {
  const rows = await prisma.club.findMany({ select: { id: true }, distinct: ["id"] });
  return nextNumericClubIdFrom(rows.map((row) => row.id));
}
