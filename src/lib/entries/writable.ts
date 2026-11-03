import { prisma } from "@/lib/db/client";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { currentRaceYear } from "@/lib/entries/year";
import type { SlotType } from "@/lib/slots/core";
import {
  currentEntrySlot,
  registrationWritable,
  type EntryWriteContext,
} from "@/lib/slots/entry-slot";

/** Kontext pro serverové kontroly zápisu z webu (aktuální ročník, termíny, teď). */
export async function loadEntryWriteContext(now = new Date()): Promise<EntryWriteContext> {
  const { year, open, slots } = await currentRaceYear();
  return { year, open, slots, now };
}

export type OwnEntry = {
  year: number;
  id: number;
  name: string | null;
  status: number | null;
  slot: SlotType | null;
  writable: boolean;
};

/** Vlastní nezrušená přihláška s termínem a příznakem, zda ji lze z webu měnit. */
export async function ownEntry(
  ctx: EntryWriteContext,
  year: number,
  id: number,
  email: string,
): Promise<OwnEntry | null> {
  const [row, meta] = await Promise.all([
    prisma.registration.findFirst({
      where: {
        year,
        id,
        email: { equals: email },
        OR: [{ status: { not: ENTRY_STATUS.cancelled } }, { status: null }],
      },
      select: { year: true, id: true, name: true, status: true },
    }),
    prisma.registrationMeta.findUnique({
      where: { year_id: { year, id } },
      select: { slot: true },
    }),
  ]);
  if (!row) return null;
  const slot = meta?.slot ?? null;
  return { ...row, slot, writable: registrationWritable(ctx, { ...row, slot }) };
}

/** Vlastní přihláška, kterou lze teď z webu měnit (jinak null – zamčená, cizí, zrušená). */
export async function writableOwnEntry(
  ctx: EntryWriteContext,
  year: number,
  id: number,
  email: string,
): Promise<OwnEntry | null> {
  const entry = await ownEntry(ctx, year, id, email);
  return entry?.writable ? entry : null;
}

export { currentEntrySlot };
