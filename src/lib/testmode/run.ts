import { writeAudit, type AuditActor } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { eligibleCategoriesFor } from "@/lib/entries/category";
import { currentRaceYear } from "@/lib/entries/year";
import { getRaceContext, getStations, type RaceContext } from "@/lib/live/race-context";
import { FINISH_SPLIT } from "@/lib/live/stations";
import { peekStoredTestRun } from "@/lib/live/test-run";
import {
  buildGeneratorInput,
  loadAdminStartRows,
  loadStartSettings,
} from "@/lib/race/startlist-load";
import { getSiteSettings } from "@/lib/settings/site";
import { startlistDrawConfirmed } from "@/lib/settings/site-core";

import { consistencyChecks, type CheckReport } from "./checks-core";
import { loadTestModeConfig } from "./config";
import {
  dueAutoStart,
  isShadowYear,
  planTestRun,
  serializeTestModeConfig,
  testPhase,
  TEST_SHADOW_YEAR,
  type TestPhase,
} from "./config-core";
import { enterTestContext, runInTestContext } from "./context";
import { applyTestRunToRaceContext } from "./live-context";
import { nextFreeTestBib, type TestOnsiteInput } from "./onsite-core";
import { buildTestRoster } from "./roster-core";

/**
 * Testovací režim B+ – běh testu: start (losování / kopie do `mcvv_test_start`), fáze,
 * konec s reportem (T+3h), likvidace (T+5h) a plánovač. Živé moduly dostanou stínový ročník
 * přes `getLiveRaceContext()`; zápisová brána a blok pošty hlídají testovací kontext.
 */

export const SYSTEM_TEST_ACTOR: AuditActor = { id: null, email: "system", role: "admin" };
const ACTIVE = ["running", "ended"];

export type ActiveTestModeRun = {
  id: number;
  status: string;
  startedAt: Date | null;
  zeroAt: Date;
  endAt: Date;
  cleanupAt: Date;
  roster: string;
};

export async function getActiveTestModeRun(): Promise<ActiveTestModeRun | null> {
  return prisma.testModeRun.findFirst({
    where: { status: { in: ACTIVE } },
    orderBy: { id: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      zeroAt: true,
      endAt: true,
      cleanupAt: true,
      roster: true,
    },
  });
}

/**
 * Kontext závodu pro interní routy dne závodu (startér, Start, mezičasy, cíl). Když běží test,
 * vrátí stínový ročník a nulu testu (zápisy pak jdou do 9026; volající zapne bránu přes
 * `enterLiveTestContext`). Veřejné výstupy dál volají `getRaceContext()` – test neuvidí.
 */
export async function getLiveRaceContext(now = new Date()): Promise<RaceContext> {
  const [base, run] = await Promise.all([getRaceContext(), getActiveTestModeRun()]);
  if (!run) return base;
  return applyTestRunToRaceContext(base, run, testPhase(run, now));
}

/**
 * Přepne zbytek volajícího požadavku do testovacího kontextu, když `ctx` patří testu. Volat
 * synchronně hned po `getLiveRaceContext()` ve stejné funkci, která pak zapisuje (route
 * handler, server action) – `enterWith` platí pro zbytek té funkce, ne pro volajícího výš.
 */
export function enterLiveTestContext(ctx: RaceContext): void {
  if (ctx.testRunId == null) return;
  enterTestContext({ runId: ctx.testRunId, year: ctx.year, readOnly: ctx.testReadOnly ?? false });
}

/* ---------- start ---------- */

export type StartTestError = "blocked" | "active" | "legacy_active" | "empty" | "blocking";

