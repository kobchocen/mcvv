"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formDate, formInt, formString } from "@/lib/admin/parse";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { ensureOrganizerRegistration } from "@/lib/entries/organizer-registration";
import { loadBibRanges } from "@/lib/race/startlist-load";
import { encodeStartIssues, validateStartSettings, type BibRange } from "@/lib/race/start-settings";
import { DEFAULT_START_MODEL, parseClock } from "@/lib/race/start-time";
import {
  DEFAULT_OFFICE_OPENS_S,
  DEFAULT_ONSITE_UNTIL_S,
  standardEndFromDeadline,
} from "@/lib/slots/core";
import { onsiteWindow } from "@/lib/slots/defaults";
import { redirect } from "@/i18n/routing";

function revalidateEditions() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]/admin/rocniky", "page");
  revalidatePath("/[locale]/admin/startovka", "page");
  revalidatePath("/[locale]/startovka", "page");
}

function feeFields(data: FormData) {
  return {
    startKidsMail: formInt(data, "startKidsMail"),
    startKidsPlace: formInt(data, "startKidsPlace"),
    startAdultMail: formInt(data, "startAdultMail"),
    startAdultPlace: formInt(data, "startAdultPlace"),
    startInterval: formInt(data, "startInterval"),
    finAdult1: formInt(data, "finAdult1"),
    finAdult2: formInt(data, "finAdult2"),
    finAdult3: formInt(data, "finAdult3"),
    finAdult4: formInt(data, "finAdult4"),
    finAdult5: formInt(data, "finAdult5"),
    finVet1: formInt(data, "finVet1"),
    finVet2: formInt(data, "finVet2"),
    finVet3: formInt(data, "finVet3"),
  };
}

/** Rozsahy čísel z formuláře (`range_<kat>_from`, `range_<kat>_to`); null = formulář je neobsahuje. */
function formRanges(data: FormData, categoryIds: string[]): BibRange[] | null {
  if (!categoryIds.some((id) => data.has(`range_${id}_from`))) {
    return null;
  }
  return categoryIds.map((categoryId) => ({
    categoryId,
    bibFrom: formInt(data, `range_${categoryId}_from`) ?? 0,
    bibTo: formInt(data, `range_${categoryId}_to`) ?? 0,
  }));
}

/** Rozsahy pro nový ročník: kopie z nejbližšího předchozího roku, jinak číselník kategorií. */
async function copyRangesForNewYear(year: number): Promise<void> {
  const exists = await prisma.categoryBibRange.count({ where: { year } });
  if (exists > 0) {
    return;
  }
  const previous = await prisma.categoryBibRange.findFirst({
    where: { year: { lt: year } },
    orderBy: { year: "desc" },
    select: { year: true },
  });
  const source = await loadBibRanges(previous?.year ?? year);
  await prisma.categoryBibRange.createMany({
    data: source.ranges.map((range) => ({ year, ...range })),
    skipDuplicates: true,
  });
}

/**
 * Když má ročník termíny přihlášek (sloty), úprava uzávěrky, startovného nebo data závodu
 * v hlavním formuláři je promítne i do nich (standard = uzávěrka a online startovné,
 * na místě = den závodu a startovné na místě), aby se obě místa nerozcházela.
 */
async function syncSlotsFromEdition(
  id: number | null,
  year: number,
  payload: {
    date: Date;
    regDeadline: Date | null;
    startAdultMail: number | null;
    startKidsMail: number | null;
    startAdultPlace: number | null;
    startKidsPlace: number | null;
  },
  before: Record<string, unknown> | null,
): Promise<void> {
  const slots = await prisma.registrationSlot.findMany({ where: { year } });
  if (slots.length === 0) {
    return;
  }
  const changed = (key: keyof typeof payload) =>
    !before || String(before[key] ?? "") !== String(payload[key] ?? "");
  const standard = slots.find((slot) => slot.type === "standard");
  if (standard) {
    const data: Prisma.RegistrationSlotUpdateInput = {};
    if (payload.regDeadline && changed("regDeadline")) {
      data.to = standardEndFromDeadline(payload.regDeadline);
    }
    if (payload.startAdultMail !== null && changed("startAdultMail")) {
      data.feeAdult = payload.startAdultMail;
    }
    if (payload.startKidsMail !== null && changed("startKidsMail")) {
      data.feeYouth = payload.startKidsMail;
    }
    if (Object.keys(data).length > 0) {
      await prisma.registrationSlot.update({
        where: { year_type: { year, type: "standard" } },
        data,
      });
    }
  }
  if (slots.some((slot) => slot.type === "onsite")) {
    const times = await prisma.edition.findFirst({
      where: id ? { id } : { date: payload.date },
      select: { officeOpensS: true, onsiteUntilS: true },
    });
    const data: Prisma.RegistrationSlotUpdateInput = onsiteWindow(
      payload.date,
      times?.officeOpensS ?? DEFAULT_OFFICE_OPENS_S,
      times?.onsiteUntilS ?? DEFAULT_ONSITE_UNTIL_S,
    );
    if (payload.startAdultPlace !== null && changed("startAdultPlace")) {
      data.feeAdult = payload.startAdultPlace;
    }
    if (payload.startKidsPlace !== null && changed("startKidsPlace")) {
      data.feeYouth = payload.startKidsPlace;
    }
    await prisma.registrationSlot.update({
      where: { year_type: { year, type: "onsite" } },
      data,
    });
  }
}

