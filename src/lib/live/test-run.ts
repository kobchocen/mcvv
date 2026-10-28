import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { writeAudit, type AuditActor } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { OFEED_STATE } from "@/lib/ofeed/settings";

import { snapshotRows } from "./clear-core";
import { LIVE_ZERO_OVERRIDE_KEY } from "./race-context";
import { snapshotStarts } from "./start-check-core";
import {
  parseTestRun,
  raceDayCutoff,
  serializeTestRun,
  testCutoff,
  TEST_RUN_KEY,
  testDataWindow,
  testRunBlocked,
  testRunExpired,
  testRunExpiry,
  type TestRun,
} from "./test-run-core";

export * from "./test-run-core";

type Tx = Prisma.TransactionClient;

/** Automatické ukončení (vypršení, den závodu) nemá přihlášeného autora. */
export const SYSTEM_ACTOR: AuditActor = { id: null, email: "system", role: "admin" };

export type TestEndReason = "manual" | "expired" | "raceDay";

export type TestCleanup = {
  splits: number;
  splitEntries: number;
  starts: number;
  startEntries: number;
  tokensRevoked: number;
  zeroCleared: boolean;
};

async function readStored(db: Tx | typeof prisma = prisma): Promise<TestRun | null> {
  const row = await db.setting.findUnique({ where: { key: TEST_RUN_KEY }, select: { text: true } });
  return parseTestRun(row?.text);
}

async function cutoffFor(now: Date): Promise<{ year: number; cutoff: Date }> {
  const current = await currentRaceYear();
  return { year: current.year, cutoff: testCutoff(current.raceDate, current.year, now) };
}

/** Hranice testu (den závodu 00:00) pro stránky a server actions. */
export async function getTestCutoff(now = new Date()): Promise<Date> {
  return (await cutoffFor(now)).cutoff;
}

/**
 * Aktivní testovací běh, nebo null. Vypršelý test (3 h, den závodu) se tady rovnou ukončí
 * a uklidí (Q71) – kdokoli stránku otevře, uvidí už čistý stav.
 */
export async function getActiveTestRun(now = new Date()): Promise<TestRun | null> {
  const run = await readStored();
  if (!run) return null;
  const { cutoff } = await cutoffFor(now);
  if (testRunExpired(run, now) || testRunBlocked(now, cutoff)) {
    await endTestRun(testRunBlocked(now, cutoff) ? "raceDay" : "expired", SYSTEM_ACTOR, now);
    return null;
  }
  return run;
}

/** Tick plánovače (OFeed, ~30 s): ukončí vypršelý test i bez návštěvy stránky. */
export async function expireTestRunIfDue(now = new Date()): Promise<void> {
  await getActiveTestRun(now);
}

/**
 * Spustí test: uloží stav, nastaví zkušební nulu a smaže otisk posledního uploadu do OFeed
 * (první běh pošle čistá data do testovací akce). Kontroly dělá volající (validateTestStart).
 */
export async function startTestRun(
  zero: Date,
  actor: AuditActor,
  now = new Date(),
): Promise<TestRun> {
  const { year, cutoff } = await cutoffFor(now);
  const run: TestRun = {
    id: randomBytes(5).toString("hex"),
    startedAt: now,
    zero,
    expiresAt: testRunExpiry(now, zero, cutoff),
    startedBy: actor.id,
    tokenIds: [],
  };
  await prisma.$transaction(async (tx) => {
    const text = serializeTestRun(run);
    await tx.setting.upsert({
      where: { key: TEST_RUN_KEY },
      update: { text },
      create: { key: TEST_RUN_KEY, text },
    });
    const zeroText = zero.toISOString();
    await tx.setting.upsert({
      where: { key: LIVE_ZERO_OVERRIDE_KEY },
      update: { text: zeroText },
      create: { key: LIVE_ZERO_OVERRIDE_KEY, text: zeroText },
    });
    await tx.jobState.deleteMany({ where: { name: OFEED_STATE.lastHash } });
    await writeAudit(
      {
        actor,
        action: "raceday.test_started",
        target: `year:${year}`,
        detail: {
          id: run.id,
          zero: zeroText,
          expiresAt: run.expiresAt.toISOString(),
        },
      },
      tx,
    );
  });
  return run;
}

/** Klíč zařízení vytvořený během testu je testovací – při úklidu se zneplatní. */
export async function registerTestToken(tokenId: number): Promise<boolean> {
  const run = await getActiveTestRun();
  if (!run) return false;
  const text = serializeTestRun({ ...run, tokenIds: [...run.tokenIds, tokenId] });
  await prisma.setting.update({ where: { key: TEST_RUN_KEY }, data: { text } });
  return true;
}

