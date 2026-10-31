"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { formInt, formString } from "@/lib/admin/parse";
import { requireStaff } from "@/lib/admin/staff";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/log";
import { startLineTarget } from "@/lib/audit/startlist";
import { prisma } from "@/lib/db/client";
import { isSpecialStartKind, parseOffset } from "@/lib/race/special-start";
import { partnerIdFromInput } from "@/lib/race/special-start-input";
import { redirect } from "@/i18n/routing";

const NOTE_MAX = 200;

export type SpecialStartError = "kind" | "partner" | "self" | "offset" | "note" | "line";

/** Kam se po uložení vrátit: detail přihlášky, přehled spec. startů, nebo startovka. */
async function back(data: FormData, year: number, query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  const from = formString(data, "from");
  const runnerId = formString(data, "runnerId");
  if (from === "startovka") {
    redirect({
      href: {
        pathname: "/admin/startovka",
        query: { rok: String(year), bezec: runnerId, ...query },
      },
      locale,
    });
  } else if (from === "prehled") {
    redirect({
      href: { pathname: "/admin/prihlasky/spec-starty", query: { rok: String(year), ...query } },
      locale,
    });
  } else {
    const registrationId = formInt(data, "registrationId");
    redirect({
      href: {
        pathname: "/admin/prihlasky/[rok]/[id]",
        params: { rok: String(year), id: String(registrationId ?? 0) },
        query: { ...query, bezec: runnerId },
      },
      locale,
    });
  }
  throw new Error("unreachable");
}

function revalidate() {
  revalidatePath("/[locale]/admin/startovka", "page");
  revalidatePath("/[locale]/admin/prihlasky", "page");
  revalidatePath("/[locale]/admin/prihlasky/spec-starty", "page");
  revalidatePath("/[locale]/admin/prihlasky/[rok]/[id]", "page");
}

function yearOf(data: FormData): number | null {
  const year = formInt(data, "year");
  return year && year >= 2000 && year <= 2100 ? year : null;
}

/**
 * Uloží spec. start běžce (dialog v administraci přihlášek). Typ `none` = zrušit. U „spolu s“
 * musí být partner přihlášený ve stejném ročníku a nesmí to být on sám. Audit `startlist.special_set`
 * / `startlist.special_cleared` s před / po.
 */
export async function saveSpecialStart(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = yearOf(formData);
  const runnerId = formString(formData, "runnerId");
  if (!year || !/^\d{8}$/.test(runnerId)) {
    return;
  }
  const line = await prisma.registrationLine.findUnique({
    where: { year_runnerId: { year, runnerId } },
    select: { registrationId: true },
  });
  if (!line) {
    return back(formData, year, { spec: "chyba", duvod: "line" });
  }
  const before = await prisma.specialStart.findUnique({
    where: { year_runnerId: { year, runnerId } },
  });
  const snapshot = (row: typeof before) =>
    row
      ? {
          kind: row.kind,
          partnerId: row.partnerId,
          offsetSeconds: row.offsetSeconds,
          note: row.note,
        }
      : { kind: null, partnerId: null, offsetSeconds: null, note: null };
  const kind = formString(formData, "kind");

  if (formString(formData, "clear") === "1" || kind === "none" || kind === "") {
    if (before) {
      await prisma.specialStart.delete({ where: { year_runnerId: { year, runnerId } } });
      await writeAudit({
        actor: session,
        action: "startlist.special_cleared",
        target: startLineTarget(year, runnerId),
        detail: {
          year,
          runnerId,
          registrationId: line.registrationId,
          changes: diffFields(snapshot(before), snapshot(null)),
        },
      });
      revalidate();
    }
    return back(formData, year, { spec: "zruseno" });
  }
  if (!isSpecialStartKind(kind)) {
    return back(formData, year, { spec: "chyba", duvod: "kind" });
  }
  const note = formString(formData, "note").trim();
  if (note.length > NOTE_MAX) {
    return back(formData, year, { spec: "chyba", duvod: "note" });
  }
  let partnerId: string | null = null;
  let offsetSeconds = 0;
  if (kind === "with") {
    partnerId = partnerIdFromInput(formString(formData, "partner"));
    if (!partnerId) {
      return back(formData, year, { spec: "chyba", duvod: "partner" });
    }
    if (partnerId === runnerId) {
      return back(formData, year, { spec: "chyba", duvod: "self" });
    }
    const partnerLine = await prisma.registrationLine.findUnique({
      where: { year_runnerId: { year, runnerId: partnerId } },
      select: { runnerId: true },
    });
    if (!partnerLine) {
      return back(formData, year, { spec: "chyba", duvod: "partner" });
    }
    const offset = parseOffset(formString(formData, "offset"));
    if (offset == null) {
      return back(formData, year, { spec: "chyba", duvod: "offset" });
    }
    offsetSeconds = offset;
  }
  const data = {
    kind,
    partnerId,
    offsetSeconds,
    note: note || null,
  };
  const after = await prisma.specialStart.upsert({
    where: { year_runnerId: { year, runnerId } },
    update: data,
    create: { year, runnerId, ...data },
  });
  const changes = diffFields(snapshot(before), snapshot(after));
  if (Object.keys(changes).length > 0) {
    await writeAudit({
      actor: session,
      action: "startlist.special_set",
      target: startLineTarget(year, runnerId),
      detail: { year, runnerId, registrationId: line.registrationId, changes },
    });
  }
  revalidate();
  return back(formData, year, { spec: "ulozeno" });
}