export async function startTestModeRun(
  actor: AuditActor,
  options: { now?: Date; at?: Date; createdBy: string; source: "manual" | "auto" },
): Promise<{ ok: true; runId: number } | { ok: false; error: StartTestError }> {
  const now = options.now ?? new Date();
  const at = options.at ?? now;
  const [current, config, site, legacy] = await Promise.all([
    currentRaceYear(),
    loadTestModeConfig(),
    getSiteSettings(),
    peekStoredTestRun(now),
  ]);
  const raceDate = current.raceDate ?? new Date(Date.UTC(current.year, 11, 31));
  if (legacy.run) return { ok: false, error: "legacy_active" };
  const plan = planTestRun({
    at,
    raceDate,
    config,
    liveStartListDrawn: startlistDrawConfirmed(site, current.year),
  });
  if (plan.blocked) return { ok: false, error: "blocked" };
  // Jen čtení ostrých dat: přihlášky, rozsahy čísel, obhájci.
  const [settings, rows] = await Promise.all([
    loadStartSettings(current.year),
    loadAdminStartRows(current.year),
  ]);
  const base = await buildGeneratorInput(current.year, settings, rows);
  const roster = buildTestRoster({
    base,
    clubOf: new Map(rows.map((row) => [row.runnerId, row.clubName || null])),
    fictional: config.fictionalRunners,
    source: plan.roster,
  });
  if (!roster.ok) return { ok: false, error: roster.error };

  return prisma.$transaction(async (tx) => {
    // Souběh (2 repliky, tick + tlačítko): zamykací čtení aktivních testů; druhý čeká / deadlock.
    const active = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM mcvv_test_run WHERE stav IN ('running', 'ended') FOR UPDATE`;
    if (active.length > 0) return { ok: false as const, error: "active" as const };
    // Zápisy testu už v testovacím kontextu: brána pustí jen mcvv_test_* a audit.
    return runInTestContext({ runId: 0, year: TEST_SHADOW_YEAR, readOnly: false }, async () => {
      const run = await tx.testModeRun.create({
        data: {
          status: "running",
          year: TEST_SHADOW_YEAR,
          zeroAt: plan.zero,
          endAt: plan.endAt,
          cleanupAt: plan.cleanupAt,
          roster: roster.source,
          fictional: roster.rows.filter((row) => row.fictional).length,
          config: serializeTestModeConfig(config),
          createdBy: options.createdBy.slice(0, 80),
          startedAt: now,
          starts: {
            create: roster.rows.map((row) => ({
              bib: row.bib,
              name: row.name.slice(0, 80),
              categoryId: row.categoryId,
              club: row.club?.slice(0, 80) ?? null,
              fictional: row.fictional,
            })),
          },
        },
        select: { id: true },
      });
      await writeAudit(
        {
          actor,
          action: "raceday.testmode_started",
          target: `testrun:${run.id}`,
          detail: {
            source: options.source,
            roster: roster.source,
            runners: roster.rows.length,
            zero: plan.zero.toISOString(),
            endAt: plan.endAt.toISOString(),
            cleanupAt: plan.cleanupAt.toISOString(),
          },
        },
        tx,
      );
      return { ok: true as const, runId: run.id };
    });
  });
}

/* ---------- konec a report ---------- */

export type TestReport = CheckReport & {
  onsite: number;
  splits: number;
  punches: number;
  finishBibs: number;
  generatedAt: string;
};

/** Report z dat stínového ročníku (jen čtení). */
export async function buildTestReport(runId: number, ended: boolean): Promise<TestReport> {
  const year = TEST_SHADOW_YEAR;
  const [starts, onsite, startChecks, splits, stations, punches, finishBibs] = await Promise.all([
    prisma.testModeStart.findMany({ where: { testRunId: runId }, select: { bib: true } }),
    prisma.testModeOnsite.count({ where: { testRunId: runId } }),
    prisma.startCheck.findMany({ where: { year }, select: { bib: true } }),
    prisma.split.findMany({ where: { year }, select: { bib: true, split: true, time: true } }),
    getStations(),
    prisma.finishPunch.count({ where: { year, deleted: false } }),
    prisma.finishBib.count({ where: { year, deleted: false } }),
  ]);
  const order = [...stations]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((station) => station.code);
  const checks = consistencyChecks({
    rosterBibs: starts.map((row) => row.bib),
    startedBibs: [...new Set(startChecks.map((row) => row.bib))],
    splits,
    order,
    finish: FINISH_SPLIT,
    ended,
  });
  return {
    ...checks,
    onsite,
    splits: splits.length,
    punches,
    finishBibs,
    generatedAt: new Date().toISOString(),
  };
}

export async function endTestModeRun(
  runId: number,
  actor: AuditActor,
  now = new Date(),
): Promise<boolean> {
  const report = await buildTestReport(runId, true);
  const updated = await prisma.testModeRun.updateMany({
    where: { id: runId, status: "running" },
    data: { status: "ended", endedAt: now, report: JSON.stringify(report) },
  });
  if (updated.count === 0) return false;
  await writeAudit({
    actor,
    action: "raceday.testmode_ended",
    target: `testrun:${runId}`,
    detail: { ok: report.ok, issues: report.issues.length, finished: report.finished },
  });
  return true;
}

/* ---------- likvidace ---------- */

/**
 * Likvidace (T+5h): smaže jen stínový ročník (živé tabulky s rokem 9026) a testovací startovku
 * a dohlášky běhu. Běh s reportem zůstává v historii. Ostrý ročník se nikdy nemaže.
 */
export async function cleanupTestModeRun(
  runId: number,
  actor: AuditActor,
  now = new Date(),
): Promise<boolean> {
  const year = TEST_SHADOW_YEAR;
  if (!isShadowYear(year)) throw new Error("shadow year guard");
  const run = await prisma.testModeRun.findUnique({ where: { id: runId } });
  if (!run || run.status === "cleaned") return false;
  if (run.status === "running") await endTestModeRun(runId, actor, now);
  const counts = await prisma.$transaction(async (tx) => {
    const where = { year };
    const result = {
      splits: (await tx.split.deleteMany({ where })).count,
      splitEntries: (await tx.splitEntry.deleteMany({ where })).count,
      starts: (await tx.startCheck.deleteMany({ where })).count,
      startEntries: (await tx.startCheckEntry.deleteMany({ where })).count,
      punches: (await tx.finishPunch.deleteMany({ where })).count,
      finishBibs: (await tx.finishBib.deleteMany({ where })).count,
      roster: (await tx.testModeStart.deleteMany({ where: { testRunId: runId } })).count,
      onsite: (await tx.testModeOnsite.deleteMany({ where: { testRunId: runId } })).count,
    };
    await tx.testModeRun.update({
      where: { id: runId },
      data: { status: "cleaned", cleanedAt: now },
    });
    await writeAudit(
      { actor, action: "raceday.testmode_cleaned", target: `testrun:${runId}`, detail: result },
      tx,
    );
    return result;
  });
  return counts !== null;
}

/* ---------- plánovač ---------- */

/**
 * Plánovač (interní tick ~30 s): posune fáze aktivního testu (konec v T+3h, likvidace v T+5h)
 * a podle nastavení spustí nový test. Idempotentní – dohnání po výpadku funguje.
 */
export async function runTestModeScheduler(
  now = new Date(),
): Promise<TestPhase | "started" | null> {
  const run = await getActiveTestModeRun();
  if (run) {
    const phase = testPhase(run, now);
    if (phase === "cleanup") {
      await cleanupTestModeRun(run.id, SYSTEM_TEST_ACTOR, now);
      return "cleanup";
    }
    if (phase === "ended" && run.status === "running") {
      await endTestModeRun(run.id, SYSTEM_TEST_ACTOR, now);
      return "ended";
    }
    return phase;
  }
  const [config, current, last] = await Promise.all([
    loadTestModeConfig(),
    currentRaceYear(),
    prisma.testModeRun.findFirst({ orderBy: { id: "desc" }, select: { startedAt: true } }),
  ]);
  if (!current.raceDate) return null;
  const at = dueAutoStart({
    now,
    config,
    raceDate: current.raceDate,
    activeRun: false,
    lastStartedAt: last?.startedAt ?? null,
  });
  if (!at) return null;
  const result = await startTestModeRun(SYSTEM_TEST_ACTOR, {
    now,
    at,
    createdBy: "plánovač",
    source: "auto",
  });
  if (!result.ok) console.warn("[testmode] auto start skipped", result.error);
  return result.ok ? "started" : null;
}

/* ---------- testovací dohláška ---------- */

export type TestOnsiteError = "no_test" | "closed" | "category" | "bib_taken" | "no_bib";

/**
 * Testovací dohláška v pokladně: zapíše jen `mcvv_test_onsite` a doplní `mcvv_test_start`
 * (v testovacím kontextu, takže brána nepustí nic jiného). Platba je jen simulovaná.
 */
export async function createTestOnsite(
  createdBy: string,
  input: TestOnsiteInput,
  now = new Date(),
): Promise<{ ok: true; bib: number; runId: number } | { ok: false; error: TestOnsiteError }> {
  const run = await getActiveTestModeRun();
  if (!run) return { ok: false, error: "no_test" };
  const phase = testPhase(run, now);
  if (run.status !== "running" || phase === "ended" || phase === "cleanup") {
    return { ok: false, error: "closed" };
  }
  const current = await currentRaceYear();
  const categories = await prisma.category.findMany();
  const category = eligibleCategoriesFor(input.birthYear, input.sex, current.year, categories).find(
    (row) => row.id === input.categoryId,
  );
  if (!category) return { ok: false, error: "category" };
  const settings = await loadStartSettings(current.year);
  return runInTestContext({ runId: run.id, year: TEST_SHADOW_YEAR, readOnly: false }, () =>
    prisma.$transaction(async (tx) => {
      // Zamykací čtení startovky běhu: souběžné testovací dohlášky nedostanou stejné číslo.
      const taken = await tx.$queryRaw<{ cislo: number }[]>`
        SELECT cislo FROM mcvv_test_start WHERE test_run_id = ${run.id} FOR UPDATE`;
      const used = new Set(taken.map((row) => Number(row.cislo)));
      const bib =
        input.bib ??
        nextFreeTestBib({
          model: settings.model,
          categoryId: category.id,
          ranges: settings.ranges,
          taken: used,
          champions: [settings.champions.men, settings.champions.women],
        });
      if (bib == null) return { ok: false as const, error: "no_bib" as const };
      if (used.has(bib)) return { ok: false as const, error: "bib_taken" as const };
      const name = `${input.lastName} ${input.firstName}`.slice(0, 80);
      await tx.testModeOnsite.create({
        data: {
          testRunId: run.id,
          bib,
          name,
          birthYear: input.birthYear,
          sex: input.sex,
          categoryId: category.id,
          club: input.clubName || null,
          payment: input.payment,
          createdBy: createdBy.slice(0, 80),
        },
      });
      await tx.testModeStart.create({
        data: {
          testRunId: run.id,
          bib,
          name,
          categoryId: category.id,
          club: input.clubName || null,
          fictional: false,
        },
      });
      return { ok: true as const, bib, runId: run.id };
    }),
  );
}
