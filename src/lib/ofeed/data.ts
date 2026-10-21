import { prisma } from "@/lib/db/client";
import type { RaceContext } from "@/lib/live/race-context";
import { startInstant } from "@/lib/live/start-time";
import { FINISH_SPLIT, type Station } from "@/lib/live/stations";

import type { IofClass, ResultListInput } from "./iof-xml";

/** Startovka (`mcvv_start`) + mezičasy (`mcvv_split`) ročníku → vstup pro ResultList. */
export async function loadResultListInput(
  ctx: RaceContext,
  stations: Station[],
  eventId: string,
  now: Date,
): Promise<{ input: ResultListInput; competitors: number }> {
  const [starts, categories, clubs, splits] = await Promise.all([
    prisma.startEntry.findMany({
      where: { year: ctx.year },
      select: {
        runnerId: true,
        clubId: true,
        categoryId: true,
        bib: true,
        runnerName: true,
        clubName: true,
        runner: { select: { name: true } },
      },
    }),
    prisma.category.findMany({ select: { id: true, name: true, sex: true, sort: true } }),
    prisma.club.findMany({ where: { year: ctx.year }, select: { id: true, name: true } }),
    prisma.split.findMany({
      where: { year: ctx.year },
      select: { bib: true, split: true, time: true },
    }),
  ]);
  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const byBib = new Map<number, { splits: Record<string, number>; finishS: number | null }>();
  for (const row of splits) {
    const entry = byBib.get(row.bib) ?? { splits: {}, finishS: null };
    if (row.split === FINISH_SPLIT) entry.finishS = row.time;
    else entry.splits[row.split] = row.time;
    byBib.set(row.bib, entry);
  }
  const classes: IofClass[] = [...categories]
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map((category) => ({
      id: category.id,
      name: category.name,
      sex:
        category.sex === "F" ? ("F" as const) : category.sex === "M" ? ("M" as const) : undefined,
      competitors: [],
    }));
  const classById = new Map(classes.map((cls) => [cls.id, cls]));
  for (const start of starts) {
    const cls = classById.get(start.categoryId);
    if (!cls || start.bib < 1) continue;
    const timing = byBib.get(start.bib) ?? { splits: {}, finishS: null };
    cls.competitors.push({
      runnerId: start.runnerId,
      name: start.runnerName || start.runner.name,
      clubId: start.clubId,
      clubName: start.clubName || clubNames.get(start.clubId) || null,
      bib: start.bib,
      startTime: startInstant(ctx.zero, start.bib, ctx.intervalS),
      splits: timing.splits,
      finishS: timing.finishS,
    });
  }
  return {
    competitors: starts.length,
    input: {
      eventId: `mcvv-${ctx.year}`,
      eventName: `Malá cena Velké Verandy ${ctx.year}`,
      eventStart: ctx.zero,
      classes,
      splitCodes: stations.map((station) => station.code),
      createTime: now,
      now,
      creator: `mcvv.org (OFeed ${eventId})`,
    },
  };
}
