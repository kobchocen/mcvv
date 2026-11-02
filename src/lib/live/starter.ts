import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";

import { getRaceContext, type RaceContext } from "./race-context";
import { checkStartPunch, START_OWNING } from "./start-check-core";
import {
  corridorOf,
  decideAutoMark,
  decideStarterWrite,
  dnsWindowFromSetting,
  isLateStart,
  offsetSeconds,
  parseSoundMode,
  plannedStartMs,
  redPhaseFromSetting,
  STARTER_DNS_WINDOW_KEY,
  STARTER_RED_PHASE_KEY,
  STARTER_SOUND_KEY,
  type Corridor,
  type StarterAction,
  type StarterSettings,
} from "./starter-core";

/**
 * Startér – zápis a snímek pro obrazovku `/start`. Jen `mcvv_start_check` (aktuální stav čísla)
 * a deník `mcvv_start_check_entry`; `mcvv_split`, výsledky, OFeed ani OBD se nemění. Do
 * `started_at` jde vždy plánovaný start ze startovky (ten platí pro výsledky), skutečný
 * okamžik pozdního startu a příznak pozdě jsou jen informace.
 */

type Tx = Prisma.TransactionClient;
export type StarterPlan = Pick<RaceContext, "year" | "zero" | "intervalS" | "secondStartFrom">;

export const STARTER_SOURCE = "starter";
export const SPLIT_SOURCE = "split";

export async function loadStarterSettings(): Promise<StarterSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [STARTER_SOUND_KEY, STARTER_RED_PHASE_KEY, STARTER_DNS_WINDOW_KEY] } },
    select: { key: true, text: true },
  });
  const value = (key: string) => rows.find((row) => row.key === key)?.text;
  return {
    sound: parseSoundMode(value(STARTER_SOUND_KEY)),
    redPhaseS: redPhaseFromSetting(value(STARTER_RED_PHASE_KEY)),
    dnsWindowS: dnsWindowFromSetting(value(STARTER_DNS_WINDOW_KEY)),
  };
}

/** Přiřazený koridor účtu (null = nepřiřazen). */
export async function getStartCorridor(userId: number): Promise<Corridor | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { startCorridor: true },
  });
  return row?.startCorridor === 1 || row?.startCorridor === 2 ? row.startCorridor : null;
}

export type StarterSnapshot = {
  year: number;
  corridor: Corridor;
  zero: number;
  intervalS: number;
  secondStartFrom: number;
  zeroOverridden: boolean;
  settings: StarterSettings;
  runners: { bib: number; name: string; club: string | null }[];
  marks: { bib: number; source: string; markedAt: number | null; late: boolean }[];
};

/** Startovka koridoru + aktuální záznamy startu (startér nevidí příznak „neoznačen“). */
export async function loadStarterSnapshot(
  ctx: StarterPlan & Pick<RaceContext, "zeroOverridden">,
  corridor: Corridor,
): Promise<StarterSnapshot> {
  const range = corridor === 1 ? { gte: 1, lt: ctx.secondStartFrom } : { gte: ctx.secondStartFrom };
  const [entries, checks, settings] = await Promise.all([
    prisma.startEntry.findMany({
      where: { year: ctx.year, bib: range },
      select: { bib: true, runnerName: true, clubName: true, runner: { select: { name: true } } },
      orderBy: { bib: "asc" },
    }),
    prisma.startCheck.findMany({
      where: { year: ctx.year, bib: range },
      select: { bib: true, source: true, markedAt: true, late: true },
    }),
    loadStarterSettings(),
  ]);
  const seen = new Set<number>();
  const runners: StarterSnapshot["runners"] = [];
  for (const entry of entries) {
    if (seen.has(entry.bib)) continue;
    seen.add(entry.bib);
    runners.push({
      bib: entry.bib,
      name: entry.runnerName || entry.runner?.name || "",
      club: entry.clubName,
    });
  }
  return {
    year: ctx.year,
    corridor,
    zero: ctx.zero.getTime(),
    intervalS: ctx.intervalS,
    secondStartFrom: ctx.secondStartFrom,
    zeroOverridden: ctx.zeroOverridden,
    settings,
    runners,
    marks: checks.map((c) => ({
      bib: c.bib,
      source: c.source,
      markedAt: c.markedAt?.getTime() ?? null,
      late: c.late,
    })),
  };
}

export type StarterEntry = { id: string; bib: number; action: StarterAction; at: number };

export type StarterOutcome =
  "applied" | "deleted" | "ignored" | "duplicate" | "rejected" | "unknown";

