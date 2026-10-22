import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getRaceContext, getStations, type RaceContext } from "@/lib/live/race-context";

import { OFEED_DEFAULT_API, uploadIofXml } from "./client";
import { loadResultListInput } from "./data";
import { buildResultListXml } from "./iof-xml";
import {
  fingerprint,
  isWithinLiveWindow,
  LEASE_TTL_MS,
  sanitizeError,
  shouldUpload,
} from "./publisher-core";
import { getOfeedSettings, OFEED_STATE, readOfeedCredentials } from "./settings";

export { OFEED_STATE };
export const OFEED_JOB = "ofeed";

const INSTANCE_ID = `${hostname().slice(0, 40)}:${randomUUID().slice(0, 8)}`;

/** Mimo APP_ENV=prod se do OFeed nic neposílá – XML se jen vygeneruje (OFEED_DRY_RUN přebíjí). */
export function ofeedDryRun(): boolean {
  if (env.OFEED_DRY_RUN) return env.OFEED_DRY_RUN === "true";
  const appEnv = (env.APP_ENV ?? "").toLowerCase();
  return !(appEnv === "prod" || appEnv === "production");
}

export function ofeedApiUrl(): string {
  return env.OFEED_API_URL ?? OFEED_DEFAULT_API;
}

/**
 * Jeden zapisovatel mezi replikami: lease v mcvv_job_state. Drží se po dobu běhu
 * (max LEASE_TTL_MS, pak ho může převzít jiná instance) a po běhu se uvolní,
 * takže ruční „Nahrát teď“ funguje i z jiné repliky.
 */
async function acquireLease(now: Date): Promise<boolean> {
  await prisma.jobState.createMany({
    data: [{ name: OFEED_STATE.lease, value: INSTANCE_ID }],
    skipDuplicates: true,
  });
  const taken = await prisma.jobState.updateMany({
    where: {
      name: OFEED_STATE.lease,
      OR: [{ value: INSTANCE_ID }, { updatedAt: { lt: new Date(now.getTime() - LEASE_TTL_MS) } }],
    },
    data: { value: INSTANCE_ID },
  });
  return taken.count > 0;
}

async function releaseLease(): Promise<void> {
  await prisma.jobState.updateMany({
    where: { name: OFEED_STATE.lease, value: INSTANCE_ID },
    data: { value: "", updatedAt: new Date(0) },
  });
}

async function readState(name: string): Promise<string | null> {
  const row = await prisma.jobState.findUnique({ where: { name }, select: { value: true } });
  return row?.value ?? null;
}

async function writeState(name: string, value: string): Promise<void> {
  await prisma.jobState.upsert({ where: { name }, update: { value }, create: { name, value } });
}

export type PublishStatus =
  | "disabled"
  | "not-configured"
  | "outside-window"
  | "busy"
  | "unchanged"
  | "dry-run"
  | "uploaded"
  | "failed";

export type PublishResult = { status: PublishStatus; message?: string; competitors?: number };

/** Vygeneruje aktuální ResultList (pro stažení v adminu i pro upload). */
export async function buildCurrentResultList(now = new Date(), knownCtx?: RaceContext) {
  const [ctx, stations, settings] = await Promise.all([
    knownCtx ?? getRaceContext(),
    getStations(),
    getOfeedSettings(),
  ]);
  const { input, competitors } = await loadResultListInput(
    ctx,
    stations,
    settings.eventId ?? "-",
    now,
  );
  return { ctx, xml: buildResultListXml(input), competitors };
}

/**
 * Jeden běh publikace. `scheduler` = automatický tick (jen zapnuto + okno závodu),
 * `manual` = tlačítko v adminu, `cron` = POST /api/cron/ofeed (obojí ignoruje okno).
 */
export async function runOfeedPublish(
  trigger: "scheduler" | "manual" | "cron",
  now = new Date(),
): Promise<PublishResult> {
  const settings = await getOfeedSettings();
  if (!settings.enabled && trigger !== "manual") return { status: "disabled" };
  const dryRun = ofeedDryRun();
  const credentials = await readOfeedCredentials();
  if (!credentials && !dryRun) return { status: "not-configured" };

  const ctx = await getRaceContext();
  if (trigger === "scheduler" && !isWithinLiveWindow(now, ctx.zero)) {
    return { status: "outside-window" };
  }
  if (!(await acquireLease(now))) return { status: "busy" };
  try {
    return await publishLocked(trigger, now, ctx, dryRun, credentials);
  } finally {
    await releaseLease().catch(() => undefined);
  }
}

async function publishLocked(
  trigger: "scheduler" | "manual" | "cron",
  now: Date,
  ctx: RaceContext,
  dryRun: boolean,
  credentials: Awaited<ReturnType<typeof readOfeedCredentials>>,
): Promise<PublishResult> {
  const { xml, competitors } = await buildCurrentResultList(now, ctx);

  const hash = fingerprint(xml);
  const [lastHash, lastOkRaw] = await Promise.all([
    readState(OFEED_STATE.lastHash),
    readState(OFEED_STATE.lastOkAt),
  ]);
  const lastOkAt = lastOkRaw ? new Date(lastOkRaw) : null;
  if (!shouldUpload({ hash, lastHash, lastOkAt, now, force: trigger !== "scheduler" })) {
    return { status: "unchanged", competitors };
  }

  // Běhy do testovací akce jsou v historii označené `test:` (Q33).
  const profile = credentials?.profile ?? (await getOfeedSettings()).profile;
  const baseMode = dryRun ? "dry-run" : trigger;
  const run = await prisma.jobRun.create({
    data: {
      job: OFEED_JOB,
      mode: profile === "test" ? `test:${baseMode}` : baseMode,
      fetched: competitors,
    },
    select: { id: true },
  });
  let ok: boolean;
  let message: string;
  if (dryRun) {
    ok = true;
    message = `dry-run: ${xml.length} B`;
  } else {
    const result = await uploadIofXml({
      apiUrl: ofeedApiUrl(),
      eventId: credentials!.eventId,
      password: credentials!.password,
      xml,
    });
    ok = result.ok;
    message = `${result.status} ${result.message}`.trim();
  }
  const safe = sanitizeError(message, [credentials?.password]);
  await prisma.jobRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), ok, error: ok ? null : safe, matched: ok ? 1 : 0 },
  });
  if (ok) {
    await Promise.all([
      writeState(OFEED_STATE.lastHash, hash),
      writeState(OFEED_STATE.lastOkAt, now.toISOString()),
    ]);
  } else {
    console.warn(`[ofeed] upload failed: ${safe}`);
  }
  return { status: ok ? (dryRun ? "dry-run" : "uploaded") : "failed", message: safe, competitors };
}

export async function ofeedStatus() {
  const [runs, lastOkAt] = await Promise.all([
    prisma.jobRun.findMany({
      where: { job: OFEED_JOB },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        startedAt: true,
        finishedAt: true,
        ok: true,
        mode: true,
        error: true,
        fetched: true,
      },
    }),
    readState(OFEED_STATE.lastOkAt),
  ]);
  return {
    runs,
    lastOkAt: lastOkAt ? new Date(lastOkAt) : null,
    lastError: runs.find((run) => run.ok === false) ?? null,
    dryRun: ofeedDryRun(),
  };
}
