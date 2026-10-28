"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formInt, formString } from "@/lib/admin/parse";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/log";
import {
  lineChanges,
  startGroupSnapshot,
  startGroupTarget,
  startLineTarget,
  startListTarget,
} from "@/lib/audit/startlist";
import { prisma } from "@/lib/db/client";
import { outsideCategory } from "@/lib/race/startlist-check";
import { startListProposalLock } from "@/lib/race/startlist-proposal-lock";
import { generateStartList } from "@/lib/race/startlist-generator";
import {
  buildGeneratorInput,
  inputFingerprint,
  loadAdminStartRows,
  loadStartGroups,
  loadStartSettings,
  ORGANIZER_REGISTRATION_ID,
} from "@/lib/race/startlist-load";
import { getSiteSettings } from "@/lib/settings/site";
import { redirect } from "@/i18n/routing";

const MAX_BIB = 9999;

function revalidateStartList() {
  revalidatePath("/[locale]/admin/startovka", "page");
  revalidatePath("/[locale]/startovka", "page");
}

async function back(year: number, query: Record<string, string> = {}): Promise<never> {
  const locale = await getLocale();
  redirect({
    href: { pathname: "/admin/startovka", query: { rok: String(year), ...query } },
    locale,
  });
  throw new Error("unreachable");
}

function yearOf(data: FormData): number | null {
  const year = formInt(data, "year");
  return year && year >= 2000 && year <= 2100 ? year : null;
}

/** Zámky řádků před změnou (chybějící meta = odemčeno) pro audit. */
async function locksOf(year: number, runnerIds: string[]): Promise<Map<string, boolean>> {
  const rows = await prisma.startLineMeta.findMany({
    where: { year, runnerId: { in: runnerIds } },
    select: { runnerId: true, locked: true },
  });
  return new Map(rows.map((row) => [row.runnerId, row.locked]));
}

async function setLock(year: number, runnerIds: string[], locked: boolean) {
  for (const runnerId of runnerIds) {
    await prisma.startLineMeta.upsert({
      where: { year_runnerId: { year, runnerId } },
      update: { locked },
      create: { year, runnerId, locked },
    });
  }
}

/**
 * Ruční přidělení / změna / odebrání čísla (#116). Duplicita se neuloží. Číslo mimo okno
 * kategorie se uloží bez potvrzení (kategorie není dogma, všichni běží stejnou trať) – admin
 * dostane jen informaci. Ručně změněné číslo se zamkne (generátor ho nemění).
 */
export async function setStartBib(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = yearOf(formData);
  const runnerId = formString(formData, "runnerId");
  if (!year || !runnerId) {
    return;
  }
  const raw = formString(formData, "bib");
  const bib = raw === "" ? 0 : Number.parseInt(raw, 10);
  if (!Number.isInteger(bib) || bib < 0 || bib > MAX_BIB) {
    await back(year, { chyba: "bib", bezec: runnerId });
  }
  const line = await prisma.registrationLine.findUnique({
    where: { year_runnerId: { year, runnerId } },
    select: { bib: true, categoryId: true, registrationId: true },
  });
  if (!line) {
    await back(year);
  }
  const value = bib === 0 ? null : bib;
  if (value != null) {
    const holder = await prisma.registrationLine.findFirst({
      where: { year, bib: value, runnerId: { not: runnerId } },
      select: { runnerId: true },
    });
    if (holder) {
      await back(year, {
        chyba: "duplicate",
        bezec: runnerId,
        cislo: String(value),
        drzi: holder.runnerId,
      });
    }
  }
  const lockedBefore = (await locksOf(year, [runnerId])).get(runnerId) ?? false;
  await prisma.registrationLine.update({
    where: { year_runnerId: { year, runnerId } },
    data: { bib: value },
  });
  await setLock(year, [runnerId], true);
  const changes = diffFields(
    { bib: line!.bib, locked: lockedBefore },
    { bib: value, locked: true },
  );
  if (Object.keys(changes).length > 0) {
    await writeAudit({
      actor: session,
      action: "startlist.bib_set",
      target: startLineTarget(year, runnerId),
      detail: { year, runnerId, registrationId: line!.registrationId, changes },
    });
  }
  revalidateStartList();
  const settings = value != null ? await loadStartSettings(year) : null;
  const outside =
    settings != null &&
    outsideCategory(settings.model, settings.ranges, settings.champions, {
      categoryId: line!.categoryId,
      bib: value,
      organizer: line!.registrationId === ORGANIZER_REGISTRATION_ID,
    });
  await back(year, { ok: "bib", bezec: runnerId, ...(outside ? { mimo: "1" } : {}) });
}