export type StarterResult = { id: string; bib: number; outcome: StarterOutcome; note?: string };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function applyStarterEntry(
  tx: Tx,
  entry: StarterEntry,
  plan: StarterPlan,
  user: { id: number },
  allowed: Corridor | null,
  now: Date,
): Promise<StarterResult> {
  const previous = await tx.startCheckEntry.findUnique({ where: { entryKey: entry.id } });
  if (previous) {
    return {
      id: entry.id,
      bib: previous.bib,
      outcome: previous.outcome as StarterOutcome,
      note: previous.note ?? undefined,
    };
  }
  const tapAt = new Date(entry.at);
  const planned = new Date(
    plannedStartMs(plan.zero.getTime(), entry.bib, plan.intervalS, plan.secondStartFrom),
  );
  const corridor = corridorOf(entry.bib, plan.secondStartFrom);
  const journal = async (outcome: StarterOutcome, note: string | null = null) => {
    await tx.startCheckEntry.create({
      data: {
        entryKey: entry.id,
        year: plan.year,
        bib: entry.bib,
        startedAt: planned,
        offsetS: offsetSeconds(tapAt.getTime(), planned.getTime()),
        source: STARTER_SOURCE,
        action: entry.action,
        outcome,
        note,
        userId: user.id,
        markedAt: tapAt,
      },
    });
    return { id: entry.id, bib: entry.bib, outcome, note: note ?? undefined };
  };

  if (allowed !== null && corridor !== allowed) return journal("rejected", `corridor=${corridor}`);
  const check = checkStartPunch(entry.at, now);
  if (!check.ok) return journal("rejected", check.reason);
  const known = await tx.startEntry.findFirst({
    where: { year: plan.year, bib: entry.bib },
    select: { bib: true },
  });
  // Neznámé číslo: jen do deníku pro admina, řádek startu nevzniká.
  if (!known) return journal("unknown", "unknown-bib");

  const key = { year_bib: { year: plan.year, bib: entry.bib } };
  const existing = await tx.startCheck.findUnique({ where: key });
  const decision = decideStarterWrite(existing, entry.action, tapAt);
  if (decision === "ignored") {
    return journal("ignored", existing ? `existing=${existing.source}` : null);
  }
  // Předchozí vlastnící zápisy čísla (stanoviště Start / jiné zařízení) už řádek nevlastní.
  await tx.startCheckEntry.updateMany({
    where: { year: plan.year, bib: entry.bib, outcome: { in: START_OWNING } },
    data: { outcome: "replaced" },
  });
  if (decision === "delete") {
    await tx.startCheck.deleteMany({ where: { year: plan.year, bib: entry.bib } });
    return journal("deleted");
  }
  const late = entry.action === "late" && isLateStart(tapAt.getTime(), planned.getTime());
  const data = {
    startedAt: planned,
    source: STARTER_SOURCE,
    userId: user.id,
    markedAt: tapAt,
    notMarked: false,
    splitCode: null,
    splitAt: null,
    corridor,
    realStartAt: entry.action === "late" ? tapAt : null,
    late,
  };
  if (decision === "insert") {
    await tx.startCheck.create({ data: { year: plan.year, bib: entry.bib, ...data } });
  } else {
    await tx.startCheck.update({ where: key, data });
  }
  return journal(
    "applied",
    existing?.source === SPLIT_SOURCE
      ? "replaced-split"
      : existing
        ? `over=${existing.source}`
        : null,
  );
}

/**
 * Dávka ťuknutí ze zařízení startéra (offline fronta). Idempotentní podle klientského UUID;
 * `allowed` = koridor účtu startéra (admin / pořadatel null = libovolný).
 */
export async function applyStarterEntries(
  entries: StarterEntry[],
  plan: StarterPlan,
  user: { id: number },
  allowed: Corridor | null,
  now = new Date(),
): Promise<StarterResult[]> {
  const results: StarterResult[] = [];
  for (const entry of entries) {
    const run = () =>
      prisma.$transaction((tx) => applyStarterEntry(tx, entry, plan, user, allowed, now));
    try {
      results.push(await run());
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      try {
        results.push(await run());
      } catch (second) {
        if (!isUniqueViolation(second)) throw second;
        results.push({ id: entry.id, bib: entry.bib, outcome: "duplicate", note: "concurrent" });
      }
    }
  }
  return results;
}

/**
 * Jakýkoli zapsaný mezičas (i budoucí další splity a cíl) doplní start neoznačenému číslu:
 * `source = split`, `not_marked` (startér to nevidí, jen admin v přehledu startu). Jen když
 * číslo ještě žádný záznam startu nemá a je ve startovce ročníku. Volá se ve stejné transakci
 * jako zápis mezičasu; `plan` chybí → načte se kontext závodu (jiný ročník = nic).
 */
export async function autoMarkStart(
  tx: Tx,
  input: { year: number; bib: number; split: string; splitAt: Date },
  plan?: StarterPlan,
): Promise<boolean> {
  const key = { year_bib: { year: input.year, bib: input.bib } };
  const existing = await tx.startCheck.findUnique({ where: key, select: { source: true } });
  if (decideAutoMark(existing) === "skip") return false;
  const known = await tx.startEntry.findFirst({
    where: { year: input.year, bib: input.bib },
    select: { bib: true },
  });
  if (!known) return false;
  const ctx = plan ?? (await getRaceContext());
  if (ctx.year !== input.year) return false;
  const planned = new Date(
    plannedStartMs(ctx.zero.getTime(), input.bib, ctx.intervalS, ctx.secondStartFrom),
  );
  // INSERT IGNORE: souběžné ťuknutí startéra má přednost a zápis mezičasu nesmí shodit.
  const created = await tx.startCheck.createMany({
    data: [
      {
        year: input.year,
        bib: input.bib,
        startedAt: planned,
        source: SPLIT_SOURCE,
        userId: null,
        notMarked: true,
        splitCode: input.split.slice(0, 2),
        splitAt: input.splitAt,
        corridor: corridorOf(input.bib, ctx.secondStartFrom),
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 0) return false;
  await tx.startCheckEntry.create({
    data: {
      entryKey: `auto:${randomUUID()}`,
      year: input.year,
      bib: input.bib,
      startedAt: planned,
      source: SPLIT_SOURCE,
      action: "auto",
      outcome: "applied",
      note: `split=${input.split}`,
    },
  });
  return true;
}
