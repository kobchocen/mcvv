import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { ENTRY_STATUS, validRegistrationIds } from "@/lib/entries/status";

import type { BibRange, ChampionBibs } from "./start-settings";
import {
  compareByStart,
  startModelFromEdition,
  startTimeForBib,
  type StartModel,
} from "./start-time";
import type { GeneratorInput, StartGroupKind } from "./startlist-generator";

/** Číslo přihlášky pořadatelů (přihláška č. 1 ročníku). */
export const ORGANIZER_REGISTRATION_ID = 1;

export type CategoryInfo = { id: string; name: string; sort: number; sex: string };

export type StartSettings = {
  year: number;
  editionId: number | null;
  raceDate: Date | null;
  model: StartModel;
  champions: ChampionBibs;
  ranges: BibRange[];
  /** Rozsahy jsou uložené pro tento rok (false = převzaté z číselníku kategorií). */
  rangesStored: boolean;
  categories: CategoryInfo[];
};

function yearBounds(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

export async function editionForYear(year: number) {
  return prisma.edition.findFirst({ where: { date: yearBounds(year) }, orderBy: { id: "desc" } });
}

export async function latestEditionYear(): Promise<number> {
  const latest = await prisma.edition.findFirst({
    orderBy: { id: "desc" },
    select: { date: true },
  });
  return latest?.date.getUTCFullYear() ?? new Date().getFullYear();
}

/** Rozsahy čísel ročníku; když pro rok nejsou uložené, převezmou se z číselníku kategorií. */
export async function loadBibRanges(
  year: number,
): Promise<{ ranges: BibRange[]; stored: boolean; categories: CategoryInfo[] }> {
  const [categories, stored] = await Promise.all([
    prisma.category.findMany({
      orderBy: { sort: "asc" },
      select: { id: true, name: true, sort: true, sex: true, bibFrom: true, bibTo: true },
    }),
    prisma.categoryBibRange.findMany({ where: { year } }),
  ]);
  const byId = new Map(stored.map((row) => [row.categoryId, row]));
  const ranges = categories.map((category) => {
    const row = byId.get(category.id);
    return {
      categoryId: category.id,
      bibFrom: row?.bibFrom ?? category.bibFrom,
      bibTo: row?.bibTo ?? category.bibTo,
    };
  });
  return {
    ranges,
    stored: stored.length > 0,
    categories: categories.map(({ id, name, sort, sex }) => ({ id, name, sort, sex })),
  };
}

export async function loadStartSettings(year: number): Promise<StartSettings> {
  const [edition, ranges] = await Promise.all([editionForYear(year), loadBibRanges(year)]);
  return {
    year,
    editionId: edition?.id ?? null,
    raceDate: edition?.date ?? null,
    model: startModelFromEdition(edition),
    champions: {
      men: edition ? edition.championBibMen : 400,
      women: edition ? edition.championBibWomen : 950,
    },
    ranges: ranges.ranges,
    rangesStored: ranges.stored,
    categories: ranges.categories,
  };
}

function runnerSex(id: string): "M" | "F" {
  return id.charAt(4) < "5" ? "M" : "F";
}

/** Absolutní vítězové (nejrychlejší muž a žena) daného roku. */
export async function absoluteWinners(
  year: number,
): Promise<{ men: string | null; women: string | null }> {
  const rows = await prisma.result.findMany({
    where: { year, time: { gt: 0 } },
    select: { runnerId: true, time: true },
    orderBy: { time: "asc" },
  });
  const men = rows.find((row) => runnerSex(row.runnerId) === "M")?.runnerId ?? null;
  const women = rows.find((row) => runnerSex(row.runnerId) === "F")?.runnerId ?? null;
  return { men, women };
}

export type AdminStartRow = {
  runnerId: string;
  name: string;
  birthYear: string;
  clubName: string;
  categoryId: string;
  categoryName: string;
  registrationId: number;
  status: number | null;
  valid: boolean;
  cancelled: boolean;
  organizer: boolean;
  bib: number | null;
  locked: boolean;
  groupId: number | null;
  groupOrder: number;
  lastYearTime: number | null;
  personalBest: number | null;
  note: string | null;
  registrationNote: string | null;
};

export type StartGroupRow = {
  id: number;
  kind: StartGroupKind;
  note: string | null;
  memberIds: string[];
};

export async function loadAdminStartRows(year: number): Promise<AdminStartRow[]> {
  const [lines, validIds, metas] = await Promise.all([
    prisma.registrationLine.findMany({
      where: { year },
      include: {
        runner: { select: { name: true } },
        club: { select: { name: true } },
        category: { select: { name: true } },
        registration: { select: { status: true, note: true } },
      },
    }),
    validRegistrationIds(year),
    prisma.startLineMeta.findMany({ where: { year } }),
  ]);
  const runnerIds = lines.map((line) => line.runnerId);
  const [lastYear, best] = await Promise.all([
    prisma.result.findMany({
      where: { year: year - 1, runnerId: { in: runnerIds } },
      select: { runnerId: true, time: true },
    }),
    prisma.result.groupBy({
      by: ["runnerId"],
      where: { runnerId: { in: runnerIds } },
      _min: { time: true },
    }),
  ]);
  const lastById = new Map(lastYear.map((row) => [row.runnerId, row.time]));
  const bestById = new Map(best.map((row) => [row.runnerId, row._min.time ?? null]));
  const metaById = new Map(metas.map((meta) => [meta.runnerId, meta]));
  return lines.map((line) => {
    const meta = metaById.get(line.runnerId);
    return {
      runnerId: line.runnerId,
      name: line.runner.name,
      birthYear: line.runnerId.slice(0, 4),
      clubName: line.club.name,
      categoryId: line.categoryId,
      categoryName: line.category.name,
      registrationId: line.registrationId,
      status: line.registration.status,
      valid: validIds.has(line.registrationId),
      cancelled: line.registration.status === ENTRY_STATUS.cancelled,
      organizer: line.registrationId === ORGANIZER_REGISTRATION_ID,
      bib: line.bib && line.bib > 0 ? line.bib : null,
      locked: meta?.locked ?? false,
      groupId: meta?.groupId ?? null,
      groupOrder: meta?.groupOrder ?? 0,
      lastYearTime: lastById.get(line.runnerId) ?? null,
      personalBest: bestById.get(line.runnerId) ?? null,
      note: line.note,
      registrationNote: line.registration.note,
    };
  });
}

export async function loadStartGroups(year: number): Promise<StartGroupRow[]> {
  const groups = await prisma.startGroup.findMany({
    where: { year },
    include: { members: { orderBy: [{ groupOrder: "asc" }, { runnerId: "asc" }] } },
    orderBy: { id: "asc" },
  });
  return groups.map((group) => ({
    id: group.id,
    kind: group.kind,
    note: group.note,
    memberIds: group.members.map((member) => member.runnerId),
  }));
}

export async function buildGeneratorInput(
  year: number,
  settings: StartSettings,
  rows: AdminStartRow[],
  groups: StartGroupRow[],
): Promise<GeneratorInput> {
  const winners = await absoluteWinners(year - 1);
  const champions: GeneratorInput["champions"] = [];
  if (winners.men && settings.champions.men != null) {
    champions.push({ runnerId: winners.men, bib: settings.champions.men });
  }
  if (winners.women && settings.champions.women != null) {
    champions.push({ runnerId: winners.women, bib: settings.champions.women });
  }
  return {
    model: settings.model,
    ranges: settings.ranges,
    categorySort: Object.fromEntries(settings.categories.map((c) => [c.id, c.sort])),
    champions,
    groups: groups.map((group) => ({ id: group.id, kind: group.kind })),
    entries: rows.map((row) => ({
      runnerId: row.runnerId,
      name: row.name,
      categoryId: row.categoryId,
      currentBib: row.bib,
      locked: row.locked,
      eligible: row.valid,
      organizer: row.organizer,
      lastYearTime: row.lastYearTime,
      groupId: row.groupId,
      groupOrder: row.groupOrder,
    })),
  };
}

/** Otisk vstupu generátoru: uložení návrhu projde jen nad stejnými daty, jaká byla v náhledu. */
export function inputFingerprint(input: GeneratorInput): string {
  const entries = [...input.entries]
    .sort((a, b) => a.runnerId.localeCompare(b.runnerId))
    .map((e) => [
      e.runnerId,
      e.categoryId,
      e.currentBib,
      e.locked,
      e.eligible,
      e.organizer,
      e.lastYearTime,
      e.groupId,
      e.groupOrder,
    ]);
  const payload = JSON.stringify([
    input.model,
    input.ranges,
    input.champions,
    input.groups,
    entries,
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export type PublicStartRow = {
  bib: number;
  time: string;
  runnerId: string;
  name: string;
  birthYear: string;
  club: string;
  categoryId: string;
  categoryName: string;
};

/**
 * Veřejná startovka / tisk: po importu z prezentace (#119) `mcvv_start`, předtím řádky
 * přihlášek s číslem (nezrušené přihlášky). Řazeno podle startovního času, obě vlny prolnuté.
 */
export async function loadPublicStartList(
  year: number,
  model: StartModel,
): Promise<{ rows: PublicStartRow[]; source: "start" | "registrations" }> {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const imported = await prisma.startEntry.findMany({
    where: { year, bib: { gt: 0 } },
    include: { runner: { select: { name: true } }, club: { select: { name: true } } },
  });
  let rows: PublicStartRow[];
  let source: "start" | "registrations";
  if (imported.length > 0) {
    source = "start";
    rows = imported.map((row) => ({
      bib: row.bib,
      time: startTimeForBib(model, row.bib),
      runnerId: row.runnerId,
      name: row.runnerName || row.runner.name,
      birthYear: row.runnerId.slice(0, 4),
      club: row.clubName || row.club.name,
      categoryId: row.categoryId,
      categoryName: categoryName.get(row.categoryId) ?? row.categoryId,
    }));
  } else {
    source = "registrations";
    const lines = await prisma.registrationLine.findMany({
      where: {
        year,
        bib: { gt: 0 },
        registration: { OR: [{ status: { not: ENTRY_STATUS.cancelled } }, { status: null }] },
      },
      include: { runner: { select: { name: true } }, club: { select: { name: true } } },
    });
    rows = lines.map((line) => ({
      bib: line.bib!,
      time: startTimeForBib(model, line.bib),
      runnerId: line.runnerId,
      name: line.runner.name,
      birthYear: line.runnerId.slice(0, 4),
      club: line.club.name,
      categoryId: line.categoryId,
      categoryName: categoryName.get(line.categoryId) ?? line.categoryId,
    }));
  }
  rows.sort((a, b) => compareByStart(model, a.bib, b.bib));
  return { rows, source };
}
