import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { ENTRY_STATUS, validRegistrationIds } from "@/lib/entries/status";

import { loadRoster } from "./roster";
import type { SpecialStartSpec } from "./special-start";
import type { BibRange, ChampionBibs } from "./start-settings";
import {
  compareByStart,
  DEFAULT_CHAMPION_BIBS,
  startModelFromEdition,
  startTimeForBib,
  type StartModel,
} from "./start-time";
import { inputFingerprint } from "./startlist-fingerprint";
import type { GeneratorInput } from "./startlist-generator";
import { deriveOrganizerTieSeed, organizerSetKey } from "./startlist-organizer-order";
import { seedTimesByRunner, seedTimeWindow } from "./startlist-seed-time";

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

/** Rok posledního ročníku (= `currentRaceYear`, stejné pravidlo jako veřejný web a tisk). */
export async function latestEditionYear(): Promise<number> {
  return (await currentRaceYear()).year;
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
      men: edition ? edition.championBibMen : DEFAULT_CHAMPION_BIBS.men,
      women: edition ? edition.championBibWomen : DEFAULT_CHAMPION_BIBS.women,
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
  /** Club id (#196: link to the club profile). */
  clubId: string;
  categoryId: string;
  categoryName: string;
  registrationId: number;
  status: number | null;
  valid: boolean;
  cancelled: boolean;
  bib: number | null;
  locked: boolean;
  /** Poslední platný čas z Y−1…Y−3 (nasazení); null = v okně žádný. */
  lastYearTime: number | null;
  /** Počet odběhlých ročníků (mcvv_time s time > 0), #382. */
  editionsCount: number;
  personalBest: number | null;
  note: string | null;
  registrationNote: string | null;
  /** Spec. start z administrace přihlášek. */
  special: SpecialStartRow | null;
  /** Vlákno zpráv přihlášky, když v něm přihlašující něco napsal („má zprávu“). */
  messageThreadId: number | null;
};

export type SpecialStartRow = SpecialStartSpec & { note: string | null; updatedAt: Date };

/** Spec. starty ročníku podle běžce. */
export async function loadSpecialStarts(year: number): Promise<Map<string, SpecialStartRow>> {
  const rows = await prisma.specialStart.findMany({ where: { year } });
  return new Map(
    rows.map((row) => [
      row.runnerId,
      {
        kind: row.kind,
        partnerId: row.kind === "with" ? row.partnerId : null,
        offsetSeconds: row.kind === "with" ? row.offsetSeconds : 0,
        note: row.note,
        updatedAt: row.updatedAt,
      },
    ]),
  );
}

/**
 * Přihlášky ročníku, kde přihlašující napsal zprávu (Q216: jen indikátor, spec. start se
 * nenastavuje automaticky). Vrací id vlákna podle čísla přihlášky.
 */
export async function registrationMessageThreads(year: number): Promise<Map<number, number>> {
  const threads = await prisma.messageThread.findMany({
    where: { year, registrationId: { not: null }, lastUserMessageAt: { not: null } },
    select: { id: true, registrationId: true },
  });
  return new Map(threads.map((thread) => [thread.registrationId!, thread.id]));
}

export async function loadAdminStartRows(year: number): Promise<AdminStartRow[]> {
  const [lines, validIds, metas, specials, threads] = await Promise.all([
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
    loadSpecialStarts(year),
    registrationMessageThreads(year),
  ]);
  const runnerIds = lines.map((line) => line.runnerId);
  const window = seedTimeWindow(year);
  const [history, best, starts] = await Promise.all([
    prisma.result.findMany({
      where: {
        year: { gte: window.from, lte: window.to },
        runnerId: { in: runnerIds },
        time: { gt: 0 },
      },
      select: { runnerId: true, year: true, time: true },
    }),
    prisma.result.groupBy({
      by: ["runnerId"],
      where: { runnerId: { in: runnerIds } },
      _min: { time: true },
    }),
    prisma.result.groupBy({
      by: ["runnerId"],
      where: { runnerId: { in: runnerIds }, time: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);
  const lastById = seedTimesByRunner(history, year);
  const bestById = new Map(best.map((row) => [row.runnerId, row._min.time ?? null]));
  const startsById = new Map(starts.map((row) => [row.runnerId, row._count._all]));
  const metaById = new Map(metas.map((meta) => [meta.runnerId, meta]));
  return lines.map((line) => {
    const meta = metaById.get(line.runnerId);
    return {
      runnerId: line.runnerId,
      name: line.runner.name,
      birthYear: line.runnerId.slice(0, 4),
      clubName: line.club.name,
      clubId: line.clubId,
      categoryId: line.categoryId,
      categoryName: line.category.name,
      registrationId: line.registrationId,
      status: line.registration.status,
      valid: validIds.has(line.registrationId),
      cancelled: line.registration.status === ENTRY_STATUS.cancelled,
      bib: line.bib && line.bib > 0 ? line.bib : null,
      locked: meta?.locked ?? false,
      lastYearTime: lastById.get(line.runnerId) ?? null,
      editionsCount: startsById.get(line.runnerId) ?? 0,
      personalBest: bestById.get(line.runnerId) ?? null,
      note: line.note,
      registrationNote: line.registration.note,
      special: specials.get(line.runnerId) ?? null,
      messageThreadId: threads.get(line.registrationId) ?? null,
    };
  });
}

export async function buildGeneratorInput(
  year: number,
  settings: StartSettings,
  rows: AdminStartRow[],
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
    entries: rows.map((row) => ({
      runnerId: row.runnerId,
      name: row.name,
      categoryId: row.categoryId,
      currentBib: row.bib,
      locked: row.locked,
      eligible: row.valid,
      lastYearTime: row.lastYearTime,
      editionsCount: row.editionsCount,
      special: row.special
        ? {
            kind: row.special.kind,
            partnerId: row.special.partnerId,
            offsetSeconds: row.special.offsetSeconds,
          }
        : null,
    })),
    organizerTieSeed: deriveOrganizerTieSeed(
      organizerSetKey(
        rows.map((row) => ({
          runnerId: row.runnerId,
          eligible: row.valid,
          special: row.special,
        })),
      ),
    ),
  };
}

export { inputFingerprint };

export type PublicStartRow = {
  bib: number;
  time: string;
  runnerId: string;
  name: string;
  birthYear: string;
  club: string;
  /** Club id (#196: link to the club profile); "" = no club. */
  clubId: string;
  categoryId: string;
  categoryName: string;
};

/**
 * Veřejná startovka / tisk / PDF: startovka ročníku (`loadRoster` – jen zaplacené přihlášky
 * s číslem). Řazeno podle startovního času, obě vlny prolnuté.
 */
export async function loadPublicStartList(
  year: number,
  model: StartModel,
): Promise<{ rows: PublicStartRow[] }> {
  const [categories, roster] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    loadRoster(year),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const rows: PublicStartRow[] = roster.map((entry) => ({
    bib: entry.bib,
    time: startTimeForBib(model, entry.bib),
    runnerId: entry.runnerId,
    name: entry.runnerName,
    birthYear: entry.runnerId.slice(0, 4),
    club: entry.clubName,
    clubId: entry.clubId,
    categoryId: entry.categoryId,
    categoryName: categoryName.get(entry.categoryId) ?? entry.categoryId,
  }));
  rows.sort((a, b) => compareByStart(model, a.bib, b.bib));
  return { rows };
}
