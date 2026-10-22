import { randomUUID } from "node:crypto";

import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

import { OWNING_OUTCOMES } from "./ingest-core";
import { MANUAL_AUTHOR, MANUAL_SOURCE, normalizeReason } from "./manual-core";

export type SplitCell = {
  time: number;
  author: string | null;
  created: Date | null;
  /** Zdroj vlastnícího zápisu v deníku (web / obd / admin), null = bez deníku (legacy). */
  source: string | null;
  /** Otevřený konflikt k této buňce. */
  conflict: boolean;
};

export type SplitTableRow = {
  bib: number;
  name: string | null;
  categoryId: string | null;
  /** Číslo je ve startovce ročníku. */
  known: boolean;
  cells: Record<string, SplitCell>;
};

/** Startovka + mezičasy ročníku po číslech (pro výpis v adminu). */
export async function loadSplitTable(year: number): Promise<SplitTableRow[]> {
  const [starts, splits, owners, conflicts] = await Promise.all([
    prisma.startEntry.findMany({
      where: { year },
      select: { bib: true, runnerName: true, categoryId: true, runner: { select: { name: true } } },
    }),
    prisma.split.findMany({ where: { year } }),
    prisma.splitEntry.findMany({
      where: { year, outcome: { in: OWNING_OUTCOMES } },
      select: { bib: true, split: true, time: true, source: true, id: true },
      orderBy: { id: "asc" },
    }),
    prisma.splitEntry.findMany({
      where: { year, outcome: "conflict" },
      select: { bib: true, split: true },
    }),
  ]);
  const ownerSource = new Map<string, string>();
  for (const owner of owners) {
    ownerSource.set(`${owner.split}:${owner.bib}:${owner.time}`, owner.source);
  }
  const conflictKeys = new Set(conflicts.map((c) => `${c.split}:${c.bib}`));
  const rows = new Map<number, SplitTableRow>();
  for (const start of starts) {
    if (start.bib < 1) continue;
    rows.set(start.bib, {
      bib: start.bib,
      name: start.runnerName || start.runner.name,
      categoryId: start.categoryId,
      known: true,
      cells: {},
    });
  }
  for (const split of splits) {
    const row = rows.get(split.bib) ?? {
      bib: split.bib,
      name: null,
      categoryId: null,
      known: false,
      cells: {},
    };
    row.cells[split.split] = {
      time: split.time,
      author: split.author,
      created: split.created,
      source: ownerSource.get(`${split.split}:${split.bib}:${split.time}`) ?? null,
      conflict: conflictKeys.has(`${split.split}:${split.bib}`),
    };
    rows.set(split.bib, row);
  }
  return [...rows.values()].sort((a, b) => a.bib - b.bib);
}

export type ManualOutcome =
  | { ok: true; action: "create" | "correct" | "delete" | "unchanged"; previous: number | null }
  | { ok: false; reason: "changed" | "reason-required" | "missing" };

type ManualInput = {
  year: number;
  bib: number;
  split: string;
  /** Hodnota, kterou admin viděl (null = řádek nebyl). Ochrana proti souběžné změně. */
  expected: number | null;
  reason: string;
  actor: SessionUser;
  now?: Date;
};

/**
 * Ruční zápis / přepis jednoho mezičasu. Přepis existující hodnoty vyžaduje důvod;
 * původní vlastnící zápis dostane `replaced`, otevřené konflikty k buňce `rejected`
 * (`superseded-by-admin`). Do deníku jde zápis `source: "admin"` a do auditu `raceday.split_set`.
 */