/** Prohození dvou čísel (druhé může být volné = přesun). Obě čísla se zamknou. */
export async function swapStartBibs(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = yearOf(formData);
  const a = formInt(formData, "bibA");
  const b = formInt(formData, "bibB");
  if (!year) {
    return;
  }
  if (!a || !b || a === b || a > MAX_BIB || b > MAX_BIB) {
    await back(year, { chyba: "swap" });
  }
  const [holdersA, holdersB] = await Promise.all([
    prisma.registrationLine.findMany({ where: { year, bib: a! }, select: { runnerId: true } }),
    prisma.registrationLine.findMany({ where: { year, bib: b! }, select: { runnerId: true } }),
  ]);
  if (holdersA.length !== 1 || holdersB.length > 1) {
    await back(year, { chyba: holdersA.length === 0 ? "swapEmpty" : "swapDuplicate" });
  }
  const runnerA = holdersA[0].runnerId;
  const runnerB = holdersB[0]?.runnerId ?? null;
  const swapped = runnerB ? [runnerA, runnerB] : [runnerA];
  const locksBefore = await locksOf(year!, swapped);
  await prisma.$transaction([
    prisma.registrationLine.update({
      where: { year_runnerId: { year: year!, runnerId: runnerA } },
      data: { bib: b },
    }),
    ...(runnerB
      ? [
          prisma.registrationLine.update({
            where: { year_runnerId: { year: year!, runnerId: runnerB } },
            data: { bib: a },
          }),
        ]
      : []),
  ]);
  await setLock(year!, swapped, true);
  const before = { [runnerA]: { bib: a, locked: locksBefore.get(runnerA) ?? false } };
  const after = { [runnerA]: { bib: b, locked: true } };
  if (runnerB) {
    Object.assign(before, { [runnerB]: { bib: b, locked: locksBefore.get(runnerB) ?? false } });
    Object.assign(after, { [runnerB]: { bib: a, locked: true } });
  }
  await writeAudit({
    actor: session,
    action: "startlist.bibs_swapped",
    target: startLineTarget(year!, runnerA),
    detail: { year: year!, bibs: [a!, b!], runners: swapped, changes: lineChanges(before, after) },
  });
  revalidateStartList();
  await back(year!, { ok: "swap" });
}

export async function toggleStartLock(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = yearOf(formData);
  const runnerId = formString(formData, "runnerId");
  if (!year || !runnerId) {
    return;
  }
  const locked = formString(formData, "locked") === "1";
  const lockedBefore = (await locksOf(year, [runnerId])).get(runnerId) ?? false;
  await setLock(year, [runnerId], locked);
  if (lockedBefore !== locked) {
    await writeAudit({
      actor: session,
      action: "startlist.lock_changed",
      target: startLineTarget(year, runnerId),
      detail: { year, runnerId, changes: diffFields({ locked: lockedBefore }, { locked }) },
    });
  }
  revalidateStartList();
  await back(year, { ok: "lock", bezec: runnerId });
}

/**
 * Uložení návrhu „Navrhnout startovku“ (#115). Návrh se přepočítá na serveru a uloží jen nad
 * stejnými daty, jaká byla v náhledu (otisk) – ochrana proti dvojímu odeslání i souběhu.
 * Nic se nezveřejňuje; zveřejnění zůstává přepínačem v nastavení. Po zveřejnění je návrh
 * zakázaný i na serveru (`startListProposalLock`), ruční úpravy řádků zůstávají povolené.
 */
export async function applyStartListProposal(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = yearOf(formData);
  if (!year) {
    return;
  }
  if (startListProposalLock(await getSiteSettings()).locked) {
    await back(year, { chyba: "published" });
  }
  const [settings, rows, groups] = await Promise.all([
    loadStartSettings(year),
    loadAdminStartRows(year),
    loadStartGroups(year),
  ]);
  const input = await buildGeneratorInput(year, settings, rows, groups);
  if (inputFingerprint(input) !== formString(formData, "fingerprint")) {
    await back(year, { chyba: "stale" });
  }
  const proposal = generateStartList(input);
  if (proposal.blocking) {
    await back(year, { navrh: "1", chyba: "blocking" });
  }
  const changes = proposal.lines.filter((line) => line.bib !== line.previousBib);
  await prisma.$transaction([
    // Nejdřív uvolnit měněná čísla, ať nevznikne ani dočasná duplicita.
    ...changes.map((line) =>
      prisma.registrationLine.update({
        where: { year_runnerId: { year, runnerId: line.runnerId } },
        data: { bib: null },
      }),
    ),
    ...changes
      .filter((line) => line.bib != null)
      .map((line) =>
        prisma.registrationLine.update({
          where: { year_runnerId: { year, runnerId: line.runnerId } },
          data: { bib: line.bib },
        }),
      ),
  ]);
  if (changes.length > 0) {
    await writeAudit({
      actor: session,
      action: "startlist.proposal_applied",
      target: startListTarget(year),
      detail: {
        year,
        count: changes.length,
        changes: lineChanges(
          Object.fromEntries(changes.map((line) => [line.runnerId, { bib: line.previousBib }])),
          Object.fromEntries(changes.map((line) => [line.runnerId, { bib: line.bib }])),
        ),
      },
    });
  }
  revalidateStartList();
  await back(year, { ok: "applied", n: String(changes.length) });
}

