import { prisma } from "@/lib/db/client";
import { loadRoster } from "@/lib/race/roster";

import { getRaceContext, getPublicStations, type RaceContext } from "./race-context";
import { getRecordBaselines } from "./records-live";
import { liveRecordMarks, type TrMark } from "./records-live-core";
import { createBodyCache } from "./speaker-cache";
import {
  MAX_PUBLIC_POINTS,
  type SpeakerCategory,
  type SpeakerRunner,
  type SpeakerSnapshot,
} from "./speaker-core";
import { startInstant } from "./start-time";
import { FINISH_SPLIT, type Station } from "./stations";
import { getActiveTestRun } from "./test-run";
import { clubDictionary } from "./online-results-core";

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
    getPublicStations(),
    getActiveTestRun(now),
  ]);
  const { categories, runners, tr, clubs: clubOf, pts, pp } = await loadRaceRunners(ctx, stations);
  const { clubs, indexOf } = clubDictionary(runners.map((r) => clubOf.get(r.bib)));
  return {
    year: ctx.year,
    test: testRun !== null,
    categories: categories.map((c) => ({ id: c.id, name: c.name, sex: c.sex })),
    runners: runners.map((r) => ({ ...r, club: indexOf(clubOf.get(r.bib)) })),
    clubs,
    tr,
    pts,
    pp,
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
  /** Popisky veřejných mezičasů M1–M3 (#316). */
  pts: string[];
  /** Jejich pozice ve stovkách metrů. */
  pp: (number | null)[];
}> {
  const [categories, starts, splits, baselines] = await Promise.all([
    prisma.category.findMany({
      orderBy: { sort: "asc" },
      select: { id: true, name: true, sex: true, age: true },
    }),
    loadRoster(ctx.year),
    prisma.split.findMany({
      where: { year: ctx.year },
      select: { bib: true, split: true, time: true, created: true },
    }),
    getRecordBaselines(ctx.year),
  ]);
  // M1 / M2 / M3 = veřejné mezičasy podle pozice na trati (#316; výchozí 1 = 1,3 km,
  // 3 = 2,7 km), Cíl = 9. Volající předává už vybrané veřejné mezičasy (`getPublicStations`).
  const publicPoints = stations.slice(0, MAX_PUBLIC_POINTS);
  const keyOf = new Map<string, "m1" | "m2" | "m3" | "fin">(
    publicPoints.map((s, i) => [s.code, (["m1", "m2", "m3"] as const)[i]]),
  );
  keyOf.set(FINISH_SPLIT, "fin");
  const hasM3 = publicPoints.length >= 3;
  type Times = { m1: number | null; m2: number | null; m3?: number | null; fin: number | null };
  const empty = (): Times =>
    hasM3 ? { m1: null, m2: null, m3: null, fin: null } : { m1: null, m2: null, fin: null };
  const times = new Map<number, Times>();
  for (const s of splits) {
    const key = keyOf.get(s.split) ?? null;
    if (!key || s.time < 0 || skipSplit?.(s.created)) continue;
    const row = times.get(s.bib) ?? empty();
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
    name: s.runnerName.trim(),
    cat: s.categoryId,
    start: Math.round(
      startInstant(
        ctx.zero,
        s.bib,
        ctx.intervalS,
        ctx.secondStartFrom,
        ctx.organizerShiftSeconds,
      ).getTime() / 1000,
    ),
    ...(times.get(s.bib) ?? empty()),
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
    ...(hasM3 ? { m3: r.m3 ?? null } : {}),
    fin: r.fin,
  }));
  const clubs = new Map(
    [...byBib.values()].map((s) => [s.bib, { id: s.clubId, name: s.clubName }]),
  );
  return {
    categories,
    runners,
    tr,
    clubs,
    pts: publicPoints.map((s) => s.label),
    pp: publicPoints.map((s) => s.position ?? null),
  };
}

/** Sdílená cache snímku na replice (viz `createBodyCache`). */
export const speakerCache = createBodyCache(() => loadSpeakerSnapshot(), SPEAKER_CACHE_MS);
