"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formInt, formString } from "@/lib/admin/parse";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";
import { parseClock } from "@/lib/race/start-time";
import {
  deadlineFromStandardEnd,
  parsePragueLocalInput,
  SLOT_TYPES,
  slotOf,
  validateSlots,
  WRITABLE_SLOT_TYPES,
  type Slot,
  type SlotType,
} from "@/lib/slots/core";
import { onsiteWindow, slotsWithDefaults } from "@/lib/slots/defaults";
import { loadSlots } from "@/lib/slots/load";
import { redirect } from "@/i18n/routing";

function revalidateSlots() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]", "layout");
  revalidateTag(HOME_COUNTS_TAG, "max");
}

function fee(data: FormData, key: string, fallback: number): number {
  return formInt(data, key) ?? fallback;
}

/** Termín z formuláře (`slot_<typ>_…`); chybějící hodnoty bere z dosavadního nastavení. */
function formSlot(data: FormData, current: Slot, onsite: { from: Date; to: Date }): Slot {
  const type: SlotType = current.type;
  const prefix = `slot_${type}_`;
  const base = {
    ...current,
    feeAdult: fee(data, `${prefix}adult`, current.feeAdult),
    feeYouth: fee(data, `${prefix}youth`, current.feeYouth),
  };
  if (type === "onsite") {
    return { ...base, ...onsite, active: true };
  }
  const from = parsePragueLocalInput(formString(data, `${prefix}from`)) ?? current.from;
  const to = parsePragueLocalInput(formString(data, `${prefix}to`)) ?? current.to;
  return {
    ...base,
    // standard je vždy zapnutý; ostatní podle zaškrtnutí
    active: type === "standard" ? true : data.get(`${prefix}active`) === "on",
    from,
    to,
    payWithinMinutes:
      type === "late" ? (formInt(data, `${prefix}payMin`) ?? current.payWithinMinutes) : null,
  };
}

/**
 * Uloží „Termíny a startovné“ ročníku: sloty, lhůtu doplatku standardu, čas e-mailu doplatku
 * a časy závodní kanceláře v den závodu. Uzávěrka (`prihl_datum`), otevření přihlášek
 * a startovné online / na místě v `mcvv_info` se synchronizují, aby starší místa seděla.
 */
export async function saveEditionSlots(formData: FormData): Promise<void> {
  const actor = await requireStaff();
  const locale = await getLocale();
  const id = formInt(formData, "id");
  const edition = id ? await prisma.edition.findUnique({ where: { id } }) : null;
  if (!id || !edition) {
    return;
  }
  const year = edition.date.getUTCFullYear();
  const officeOpensS = parseClock(formString(formData, "officeOpens")) ?? edition.officeOpensS;
  const onsiteUntilS = parseClock(formString(formData, "onsiteUntil")) ?? edition.onsiteUntilS;
  const standardPayMailS =
    parseClock(formString(formData, "standardPayMail")) ?? edition.standardPayMailS;
  const standardPayUntil = parsePragueLocalInput(formString(formData, "standardPayUntil"));
  const onsite = onsiteWindow(edition.date, officeOpensS, onsiteUntilS);

  const current = slotsWithDefaults(await loadSlots(year), edition);
  const slots = current.map((slot) => formSlot(formData, slot, onsite));
  const issues = validateSlots(slots, { payUntil: standardPayUntil, officeOpensS, onsiteUntilS });
  if (issues.length > 0) {
    redirect({
      href: {
        pathname: "/admin/rocniky/[id]",
        params: { id: String(id) },
        query: { terminy: issues.join(",") },
      },
      locale,
    });
  }

  const standard = slotOf(slots, "standard")!;
  const opensAt = slots
    .filter((slot) => slot.active && WRITABLE_SLOT_TYPES.includes(slot.type))
    .reduce((min, slot) => (slot.from < min ? slot.from : min), standard.from);
  const onsiteSlot = slotOf(slots, "onsite")!;
  const editionData = {
    regDeadline: deadlineFromStandardEnd(standard.to),
    regOpensAt: opensAt,
    standardPayUntil,
    standardPayMailS,
    officeOpensS,
    onsiteUntilS,
    startAdultMail: standard.feeAdult,
    startKidsMail: standard.feeYouth,
    startAdultPlace: onsiteSlot.feeAdult,
    startKidsPlace: onsiteSlot.feeYouth,
  };
  await prisma.$transaction([
    ...slots.map((slot) => {
      const data = {
        from: slot.from,
        to: slot.to,
        active: slot.active,
        feeAdult: slot.feeAdult,
        feeYouth: slot.feeYouth,
        payWithinMinutes: slot.payWithinMinutes,
      };
      return prisma.registrationSlot.upsert({
        where: { year_type: { year, type: slot.type } },
        update: data,
        create: { year, type: slot.type, ...data },
      });
    }),
    prisma.edition.update({ where: { id }, data: editionData }),
  ]);
  await writeAudit({
    actor,
    action: "edition.slots_updated",
    target: `edition:${year}`,
    detail: {
      id,
      slots: SLOT_TYPES.map((type) => {
        const slot = slotOf(slots, type)!;
        return {
          type,
          from: slot.from.toISOString(),
          to: slot.to.toISOString(),
          active: slot.active,
          feeAdult: slot.feeAdult,
          feeYouth: slot.feeYouth,
          payWithinMinutes: slot.payWithinMinutes,
        };
      }),
      standardPayUntil: standardPayUntil?.toISOString() ?? null,
      standardPayMailS,
      officeOpensS,
      onsiteUntilS,
    },
  });
  revalidateSlots();
  redirect({
    href: { pathname: "/admin/rocniky/[id]", params: { id: String(id) }, query: { terminy: "ok" } },
    locale,
  });
}
