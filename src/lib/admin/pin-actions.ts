"use server";

import { revalidatePath } from "next/cache";

import { can, getAccess, requireSection } from "@/lib/admin/access";
import { isSectionId } from "@/lib/admin/permissions";
import { defaultPins, PIN_NONE, storedPins, togglePinList } from "@/lib/admin/pins";
import { prisma } from "@/lib/db/client";

/**
 * Hvězdička v panelu (P6): připne / odepne sekci pro přihlášený účet. Jen při zapnutém
 * `permissions.v2` a jen sekci, kterou účet smí číst. Bez auditu (osobní nastavení).
 */
export async function togglePin(formData: FormData): Promise<void> {
  const session = await requireSection("overview", "read");
  const access = await getAccess();
  if (!access.v2) return;
  const id = String(formData.get("sectionId") ?? "");
  if (!isSectionId(id) || !can(access, id, "read")) return;

  await prisma.$transaction(async (tx) => {
    const rows = await tx.userPin.findMany({
      where: { userId: session.id },
      select: { sectionId: true, pos: true },
    });
    const current = storedPins(rows) ?? defaultPins(access.grants);
    const next = togglePinList(current, id);
    await tx.userPin.deleteMany({ where: { userId: session.id } });
    await tx.userPin.createMany({
      data: (next.length ? next : [PIN_NONE]).map((sectionId, pos) => ({
        userId: session.id,
        sectionId,
        pos,
      })),
    });
  });
  revalidatePath("/[locale]/admin", "layout");
}
