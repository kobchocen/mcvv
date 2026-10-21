import { writeAudit, type AuditActor } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";

import {
  changesWindow,
  ENTRY_CHANGE_ACTIONS,
  entryTarget,
  groupEntryChanges,
  parseCursor,
  parseEntryTarget,
  type EntryChangeAction,
  type EntryChangeDetail,
  type EntryChangeGroup,
} from "./changes-core";

export * from "./changes-core";

/** mcvv_job_state: id posledního auditního záznamu, který už byl v souhrnu. */
export const CHANGES_CURSOR_JOB = "entry_changes.digest_cursor";

/**
 * Zapíše změnu přihlášky (#130). Chyba zápisu nesmí shodit akci přihlašujícího,
 * proto se jen zaloguje.
 */
export async function recordEntryChange(
  actor: AuditActor,
  action: EntryChangeAction,
  detail: EntryChangeDetail,
): Promise<void> {
  try {
    await writeAudit({
      actor,
      action,
      target: entryTarget(detail.year, detail.registrationId),
      detail,
    });
  } catch (error) {
    console.error("[entries] change audit failed", action, error);
  }
}

export type DueEntryChanges = { groups: EntryChangeGroup[]; lastId: number; count: number };

/** Změny přihlášek do souhrnu: od kurzoru, v okně klidové doby a max. stáří. */
export async function loadDueEntryChanges(now = new Date()): Promise<DueEntryChanges> {
  const cursor = parseCursor(
    (await prisma.jobState.findUnique({ where: { name: CHANGES_CURSOR_JOB } }))?.value,
  );
  const { from, to } = changesWindow(now);
  const rows = await prisma.auditLog.findMany({
    where: {
      id: { gt: cursor },
      action: { in: [...ENTRY_CHANGE_ACTIONS] },
      createdAt: { gte: from, lte: to },
    },
    orderBy: { id: "asc" },
    take: 2000,
    select: {
      id: true,
      createdAt: true,
      action: true,
      target: true,
      actorEmail: true,
      detail: true,
    },
  });
  if (rows.length === 0) return { groups: [], lastId: cursor, count: 0 };
  const keys = [
    ...new Map(
      rows
        .map((row) => parseEntryTarget(row.target))
        .filter((key): key is { year: number; id: number } => key !== null)
        .map((key) => [`${key.year}/${key.id}`, key]),
    ).values(),
  ];
  const regs = keys.length
    ? await prisma.registration.findMany({
        where: { OR: keys.map((key) => ({ year: key.year, id: key.id })) },
        select: { year: true, id: true, name: true },
      })
    : [];
  const names = new Map(regs.map((reg) => [`${reg.year}/${reg.id}`, reg.name]));
  const groups = groupEntryChanges(rows, names);
  return { groups, lastId: rows.at(-1)!.id, count: rows.length };
}

export async function saveChangesCursor(lastId: number): Promise<void> {
  const value = String(lastId);
  await prisma.jobState.upsert({
    where: { name: CHANGES_CURSOR_JOB },
    update: { value },
    create: { name: CHANGES_CURSOR_JOB, value },
  });
}
