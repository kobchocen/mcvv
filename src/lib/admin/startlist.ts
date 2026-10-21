"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formInt, formString } from "@/lib/admin/parse";
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
  await requireStaff();
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
  await prisma.registrationLine.update({
    where: { year_runnerId: { year, runnerId } },
    data: { bib: value },
  });
  await setLock(year, [runnerId], true);
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
  await requireStaff();
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
  await setLock(year!, runnerB ? [runnerA, runnerB] : [runnerA], true);
  revalidateStartList();
  await back(year!, { ok: "swap" });
}

export async function toggleStartLock(formData: FormData): Promise<void> {
  await requireStaff();
  const year = yearOf(formData);
  const runnerId = formString(formData, "runnerId");
  if (!year || !runnerId) {
    return;
  }
  await setLock(year, [runnerId], formString(formData, "locked") === "1");
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
  await requireStaff();
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
  revalidateStartList();
  await back(year, { ok: "applied", n: String(changes.length) });
}

/** Skupina společného / navazujícího startu z vybraných řádků. */
export async function createStartGroup(formData: FormData): Promise<void> {
  await requireStaff();
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
  const group = await prisma.startGroup.create({
    data: { year, kind, note: formString(formData, "note").slice(0, 200) || null },
  });
  for (const [index, runnerId] of runnerIds.entries()) {
    await prisma.startLineMeta.upsert({
      where: { year_runnerId: { year, runnerId } },
      update: { groupId: group.id, groupOrder: index },
      create: { year, runnerId, groupId: group.id, groupOrder: index },
    });
  }
  await prisma.startGroup.deleteMany({ where: { year, members: { none: {} } } });
  revalidateStartList();
  await back(year, { ok: "group" });
}

export async function deleteStartGroup(formData: FormData): Promise<void> {
  await requireStaff();
  const year = yearOf(formData);
  const id = formInt(formData, "groupId");
  if (!year || !id) {
    return;
  }
  await prisma.$transaction([
    prisma.startLineMeta.updateMany({
      where: { year, groupId: id },
      data: { groupId: null, groupOrder: 0 },
    }),
    prisma.startGroup.deleteMany({ where: { id, year } }),
  ]);
  revalidateStartList();
  await back(year, { ok: "groupDeleted" });
}