export async function saveEdition(formData: FormData): Promise<void> {
  const actor = await requireStaff();
  const locale = await getLocale();
  const id = formInt(formData, "id");
  const date = formDate(formData, "date");
  if (!date) {
    return;
  }
  const year = date.getUTCFullYear();
  const zeroRaw = formString(formData, "startZero");
  const zeroSeconds = zeroRaw ? parseClock(zeroRaw) : DEFAULT_START_MODEL.zeroSeconds;
  const intervalSeconds = formInt(formData, "startInterval") ?? DEFAULT_START_MODEL.intervalSeconds;
  const secondStartFrom =
    formInt(formData, "secondStartFrom") ?? DEFAULT_START_MODEL.secondStartFrom;
  const champions = {
    men: formInt(formData, "championBibMen"),
    women: formInt(formData, "championBibWomen"),
  };
  const { categories, ranges: currentRanges } = await loadBibRanges(year);
  const ranges = formRanges(
    formData,
    categories.map((category) => category.id),
  );
  const issues = validateStartSettings(
    { zeroSeconds: zeroSeconds ?? -1, intervalSeconds, secondStartFrom },
    ranges ?? currentRanges,
    champions,
  );
  if (issues.length > 0) {
    redirect({
      href: id
        ? {
            pathname: "/admin/rocniky/[id]",
            params: { id: String(id) },
            query: { chyba: encodeStartIssues(issues) },
          }
        : { pathname: "/admin/rocniky/novy", query: { chyba: encodeStartIssues(issues) } },
      locale,
    });
  }
  const payload = {
    date,
    regDeadline: formDate(formData, "regDeadline"),
    weather: formString(formData, "weather") || null,
    temp: formInt(formData, "temp"),
    ...feeFields(formData),
    startZeroSeconds: zeroSeconds ?? DEFAULT_START_MODEL.zeroSeconds,
    secondStartFrom,
    championBibMen: champions.men,
    championBibWomen: champions.women,
  };

  // Audit (#107): stav před / po (datum, uzávěrka, startovné, startovní model).
  const before = id
    ? await prisma.edition.findUnique({
        where: { id },
        select: Object.fromEntries(
          Object.keys(payload).map((key) => [key, true]),
        ) as Prisma.EditionSelect,
      })
    : null;
  if (id) {
    await prisma.edition.update({ where: { id }, data: payload });
  } else {
    await prisma.edition.create({ data: payload });
  }
  await syncSlotsFromEdition(id, year, payload, before);
  const changes = diffFields(before, payload);
  if (Object.keys(changes).length > 0) {
    await writeAudit({
      actor,
      action: id ? "edition.updated" : "edition.created",
      target: `edition:${year}`,
      detail: { id, changes },
    });
  }
  if (ranges) {
    await prisma.$transaction(
      ranges.map((range) =>
        prisma.categoryBibRange.upsert({
          where: { year_categoryId: { year, categoryId: range.categoryId } },
          update: { bibFrom: range.bibFrom, bibTo: range.bibTo },
          create: { year, ...range },
        }),
      ),
    );
  } else {
    await copyRangesForNewYear(year);
  }
  // Přihláška pořadatelů (č. 1) vzniká s ročníkem, ne náhodou při první návštěvě /prihlasky.
  await ensureOrganizerRegistration(year, actor.email);

  revalidateEditions();
  redirect({ href: "/admin/rocniky", locale });
}