export async function setManualSplit(
  input: ManualInput & { time: number },
): Promise<ManualOutcome> {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return prisma.$transaction(async (tx) => {
    const key = { bib_year_split: { bib: input.bib, year: input.year, split: input.split } };
    const current = await tx.split.findUnique({ where: key, select: { time: true } });
    const previous = current?.time ?? null;
    if (previous !== input.expected) return { ok: false, reason: "changed" } as const;
    if (previous === input.time) return { ok: true, action: "unchanged", previous } as const;
    if (previous !== null && !reason) return { ok: false, reason: "reason-required" } as const;

    const where = { year: input.year, split: input.split, bib: input.bib };
    const owner = await tx.splitEntry.findFirst({
      where: { ...where, time: previous ?? undefined, outcome: { in: OWNING_OUTCOMES } },
      orderBy: { id: "desc" },
    });
    if (previous === null) {
      await tx.split.create({
        data: { ...where, time: input.time, created: now, author: MANUAL_AUTHOR },
      });
    } else {
      await tx.split.update({
        where: key,
        data: { time: input.time, created: now, author: MANUAL_AUTHOR },
      });
      await tx.splitEntry.updateMany({
        where: { ...where, outcome: { in: OWNING_OUTCOMES } },
        data: { outcome: "replaced" },
      });
    }
    const superseded = await tx.splitEntry.updateMany({
      where: { ...where, outcome: "conflict" },
      data: { outcome: "rejected", note: `superseded-by-admin;by=${input.actor.id}` },
    });
    const action = previous === null ? "create" : "correct";
    await tx.splitEntry.create({
      data: {
        entryKey: `adm:${randomUUID()}`,
        ...where,
        time: input.time,
        source: MANUAL_SOURCE,
        action,
        replaces: owner?.entryKey ?? null,
        outcome: "applied",
        note: reason || null,
        author: MANUAL_AUTHOR,
        userId: input.actor.id,
        receivedAt: now,
      },
    });
    await writeAudit(
      {
        actor: input.actor,
        action: "raceday.split_set",
        target: `split:${input.year}:${input.split}:${input.bib}`,
        detail: {
          bib: input.bib,
          split: input.split,
          from: previous,
          to: input.time,
          reason: reason || null,
          conflictsSuperseded: superseded.count,
        },
      },
      tx,
    );
    return { ok: true, action, previous } as const;
  });
}

/** Ruční smazání jednoho mezičasu (důvod povinný). Audit `raceday.split_deleted`. */
export async function deleteManualSplit(input: ManualInput): Promise<ManualOutcome> {
  const now = input.now ?? new Date();
  const reason = normalizeReason(input.reason);
  return prisma.$transaction(async (tx) => {
    const key = { bib_year_split: { bib: input.bib, year: input.year, split: input.split } };
    const current = await tx.split.findUnique({ where: key, select: { time: true } });
    if (!current) return { ok: false, reason: "missing" } as const;
    if (current.time !== input.expected) return { ok: false, reason: "changed" } as const;
    if (!reason) return { ok: false, reason: "reason-required" } as const;
    const where = { year: input.year, split: input.split, bib: input.bib };
    const owner = await tx.splitEntry.findFirst({
      where: { ...where, time: current.time, outcome: { in: OWNING_OUTCOMES } },
      orderBy: { id: "desc" },
    });
    await tx.split.delete({ where: key });
    await tx.splitEntry.updateMany({
      where: { ...where, outcome: { in: OWNING_OUTCOMES } },
      data: { outcome: "deleted" },
    });
    const superseded = await tx.splitEntry.updateMany({
      where: { ...where, outcome: "conflict" },
      data: { outcome: "rejected", note: `superseded-by-admin;by=${input.actor.id}` },
    });
    await tx.splitEntry.create({
      data: {
        entryKey: `adm:${randomUUID()}`,
        ...where,
        time: current.time,
        source: MANUAL_SOURCE,
        action: "delete",
        replaces: owner?.entryKey ?? null,
        outcome: "deleted",
        note: reason.slice(0, 255),
        author: MANUAL_AUTHOR,
        userId: input.actor.id,
        receivedAt: now,
      },
    });
    await writeAudit(
      {
        actor: input.actor,
        action: "raceday.split_deleted",
        target: `split:${input.year}:${input.split}:${input.bib}`,
        detail: {
          bib: input.bib,
          split: input.split,
          from: current.time,
          reason,
          conflictsSuperseded: superseded.count,
        },
      },
      tx,
    );
    return { ok: true, action: "delete", previous: current.time } as const;
  });
}
