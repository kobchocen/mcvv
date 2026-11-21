"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { getAccess, requireSection } from "@/lib/admin/access";
import {
  overrideKey,
  parseMatrixForm,
  planMatrixChange,
  resetChanges,
  type StoredLevel,
} from "@/lib/admin/permissions";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

async function loadOverrides(db: Prisma.TransactionClient): Promise<Map<string, StoredLevel>> {
  const rows = await db.roleSection.findMany({
    select: { role: true, sectionId: true, level: true },
  });
  const map = new Map<string, StoredLevel>();
  for (const row of rows) {
    if (row.level === "none" || row.level === "read" || row.level === "write") {
      map.set(overrideKey(row.role, row.sectionId), row.level);
    }
  }
  return map;
}

function done(locale: string, query: Record<string, string>): never {
  revalidatePath("/[locale]/admin", "layout");
  redirect({ href: { pathname: "/admin/opravneni", query }, locale });
  throw new Error("unreachable");
}

/**
 * Uloží matici oprávnění (P8, jen admin, jen při zapnutém `permissions.v2`). Do
 * `mcvv_role_section` jdou jen odchylky od výchozí matice; audit `permissions.changed`
 * s platnou úrovní před a po pro každou změněnou buňku.
 */
export async function savePermissions(formData: FormData): Promise<void> {
  const actor = await requireSection("permissions", "write");
  const locale = await getLocale();
  if (!(await getAccess()).v2) done(locale, { error: "off" });
  const submitted = parseMatrixForm(formData.entries());
  const changed = await prisma.$transaction(async (tx) => {
    // Zámek celé matice: dva admini současně neuloží proti zastaralému stavu.
    await tx.$queryRaw`SELECT role FROM mcvv_role_section FOR UPDATE`;
    const plan = planMatrixChange(await loadOverrides(tx), submitted);
    for (const row of plan.deletes) {
      await tx.roleSection.deleteMany({ where: { role: row.role, sectionId: row.sectionId } });
    }
    for (const row of plan.upserts) {
      await tx.roleSection.upsert({
        where: { role_sectionId: { role: row.role, sectionId: row.sectionId } },
        update: { level: row.level, updatedBy: actor.id },
        create: { role: row.role, sectionId: row.sectionId, level: row.level, updatedBy: actor.id },
      });
    }
    const count = Object.keys(plan.changes).length;
    if (count > 0) {
      await writeAudit(
        {
          actor,
          action: "permissions.changed",
          target: "permissions",
          detail: { changes: plan.changes },
          meta: { entity: "permissions" },
        },
        tx,
      );
    }
    return count;
  });
  done(locale, { saved: String(changed) });
}

/** Vrátí matici na výchozí (smaže všechny odchylky) s auditem `permissions.reset`. */
export async function resetPermissions(formData: FormData): Promise<void> {
  const actor = await requireSection("permissions", "write");
  const locale = await getLocale();
  if (!(await getAccess()).v2) done(locale, { error: "off" });
  if (formData.get("confirm") !== "1") done(locale, { error: "confirm" });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT role FROM mcvv_role_section FOR UPDATE`;
    const changes = resetChanges(await loadOverrides(tx));
    await tx.roleSection.deleteMany({});
    await writeAudit(
      {
        actor,
        action: "permissions.reset",
        target: "permissions",
        detail: { changes },
        meta: { entity: "permissions" },
      },
      tx,
    );
  });
  done(locale, { saved: "reset" });
}