/**
 * Ukončí test a automaticky uklidí (Q71): testovací mezičasy a deník, evidenci startu,
 * zkušební nulu a testovací klíče zařízení. Maže jen záznamy vzniklé během testu (okno od
 * spuštění do konce, nikdy přes den závodu 00:00), takže ostrá data zůstanou. Audit se
 * snímkem smazaných řádků. Bez aktivního testu nic nedělá (vrací null).
 */
export async function endTestRun(
  reason: TestEndReason,
  actor: AuditActor,
  now = new Date(),
): Promise<TestCleanup | null> {
  const { year, cutoff } = await cutoffFor(now);
  return prisma.$transaction(
    async (tx) => {
      const run = await readStored(tx);
      // Souběh (dvě repliky / dvě záložky): uklízí jen ten, kdo stav opravdu smazal.
      const removedState = await tx.setting.deleteMany({ where: { key: TEST_RUN_KEY } });
      if (!run || removedState.count === 0) return null;
      const window = testDataWindow(run, now, cutoff);
      const range = { gte: window.from, lte: window.until };

      const splitRows = await tx.split.findMany({
        where: { year, created: range },
        select: { bib: true, split: true, time: true, author: true, created: true },
      });
      const splits = await tx.split.deleteMany({ where: { year, created: range } });
      const splitEntries = await tx.splitEntry.deleteMany({
        where: { year, receivedAt: range },
      });
      const startRows = await tx.startCheck.findMany({ where: { year, createdAt: range } });
      const starts = await tx.startCheck.deleteMany({ where: { year, createdAt: range } });
      const startEntries = await tx.startCheckEntry.deleteMany({
        where: { year, receivedAt: range },
      });
      const tokens =
        run.tokenIds.length > 0
          ? await tx.ingestToken.updateMany({
              where: { id: { in: run.tokenIds }, revokedAt: null },
              data: { revokedAt: now },
            })
          : { count: 0 };
      // Zkušební nulu mažeme jen tehdy, když je to pořád nula tohoto testu.
      const zeroRow = await tx.setting.findUnique({
        where: { key: LIVE_ZERO_OVERRIDE_KEY },
        select: { text: true },
      });
      let zeroCleared = false;
      if (zeroRow && new Date(zeroRow.text).getTime() === run.zero.getTime()) {
        await tx.setting.delete({ where: { key: LIVE_ZERO_OVERRIDE_KEY } });
        zeroCleared = true;
      }
      await tx.jobState.deleteMany({ where: { name: OFEED_STATE.lastHash } });

      const result: TestCleanup = {
        splits: splits.count,
        splitEntries: splitEntries.count,
        starts: starts.count,
        startEntries: startEntries.count,
        tokensRevoked: tokens.count,
        zeroCleared,
      };
      await writeAudit(
        {
          actor,
          action: "raceday.test_ended",
          target: `year:${year}`,
          detail: {
            id: run.id,
            reason,
            zero: run.zero.toISOString(),
            window: { from: window.from.toISOString(), until: window.until.toISOString() },
            ...result,
            // podklad pro případnou obnovu
            splitSnapshot: snapshotRows(splitRows),
            startSnapshot: snapshotStarts(startRows),
          },
        },
        tx,
      );
      return result;
    },
    { timeout: 60_000 },
  );
}

export type TestLeftovers = {
  splits: number;
  starts: number;
  zeroOverride: boolean;
  testRun: boolean;
};

/**
 * Den závodu (Q70): zbyla testovací data? Mezičasy / starty ročníku vzniklé před dnem závodu
 * 00:00, nastavená zkušební nula nebo neukončený test. Mimo den závodu null.
 */
export async function raceDayLeftovers(now = new Date()): Promise<TestLeftovers | null> {
  const current = await currentRaceYear();
  const cutoff = raceDayCutoff(current.raceDate, current.year);
  const dayEnd = new Date(cutoff.getTime() + 24 * 60 * 60 * 1000);
  if (now < cutoff || now >= dayEnd) return null;
  const [splits, starts, zero, run] = await Promise.all([
    prisma.split.count({ where: { year: current.year, created: { lt: cutoff } } }),
    prisma.startCheck.count({ where: { year: current.year, createdAt: { lt: cutoff } } }),
    prisma.setting.count({ where: { key: LIVE_ZERO_OVERRIDE_KEY } }),
    prisma.setting.count({ where: { key: TEST_RUN_KEY } }),
  ]);
  const leftovers = { splits, starts, zeroOverride: zero > 0, testRun: run > 0 };
  return splits + starts > 0 || leftovers.zeroOverride || leftovers.testRun ? leftovers : null;
}
