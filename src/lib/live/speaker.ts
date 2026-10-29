import { prisma } from "@/lib/db/client";

import { getRaceContext, getStations, type RaceContext } from "./race-context";
import { getRecordBaselines } from "./records-live";
import { liveRecordMarks, type TrMark } from "./records-live-core";
import { createBodyCache } from "./speaker-cache";
import type { SpeakerCategory, SpeakerRunner, SpeakerSnapshot } from "./speaker-core";
import { startInstant } from "./start-time";
import { FINISH_SPLIT, type Station } from "./stations";
import { getActiveTestRun } from "./test-run";

/** Jak dlouho sdílí všechny obrazovky jeden snímek z DB (polling klienta je 5 s). */
export const SPEAKER_CACHE_MS = 3000;

/**
 * Snímek pro obrazovku speakera (#188): kategorie v pořadí webu, startovka ročníku
 * s plánovaným startem každého čísla (stejné pravidlo a nula jako výpočet mezičasů, tedy
 * i zkušební nula testu #186) a zapsané časy M1 / M2 / Cíl. Nic, co závisí na „teď“.
 */
export async function loadSpeakerSnapshot(now = new Date()): Promise<SpeakerSnapshot> {
  const [ctx, stations, testRun] = await Promise.all([
    getRaceContext(),
    getStations(),
    getActiveTestRun(now),
  ]);
  const { categories, runners, tr } = await loadRaceRunners(ctx, stations);
  return {
    year: ctx.year,
    test: testRun !== null,
    categories: categories.map((c) => ({ id: c.id, name: c.name, sex: c.sex })),
    runners,
    tr,
  };
}

/**
 * Kategorie (pořadí webu) a startovka ročníku s plánovaným startem a časy M1 / M2 / Cíl –
 * společný základ speakera (#188) a veřejných online výsledků. Jen čtení.
 */
export async function loadRaceRunners(
  ctx: RaceContext,
  stations: readonly Station[],
  /** Vynechat mezičas podle okamžiku zápisu (veřejné výsledky skrývají test #186). */
  skipSplit?: (created: Date | null) => boolean,
): Promise<{
  categories: (SpeakerCategory & { age: number })[];
  runners: SpeakerRunner[];
  /** Nový / vyrovnaný traťový rekord (jen cíl). */
  tr: TrMark[];
  /** Klub podle čísla ze startovky (id + název ročníku) – jen pro online výsledky, ne speaker. */
  clubs: Map<number, { id: string; name: string | null }>;
}> {
  const [categories, starts, splits, baselines] = await Promise.all([
    prisma.category.findMany({
      orderBy: { sort: "asc" },
      select: { id: true, name: true, sex: true, age: true },
    }),
    prisma.startEntry.findMany({
      where: { year: ctx.year, bib: { gt: 0 } },
      select: {
        bib: true,
        runnerId: true,
        runnerName: true,
        clubId: true,
        clubName: true,
        categoryId: true,
        runner: { select: { name: true } },
      },
    }),
    prisma.split.findMany({
      where: { year: ctx.year },
      select: { bib: true, split: true, time: true, created: true },
    }),
    getRecordBaselines(ctx.year),
  ]);
  // M1 / M2 = první dvě stanoviště z nastavení (výchozí 1 = 1,3 km, 3 = 2,7 km), Cíl = 9.
  const m1 = stations[0]?.code ?? "1";
  const m2 = stations[1]?.code ?? "3";
  const times = new Map<number, { m1: number | null; m2: number | null; fin: number | null }>();
  for (const s of splits) {
    const key =
      s.split === m1 ? "m1" : s.split === m2 ? "m2" : s.split === FINISH_SPLIT ? "fin" : null;
    if (!key || s.time < 0 || skipSplit?.(s.created)) continue;
    const row = times.get(s.bib) ?? { m1: null, m2: null, fin: null };
    row[key] = s.time;
    times.set(s.bib, row);
  }
  const known = new Set(categories.map((c) => c.id));
  // jedno číslo = jeden řádek (duplicitní číslo ve startovce hlásí den závodu zvlášť)
  const byBib = new Map<number, (typeof starts)[number]>();
  for (const s of [...starts].sort((a, b) => a.bib - b.bib)) {
    if (known.has(s.categoryId) && !byBib.has(s.bib)) byBib.set(s.bib, s);
  }
  const withIds = [...byBib.values()].map((s) => ({
    bib: s.bib,
    name: (s.runnerName || s.runner.name).trim(),
    cat: s.categoryId,
    start: Math.round(startInstant(ctx.zero, s.bib, ctx.intervalS).getTime() / 1000),
    ...(times.get(s.bib) ?? { m1: null, m2: null, fin: null }),
    runnerId: s.runnerId,
  }));
  const tr = liveRecordMarks(withIds, categories, baselines, ctx.year);
  // ID běžce (ročník narození, pohlaví) klientovi neposíláme
  const runners: SpeakerRunner[] = withIds.map((r) => ({
    bib: r.bib,
    name: r.name,
    cat: r.cat,
    start: r.start,
    m1: r.m1,
    m2: r.m2,
    fin: r.fin,
  }));
  const clubs = new Map(
    [...byBib.values()].map((s) => [s.bib, { id: s.clubId, name: s.clubName }]),
  );
  return { categories, runners, tr, clubs };
}

/** Sdílená cache snímku na replice (viz `createBodyCache`). */
export const speakerCache = createBodyCache(() => loadSpeakerSnapshot(), SPEAKER_CACHE_MS);