/** Skupina společného / navazujícího startu z vybraných řádků. */
export async function createStartGroup(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = yearOf(formData);
  if (!year) {
    return;
  }
  const kind = formString(formData, "kind") === "consecutive" ? "consecutive" : "joint";
  const runnerIds = [
    ...new Set(
      formData
        .getAll("member")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
  if (runnerIds.length < 2) {
    await back(year, { chyba: "groupSize" });
  }
  const lines = await prisma.registrationLine.count({
    where: { year, runnerId: { in: runnerIds } },
  });
  if (lines !== runnerIds.length) {
    await back(year, { chyba: "groupSize" });
  }
  const membershipBefore = await prisma.startLineMeta.findMany({
    where: { year, runnerId: { in: runnerIds } },
    select: { runnerId: true, groupId: true },
  });
  const groupBefore = new Map(membershipBefore.map((row) => [row.runnerId, row.groupId]));
  const note = formString(formData, "note").slice(0, 200) || null;
  const group = await prisma.startGroup.create({ data: { year, kind, note } });
  for (const [index, runnerId] of runnerIds.entries()) {
    await prisma.startLineMeta.upsert({
      where: { year_runnerId: { year, runnerId } },
      update: { groupId: group.id, groupOrder: index },
      create: { year, runnerId, groupId: group.id, groupOrder: index },
    });
  }
  // Přeřazení z jiné skupiny ji může vyprázdnit – prázdné skupiny se smažou.
  const emptied = await prisma.startGroup.findMany({
    where: { year, members: { none: {} } },
    select: { id: true },
  });
  await prisma.startGroup.deleteMany({ where: { year, members: { none: {} } } });
  await writeAudit({
    actor: session,
    action: "startlist.group_created",
    target: startGroupTarget(group.id),
    detail: {
      year,
      groupId: group.id,
      removedEmptyGroups: emptied.map((row) => row.id),
      changes: {
        ...diffFields(null, startGroupSnapshot({ kind, note, members: runnerIds })),
        // Přiřazení členů: `<bezec>.group` = původní skupina → nová.
        ...lineChanges(
          Object.fromEntries(runnerIds.map((id) => [id, { group: groupBefore.get(id) ?? null }])),
          Object.fromEntries(runnerIds.map((id) => [id, { group: group.id }])),
        ),
      },
    },
  });
  revalidateStartList();
  await back(year, { ok: "group" });
}

export async function deleteStartGroup(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = yearOf(formData);
  const id = formInt(formData, "groupId");
  if (!year || !id) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    const group = await tx.startGroup.findFirst({
      where: { id, year },
      select: {
        kind: true,
        note: true,
        members: { select: { runnerId: true }, orderBy: { groupOrder: "asc" } },
      },
    });
    await tx.startLineMeta.updateMany({
      where: { year, groupId: id },
      data: { groupId: null, groupOrder: 0 },
    });
    await tx.startGroup.deleteMany({ where: { id, year } });
    if (!group) {
      return;
    }
    const members = group.members.map((member) => member.runnerId);
    await writeAudit(
      {
        actor: session,
        action: "startlist.group_deleted",
        target: startGroupTarget(id),
        detail: {
          year,
          groupId: id,
          changes: {
            ...diffFields(startGroupSnapshot({ kind: group.kind, note: group.note, members }), {}),
            ...lineChanges(
              Object.fromEntries(members.map((runnerId) => [runnerId, { group: id }])),
              Object.fromEntries(members.map((runnerId) => [runnerId, { group: null }])),
            ),
          },
        },
      },
      tx,
    );
  });
  revalidateStartList();
  await back(year, { ok: "groupDeleted" });
}
